// Excerpt selection — #54. Pulls a representative passage from a book for
// the game's "smudge", the Quill's target seeds, and excerpt-grounded LLM
// colour (#66). Cached per (bookId, strategy) so every player sees the same
// passage and we don't refetch Gutenberg text on every round.

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { fetchBookText } from "@/lib/ingestion/gutenberg-text";
import { embedText } from "@/lib/stylometry/embed";

export type ExcerptStrategy = "random" | "first-page" | "longest-paragraph" | "representative";

const DEFAULT_TARGET_WORDS = 350;

/** Strategy applied if the caller doesn't specify one. */
const DEFAULT_STRATEGY: ExcerptStrategy = "longest-paragraph";

/**
 * Resolve an excerpt for the given book. Reads the cached row if present;
 * otherwise fetches the text, runs the strategy, caches, returns.
 */
export async function chooseExcerpt(
  bookId: string,
  opts: { strategy?: ExcerptStrategy; targetWords?: number } = {},
): Promise<string> {
  const strategy = opts.strategy ?? DEFAULT_STRATEGY;
  const targetWords = opts.targetWords ?? DEFAULT_TARGET_WORDS;
  const db = getDb();

  const [cached] = await db
    .select({ excerpt: schema.bookExcerpts.excerpt })
    .from(schema.bookExcerpts)
    .where(and(eq(schema.bookExcerpts.bookId, bookId), eq(schema.bookExcerpts.strategy, strategy)))
    .limit(1);
  if (cached?.excerpt) return cached.excerpt;

  // Need the Gutenberg ID to refetch text. Future: cache text alongside the
  // book row, or store a text-extract per book. For now, slow path is fine
  // because the cache populates after the first call.
  const [book] = await db
    .select({ gutenbergId: schema.books.gutenbergId })
    .from(schema.books)
    .where(eq(schema.books.id, bookId))
    .limit(1);
  if (!book?.gutenbergId) {
    throw new Error(`book ${bookId} has no gutenbergId — can't fetch text`);
  }

  const text = await fetchBookText(book.gutenbergId);
  if (!text) throw new Error(`book ${bookId} (#${book.gutenbergId}) has no fetchable text`);

  const excerpt = await runStrategy(strategy, text, { targetWords, bookId, db });

  await db
    .insert(schema.bookExcerpts)
    .values({ bookId, strategy, excerpt })
    .onConflictDoUpdate({
      target: [schema.bookExcerpts.bookId, schema.bookExcerpts.strategy],
      set: { excerpt, computedAt: new Date() },
    });

  return excerpt;
}

async function runStrategy(
  strategy: ExcerptStrategy,
  text: string,
  ctx: { targetWords: number; bookId: string; db: ReturnType<typeof getDb> },
): Promise<string> {
  switch (strategy) {
    case "random":
      return randomExcerpt(text, { targetWords: ctx.targetWords, bookId: ctx.bookId });
    case "first-page":
      return firstPageExcerpt(text, { targetWords: ctx.targetWords });
    case "longest-paragraph":
      return longestParagraphExcerpt(text, { targetWords: ctx.targetWords });
    case "representative":
      return representativeExcerpt(text, ctx);
  }
}

// ---------------------------------------------------------------------------
// Pure strategy functions (also exported for direct testing)
// ---------------------------------------------------------------------------

/**
 * Pick a window starting at a deterministic offset within the book's middle
 * 60% (avoiding opening/closing pages). Seeded by `bookId` so the same book
 * returns the same passage even without the DB cache.
 */
export function randomExcerpt(text: string, opts: { targetWords: number; bookId: string }): string {
  const paragraphs = meaningfulParagraphs(parseParagraphs(text));
  if (paragraphs.length === 0) return text.slice(0, opts.targetWords * 6);

  const middle = paragraphs.slice(
    Math.floor(paragraphs.length * 0.2),
    Math.floor(paragraphs.length * 0.8),
  );
  const pool = middle.length > 0 ? middle : paragraphs;
  const seed = hashString(opts.bookId);
  const startIdx = pool === paragraphs ? seed % paragraphs.length : seed % pool.length;
  const startInFull = pool === paragraphs ? startIdx : paragraphs.indexOf(pool[startIdx] ?? "");
  return takeWindow(paragraphs, Math.max(0, startInFull), opts.targetWords);
}

/**
 * The first substantial passage after any preface/table-of-contents-style
 * residue. Useful for genre-recognisable openings.
 */
