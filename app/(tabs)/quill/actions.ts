"use server";

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, generateText } from "ai";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { ensureScribe } from "@/lib/auth/scribe";
import { getDb, schema } from "@/lib/db";

export type TextColour = {
  hue: number;
  saturation: number;
  lightness: number;
  justification: string;
};

export type TargetRewrite = {
  rewrite: string;
};

const ResponseSchema = z.object({
  hue: z.number().int().min(0).max(360),
  saturation: z.number().int().min(0).max(100),
  lightness: z.number().int().min(0).max(100),
  justification: z.string().min(3).max(120),
});

const SYSTEM_PROMPT = `You are a synaesthetic critic mapping prose to colours.

Read the user's text and return an HSL colour that captures its *feel* — emotional temperature, atmosphere, texture — plus a 4–8 word justification.

Rules:
- Hue (0–360): warm hues (0–60, 330–360) for passion, danger, intimacy; yellows/greens (60–180) for nature, comedy, ease; cool hues (180–270) for contemplation, distance, irony; purples (270–330) for the surreal, gothic, ornate.
- Saturation (0–100): restrained, elliptical writing → low (30–50); vivid, sensory, ornate → high (60–90).
- Lightness (40–75): dense, brooding → 40–55; airy, comic, lyrical → 60–75. Stay in this range — the canvas reads as ink on paper, not neon.
- Justification: a 4–8 word phrase like "warm, melancholy, restrained". No periods, no sentences.

Lean on the actual feel of the prose. Don't moralise — just see the colour.`;

const MIN_WORDS = 8;

/**
 * Debounced from the Quill editor — given the user's draft, returns the
 * Claude-derived HSL + a short justification. Returns null if the text is
 * too short to be meaningful (under {@link MIN_WORDS} words).
 *
 * Costs ~$0.002 per call on Sonnet 4.6. The Quill page debounces 700 ms
 * after the last keystroke so a typing burst is one call, not dozens.
 */
export async function deriveTextColour(rawText: string): Promise<TextColour | null> {
  const text = stripHtml(rawText).trim();
  if (countWords(text) < MIN_WORDS) return null;

  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-6"),
    schema: ResponseSchema,
    system: SYSTEM_PROMPT,
    prompt: text,
    maxRetries: 2,
  });
  return object;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Target mode — #38. Player describes a target ("warm, melancholy",
// "Hemingway-like", "lush, baroque") and Claude rewrites the current draft
// to feel like it, preserving meaning, length, and structure.
// ---------------------------------------------------------------------------

const REWRITE_SYSTEM_PROMPT = `You are a careful prose editor. The writer has typed a draft and wants you to nudge it toward a target — a colour, a mood, an author's voice, anything they describe.

Rewrite the draft so it FEELS like the target while preserving:
- the writer's intent and meaning
- roughly the same length (within ±20%)
- the same number of paragraphs
- proper grammar and punctuation
- the writer's chosen tense and POV

Make changes at the level of word choice, sentence rhythm, image-density, and connective tissue. Don't add new facts, characters, or events. Don't moralise. Don't preface the rewrite with explanation or commentary.

Return ONLY the rewritten prose. No quotes around it, no "Here's the rewrite:" preamble, no trailing notes.`;

/**
 * Asks Claude to rewrite the user's draft toward a free-form target descriptor.
 * Returns just the rewritten text — the client diffs it against the original
 * and lets the user accept or reject.
 */
export async function suggestRewrite(input: {
  text: string;
  target: string;
}): Promise<TargetRewrite | null> {
  const text = stripHtml(input.text).trim();
  const target = input.target.trim();
  if (countWords(text) < MIN_WORDS) return null;
  if (target.length === 0) return null;

  const { text: rewrite } = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    system: REWRITE_SYSTEM_PROMPT,
    prompt: `Target: ${target}\n\nOriginal:\n${text}`,
    maxRetries: 2,
  });
  return { rewrite: rewrite.trim() };
}

// ---------------------------------------------------------------------------
// Cloud-saved drafts (#71). Privacy default from #45: local-only with an
// explicit opt-in to cloud save — these endpoints only fire when the user
// has flipped the toggle in the Quill sidebar.
// ---------------------------------------------------------------------------

export type CloudDraft = { text: string; updatedAt: Date } | null;

/**
 * Upserts the scribe's current draft. We keep at most one row per scribe so
 * revisits land back on the same row instead of accumulating snapshots —
 * `quill_samples` has no unique constraint on `scribeId`, so application
 * code enforces the invariant (find-and-update, else insert). Empty text
 * is treated as "delete the saved draft" — see deleteCloudDraft.
 */
export async function saveCloudDraft(text: string): Promise<{ updatedAt: Date }> {
  if (text.trim().length === 0) {
    await deleteCloudDraft();
    return { updatedAt: new Date() };
  }

  const scribe = await ensureScribe();
  const db = getDb();

  const [existing] = await db
    .select({ id: schema.quillSamples.id })
    .from(schema.quillSamples)
    .where(eq(schema.quillSamples.scribeId, scribe.id))
    .limit(1);

  const now = new Date();
  if (existing) {
    await db
      .update(schema.quillSamples)
      .set({ text, updatedAt: now })
      .where(eq(schema.quillSamples.id, existing.id));
  } else {
    await db.insert(schema.quillSamples).values({ scribeId: scribe.id, text });
  }
  return { updatedAt: now };
}

/**
 * Loads the scribe's most recent cloud-saved draft, if any. Called on /quill
 * mount when the cloud-save toggle is on, so the writer comes back to where
 * they left off across devices.
 */
export async function loadCloudDraft(): Promise<CloudDraft> {
  const scribe = await ensureScribe();
  const db = getDb();
  const [row] = await db
    .select({ text: schema.quillSamples.text, updatedAt: schema.quillSamples.updatedAt })
    .from(schema.quillSamples)
    .where(eq(schema.quillSamples.scribeId, scribe.id))
    .orderBy(desc(schema.quillSamples.updatedAt))
    .limit(1);
  return row ? { text: row.text, updatedAt: row.updatedAt } : null;
}

/**
 * Deletes the scribe's cloud-saved draft. Fired when the writer turns the
 * cloud-save toggle off — privacy-first: if it's off, the text is gone
 * from the server.
 */
export async function deleteCloudDraft(): Promise<void> {
  const scribe = await ensureScribe();
  const db = getDb();
  await db.delete(schema.quillSamples).where(eq(schema.quillSamples.scribeId, scribe.id));
}
