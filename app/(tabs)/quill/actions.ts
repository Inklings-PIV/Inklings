"use server";

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject, generateText } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { ensureScribe } from "@/lib/auth/scribe";
import { getDb, schema } from "@/lib/db";
import { rewriteFromDiff, type TargetRewrite } from "@/lib/quill/diff";
import { type HueSegment, tileInfluences } from "@/lib/quill/explain";
import { fingerprintDistance } from "@/lib/quill/fingerprint";
import { clampForModel, MAX_BAND_PARAGRAPHS } from "@/lib/quill/limits";
import { type ClassicalFeatures, extractClassical } from "@/lib/stylometry/classical";

export type { TargetRewrite } from "@/lib/quill/diff";

export type TextColour = {
  hue: number;
  saturation: number;
  lightness: number;
  justification: string;
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
    prompt: clampForModel(text),
    maxRetries: 2,
  });
  return object;
}

/**
 * Maps a short target descriptor — a colour name, mood, or author's voice
 * ("warm, melancholy", "Hemingway-like") — to its HSL, for the "drift to
 * target" meter (#5). Same synaesthetic mapping as {@link deriveTextColour},
 * but without the word floor: targets are deliberately terse. The page resolves
 * common colour words locally first (named-colours) and only calls this for
 * descriptors the lexicon doesn't cover, so it fires at most once per target.
 */
export async function deriveTargetColour(target: string): Promise<TextColour | null> {
  const aim = target.trim();
  if (aim.length === 0) return null;

  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-6"),
    schema: ResponseSchema,
    system: SYSTEM_PROMPT,
    prompt: clampForModel(aim),
    maxRetries: 2,
  });
  return object;
}

const EXPLAIN_SYSTEM_PROMPT = `You earlier mapped this prose to a single colour. Now explain that colour: pick the words and short phrases that MOST drive it — the ones that, if removed or changed, would shift the hue.

For each, return:
- "text": the exact substring, copied verbatim from the prose (same case, punctuation and spacing). A few words at most.
- "weight": a number from -1 to 1. Positive = defines or intensifies the colour; negative = pulls against it (a note cutting across the dominant feel). Use the full range.
- "reason": 2–6 words on why, e.g. "menacing adjectives", "warm domestic image". No period.

Return the 3–8 strongest. Don't cover every word — only what actually moves the colour. Quote substrings exactly so they can be located in the text.`;

const ExplainResponseSchema = z.object({
  influences: z
    .array(
      z.object({
        text: z.string().min(1).max(120),
        weight: z.number().min(-1).max(1),
        reason: z.string().min(2).max(80),
      }),
    )
    .max(12),
});

export type { HueSegment } from "@/lib/quill/explain";

/**
 * Counterfactual explanation of the draft's hue (#2): the words and phrases that
 * most drive (or fight) the colour, tiled back over the analysed text so the
 * client can shade an inline heatmap and show each phrase's reason. Same cost
 * profile and word floor as {@link deriveTextColour}; the page debounces it
 * behind a "Why this colour?" toggle. The model only quotes the influential
 * phrases — {@link tileInfluences} reconstructs the full text, so a loose quote
 * degrades to "phrase dropped", never a corrupted overlay.
 */
export async function explainHue(rawText: string): Promise<HueSegment[] | null> {
  const text = stripHtml(rawText).trim();
  if (countWords(text) < MIN_WORDS) return null;

  const clamped = clampForModel(text);
  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-6"),
    schema: ExplainResponseSchema,
    system: EXPLAIN_SYSTEM_PROMPT,
    prompt: clamped,
    maxRetries: 2,
  });
  return tileInfluences(clamped, object.influences);
}

/**
 * Per-paragraph hues for the EmoArc band (B5). Derives a colour for each
 * paragraph in parallel so the writer sees the stylistic arc across the text,
 * not just one global swatch. Paragraphs too short to read return null (the
 * band renders them neutral). Callers pass only the paragraphs they don't
 * already have cached, so a typing burst re-derives at most the edited block.
 */
export async function deriveParagraphHues(paragraphs: string[]): Promise<(TextColour | null)[]> {
  // Cap the fan-out so a very long draft can't trigger an unbounded burst of
  // model calls; paragraphs past the limit stay neutral in the band.
  return Promise.all(paragraphs.slice(0, MAX_BAND_PARAGRAPHS).map((p) => deriveTextColour(p)));
}

/**
 * Classical stylometric fingerprint of the writer's draft (style-level feature).
 * Pure CPU via wink-nlp — no LLM, no network — so the Quill can show the writer
 * their own style numbers (the same fingerprint the Inkwell shows per author)
 * live while typing. Returns null when the draft is too short to be meaningful.
 */
export async function deriveDraftStylometry(rawText: string): Promise<ClassicalFeatures | null> {
  const text = stripHtml(rawText).trim();
  if (countWords(text) < MIN_WORDS) return null;
  return extractClassical(text);
}

export type StyleNeighbour = {
  bookId: string;
  title: string;
  authorName: string;
  /** Euclidean fingerprint distance — smaller is closer. */
  distance: number;
  hue: { hue: number; saturation: number; lightness: number } | null;
};

/**
 * The corpus books whose stylometric fingerprint is closest to the writer's
 * draft (style-level, S4) — "your prose writes most like these". Reuses the
 * classical fingerprint distance the Inkwell layout is built on, so the answer
 * is consistent with the canvas. Returns [] when the draft is too short or no
 * corpus is loaded.
 */
