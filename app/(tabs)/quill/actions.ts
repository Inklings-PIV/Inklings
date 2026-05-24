"use server";

import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";

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
