// LLM colour deriver (#25) — asks Claude to map a book's title, author, and
// stylometric fingerprint to an HSL colour with a one-line justification.
//
// Per-call I/O is small enough that this can run inline in the ingest
// pipeline (~1k tokens in, ~50 out, ~$0.002 on Sonnet 4.6). Excerpt-grounded
// derivation is a follow-up (#54 excerpt selection + dependent ticket).

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import type { ClassicalFeatures } from "@/lib/stylometry/classical";

export type LLMColour = {
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

const SYSTEM_PROMPT = `You are a synaesthetic critic mapping books to colours.

Given a book and its stylometric fingerprint, return an HSL colour that captures the book's *feel* — its emotional tone, atmosphere, and texture — plus a one-line justification.

Rules:
- Hue (0–360): the emotional temperature. Warm hues (0–60, 330–360) for passion, danger, intimacy. Yellows/greens (60–180) for nature, comedy, ease. Cool hues (180–270) for contemplation, distance, irony. Purples (270–330) for the surreal, gothic, ornate.
- Saturation (0–100): the boldness of the prose. Restrained, elliptical writing → low sat (30–50). Vivid, sensory, ornate → high (60–90).
- Lightness (40–75): the texture's weight in an ink-on-paper palette. Dense, brooding, dark → 40–55. Airy, comic, lyrical → 60–75. Stay in this range — the canvas reads as ink, not neon.
- Justification: a 4–8 word phrase like "warm, melancholy, restrained" or "lush, comic, baroque". No periods, no sentences.

Lean on what you know about the book *as a whole* — its world, tone, and reception — not just the title.`;

export async function deriveLLM(input: {
  title: string;
  authorName: string;
  classical: ClassicalFeatures | null;
}): Promise<LLMColour> {
  const userPrompt = buildPrompt(input);
  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-6"),
    schema: ResponseSchema,
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    maxRetries: 3,
  });
  return object;
}

function buildPrompt(input: {
  title: string;
  authorName: string;
  classical: ClassicalFeatures | null;
}): string {
  const lines = [`Title: ${input.title}`, `Author: ${input.authorName}`];

  if (input.classical) {
    const c = input.classical;
    const sl = c.sentenceLength;
    const p = c.punctuation;
    lines.push(
      "",
      "Stylometry:",
      `- mean sentence length: ${sl.mean.toFixed(1)} words (std ${sl.std.toFixed(1)})`,
      `- MTLD (vocab richness): ${c.mtld.toFixed(1)}`,
      `- punctuation per 1k words: comma ${p.comma.toFixed(1)}, semicolon ${p.semicolon.toFixed(1)}, em-dash ${p.emDash.toFixed(1)}, exclamation ${p.exclamationMark.toFixed(1)}, question ${p.questionMark.toFixed(1)}`,
    );
  }

  return lines.join("\n");
}