export async function nearestAuthors(rawText: string, limit = 5): Promise<StyleNeighbour[]> {
  const text = stripHtml(rawText).trim();
  if (countWords(text) < MIN_WORDS) return [];
  const mine = extractClassical(text);

  const db = getDb();
  const blended = alias(schema.bookColours, "blended_colours");
  const rows = await db
    .select({
      bookId: schema.books.id,
      title: schema.books.title,
      authorName: schema.authors.name,
      classical: schema.bookFeatures.classical,
      h: blended.hue,
      s: blended.saturation,
      l: blended.lightness,
    })
    .from(schema.books)
    .innerJoin(schema.authors, eq(schema.books.authorId, schema.authors.id))
    .leftJoin(schema.bookFeatures, eq(schema.bookFeatures.bookId, schema.books.id))
    .leftJoin(blended, and(eq(blended.bookId, schema.books.id), eq(blended.source, "blended")))
    .where(eq(schema.books.status, "ready"));

  return rows
    .flatMap((r) => {
      const classical = r.classical as ClassicalFeatures | null;
      if (!classical) return [];
      return [
        {
          bookId: r.bookId,
          title: r.title,
          authorName: r.authorName,
          distance: fingerprintDistance(mine, classical),
          hue:
            r.h != null && r.s != null && r.l != null
              ? { hue: r.h, saturation: r.s, lightness: r.l }
              : null,
        },
      ];
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
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

Make changes at the level of word choice, sentence rhythm, image-density, and connective tissue. Don't add new facts, characters, or events. Don't moralise.

Return your answer as an aligned diff plus a short list of named nudges:

- "diff": an ordered list of text segments that, read together, spell out BOTH the
  original and the rewrite. Each segment has "op":
    - "same"   — unchanged text shared by both versions (include the surrounding
                 untouched words, punctuation and spaces verbatim)
    - "remove" — text present in the ORIGINAL but cut or toned down
    - "add"    — text present only in the REWRITE
  Keep segments tight: wrap only the words that actually changed in remove/add,
  and put a remove immediately before its replacement add. Preserve all
  whitespace inside segments so the views read naturally. Concatenating every
  non-"remove" segment MUST equal the rewritten prose; concatenating every
  non-"add" segment MUST equal the original prose exactly.

- "nudges": 1–4 named changes you made toward the target, each a short "label"
  (2–4 words, e.g. "Softened intensity", "Grounded imagery") and a one-line
  "reason" describing what it did. No periods required.`;

const RewriteResponseSchema = z.object({
  diff: z
    .array(
      z.object({
        text: z.string(),
        op: z.enum(["same", "add", "remove"]),
      }),
    )
    .min(1),
  nudges: z
    .array(
      z.object({
        label: z.string().min(2).max(40),
        reason: z.string().min(3).max(160),
      }),
    )
    .min(1)
    .max(4),
});

/**
 * Asks Claude to rewrite the user's draft toward a free-form target descriptor.
 * Returns a structured, explainable rewrite — an aligned word-level diff plus a
 * list of named nudges — so the client can show green/pink highlighting and a
 * "Nudges Applied" panel (pitch p7) instead of an opaque text swap. The full
 * rewrite text is reconstructed from the diff, keeping all three views in sync.
 */
export async function suggestRewrite(input: {
  text: string;
  target: string;
}): Promise<TargetRewrite | null> {
  const text = stripHtml(input.text).trim();
  const target = input.target.trim();
  if (countWords(text) < MIN_WORDS) return null;
  if (target.length === 0) return null;

  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-6"),
    schema: RewriteResponseSchema,
    system: REWRITE_SYSTEM_PROMPT,
    prompt: `Target: ${target}\n\nOriginal:\n${clampForModel(text)}`,
    maxRetries: 2,
  });

  return {
    diff: object.diff,
    nudges: object.nudges,
    rewrite: rewriteFromDiff(object.diff).trim(),
  };
}

// ---------------------------------------------------------------------------
// Selection rewrite — powers the editor's right-click "Rewrite" presets. Unlike
// suggestRewrite (whole draft, structured diff), this rewrites a short selected
// span and returns plain prose to drop straight back in place.
// ---------------------------------------------------------------------------

const SELECTION_REWRITE_PROMPT = `You are a careful prose editor. Rewrite the given passage toward the target while preserving its meaning, tense, and point of view, and keeping roughly the same length. Change only word choice, rhythm, and imagery — add no new facts.

Return ONLY the rewritten passage. No quotes, no preamble, no commentary.`;

const SELECTION_MIN_WORDS = 3;

/**
 * Rewrites a selected passage toward a free-form target (e.g. a right-click
 * preset like "tighter and leaner"). Returns plain text, or null when the
 * selection is too short or the target is empty.
 */
export async function rewriteSelection(text: string, target: string): Promise<string | null> {
  const passage = text.trim();
  const aim = target.trim();
  if (countWords(passage) < SELECTION_MIN_WORDS || aim.length === 0) return null;

  const { text: out } = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    system: SELECTION_REWRITE_PROMPT,
    prompt: `Target: ${aim}\n\nPassage:\n${clampForModel(passage)}`,
    maxRetries: 2,
  });
  return out.trim();
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