export function firstPageExcerpt(text: string, opts: { targetWords: number }): string {
  const paragraphs = meaningfulParagraphs(parseParagraphs(text));
  if (paragraphs.length === 0) return text.slice(0, opts.targetWords * 6);
  // Skip the first 5% which often holds dedications, mottos, or short
  // chapter-zero prefatory bits even after Gutenberg boilerplate stripping.
  const startIdx = Math.min(paragraphs.length - 1, Math.floor(paragraphs.length * 0.05));
  return takeWindow(paragraphs, startIdx, opts.targetWords);
}

/**
 * The longest paragraph in the book's middle 60%, plus enough surrounding
 * context to hit the target word count. Long paragraphs tend to carry the
 * book's most characteristic prose (dialogue and chapter headers are short).
 */
export function longestParagraphExcerpt(text: string, opts: { targetWords: number }): string {
  const paragraphs = meaningfulParagraphs(parseParagraphs(text));
  if (paragraphs.length === 0) return text.slice(0, opts.targetWords * 6);

  const lo = Math.floor(paragraphs.length * 0.2);
  const hi = Math.floor(paragraphs.length * 0.8);
  let bestIdx = lo;
  let bestLen = -1;
  for (let i = lo; i < hi; i++) {
    const len = countWords(paragraphs[i] ?? "");
    if (len > bestLen) {
      bestLen = len;
      bestIdx = i;
    }
  }
  return takeWindow(paragraphs, bestIdx, opts.targetWords);
}

/**
 * Embed each candidate paragraph in the book's middle 60% and pick the one
 * whose embedding is nearest to the whole-book embedding (read from
 * book_features). That's the "semantically most representative" passage.
 */
export async function representativeExcerpt(
  text: string,
  ctx: { targetWords: number; bookId: string; db: ReturnType<typeof getDb> },
): Promise<string> {
  const paragraphs = meaningfulParagraphs(parseParagraphs(text));
  if (paragraphs.length === 0) return text.slice(0, ctx.targetWords * 6);

  const lo = Math.floor(paragraphs.length * 0.2);
  const hi = Math.floor(paragraphs.length * 0.8);
  const candidates = paragraphs.slice(lo, hi);
  if (candidates.length === 0) return takeWindow(paragraphs, 0, ctx.targetWords);

  const [features] = await ctx.db
    .select({ embedding: schema.bookFeatures.embedding })
    .from(schema.bookFeatures)
    .where(eq(schema.bookFeatures.bookId, ctx.bookId))
    .limit(1);
  if (!features?.embedding) {
    // No book embedding yet — fall back to longest-paragraph which is at least deterministic.
    return longestParagraphExcerpt(text, { targetWords: ctx.targetWords });
  }
  const bookVec = features.embedding;

  // Embed each candidate paragraph individually. Tiny cost vs. the value of
  // matching the game/Quill smudge to the book's actual semantic centre.
  let bestIdx = 0;
  let bestSim = -Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const para = candidates[i] ?? "";
    const vec = await embedText(para);
    const sim = cosineSimilarity(vec, bookVec);
    if (sim > bestSim) {
      bestSim = sim;
      bestIdx = i;
    }
  }
  return takeWindow(paragraphs, lo + bestIdx, ctx.targetWords);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

export function parseParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
}

/**
 * Drop chapter headings, page numbers, and other very-short paragraphs that
 * survive Gutenberg boilerplate stripping but make rotten excerpts.
 */
export function meaningfulParagraphs(paragraphs: string[]): string[] {
  return paragraphs.filter((p) => {
    if (countWords(p) < 20) return false;
    // ALL CAPS / Roman numeral chapter headers.
    if (/^(CHAPTER|BOOK|PART|VOLUME)\b/i.test(p) && countWords(p) < 12) return false;
    return true;
  });
}

/** Take paragraphs starting at `startIdx`, walking forward until we reach `targetWords`. */
export function takeWindow(paragraphs: string[], startIdx: number, targetWords: number): string {
  const out: string[] = [];
  let words = 0;
  for (let i = startIdx; i < paragraphs.length && words < targetWords; i++) {
    const p = paragraphs[i];
    if (!p) continue;
    out.push(p);
    words += countWords(p);
  }
  return out.join("\n\n");
}

export function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** Stable hash from a string id (same as `shapeForId` in lib/canvas). */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dim = Math.min(a.length, b.length);
  let dot = 0;
  let aLen = 0;
  let bLen = 0;
  for (let i = 0; i < dim; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    aLen += ai * ai;
    bLen += bi * bi;
  }
  const denom = Math.sqrt(aLen) * Math.sqrt(bLen);
  return denom === 0 ? 0 : dot / denom;
}
