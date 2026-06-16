// Live writing stats for the Quill (super-feature F1). Pure and deterministic —
// derived from the draft's plain text, no model or network. Gives the writer an
// at-a-glance sense of size and pace while they work.

export type WritingStats = {
  words: number;
  sentences: number;
  characters: number;
  /** Estimated reading time in minutes (≥1 once there's any text). */
  readingMinutes: number;
  /** Mean words per sentence (0 when empty). */
  avgSentenceWords: number;
};

const WORDS_PER_MINUTE = 200;

const EMPTY: WritingStats = {
  words: 0,
  sentences: 0,
  characters: 0,
  readingMinutes: 0,
  avgSentenceWords: 0,
};

/** Compute writing stats from plain text (caller strips any HTML first). */
export function computeWritingStats(text: string): WritingStats {
  const trimmed = text.trim();
  if (trimmed.length === 0) return EMPTY;

  const words = trimmed.split(/\s+/).filter(Boolean).length;
  const characters = trimmed.replace(/\s/g, "").length;
  // Sentence-terminating runs; clamp to ≥1 so a fragment still counts as one.
  const sentenceMatches = trimmed.match(/[.!?]+(?:\s|$)/g)?.length ?? 0;
  const sentences = Math.max(1, sentenceMatches);
  const readingMinutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  const avgSentenceWords = words / sentences;

  return { words, sentences, characters, readingMinutes, avgSentenceWords };
}
