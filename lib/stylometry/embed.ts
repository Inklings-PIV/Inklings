// OpenAI text-embedding-3-small wrapper for full-book embeddings.
//
// Long books exceed the 8k-token input limit, so we chunk by character
// count (~32k chars ≈ 8k tokens, conservative for English prose), embed
// every chunk in one parallel `embedMany` call, and mean-average the
// resulting vectors into a single 1536-d book embedding.
//
// Mean-pooling is the standard treatment for averaging dense sentence/
// chunk vectors into a document vector — preserves topic centre-of-mass
// without inheriting any particular chunk's bias.

import { openai } from "@ai-sdk/openai";
import { embedMany } from "ai";

export const EMBEDDING_DIM = 1536;

/**
 * Per-chunk char cap. OpenAI's text-embedding-3 input limit is 8192 tokens;
 * English prose averages ~4 chars/token, but older/denser prose runs hotter,
 * so we cap at 24k chars (~6k tokens) for safety margin.
 */
const CHAR_BUDGET = 24_000;

/**
 * OpenAI caps an `embedMany` request at 300k total tokens. Long books
 * (Les Misérables ~800k tokens) blow past this in one call, so we batch
 * chunks into ≤ 900k-char requests (~260k tokens with our pessimistic
 * 3.5 chars/token estimate — denser than newsroom English).
 */
const MAX_CHARS_PER_REQUEST = 900_000;

/**
 * Retry budget per request — high enough that exponential backoff
 * (1, 2, 4, 8, 16, 32, 64, 128, 256, 512s) can ride through TPM-cap
 * stalls that take a full window to clear.
 */
const MAX_RETRIES = 10;

/**
 * OpenAI tier-1 cap is 1M tokens-per-minute on a *rolling* window. We target
 * 700k/min internally so a slightly-off token estimate on dense prose doesn't
 * spill over the real cap.
 */
const SAFE_TPM = 700_000;
const TPM_WINDOW_MS = 60_000;
const CHARS_PER_TOKEN_PESSIMISTIC = 3.5;

/**
 * Module-level rolling window of recent embedMany calls so consecutive books
 * in a batch script (e.g. backfill-embeddings.ts) share rate-limit state and
 * don't blow the cap by being unaware of each other.
 */
const recentRequests: Array<{ at: number; tokens: number }> = [];

function estimateTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN_PESSIMISTIC);
}

async function waitForTpmHeadroom(estimatedTokens: number): Promise<void> {
  while (true) {
    const now = Date.now();
    while (recentRequests.length > 0) {
      const head = recentRequests[0];
      if (!head || now - head.at < TPM_WINDOW_MS) break;
      recentRequests.shift();
    }
    const used = recentRequests.reduce((s, r) => s + r.tokens, 0);
    if (used + estimatedTokens <= SAFE_TPM) {
      recentRequests.push({ at: Date.now(), tokens: estimatedTokens });
      return;
    }
    // Wait until the oldest request ages out of the window (+ small buffer).
    const oldest = recentRequests[0];
    if (!oldest) return; // shouldn't happen given the check above
    const waitMs = TPM_WINDOW_MS - (now - oldest.at) + 500;
    await sleep(waitMs);
  }
}

const MODEL = openai.embedding("text-embedding-3-small");

export async function embedText(text: string): Promise<number[]> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return zeroVector();

  const chunks = chunkText(trimmed, CHAR_BUDGET);
  const embeddings = await embedChunksBatched(chunks);
  return meanVector(embeddings);
}

/**
 * Splits chunks into requests that stay under OpenAI's per-call token cap.
 * Uses a module-level rolling-window tracker so consecutive embed calls
 * (multiple books in one process) honour the per-minute TPM cap together.
 */
export async function embedChunksBatched(chunks: readonly string[]): Promise<number[][]> {
  const out: number[][] = [];
  let batch: string[] = [];
  let batchChars = 0;

  const flush = async () => {
    await waitForTpmHeadroom(estimateTokens(batchChars));
    const { embeddings } = await embedMany({
      model: MODEL,
      values: batch,
      maxRetries: MAX_RETRIES,
    });
    out.push(...embeddings);
    batch = [];
    batchChars = 0;
  };

  for (const chunk of chunks) {
    if (batch.length > 0 && batchChars + chunk.length > MAX_CHARS_PER_REQUEST) {
      await flush();
    }
    batch.push(chunk);
    batchChars += chunk.length;
  }
  if (batch.length > 0) await flush();
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Split text into ≤ `max`-char chunks, preferring sentence-end breaks
 * within a 200-char look-back so we don't slice mid-sentence.
 */
export function chunkText(text: string, max: number): string[] {
  if (text.length <= max) return [text];

  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(text.length, i + max);
    if (end < text.length) {
      const lookback = text.slice(Math.max(i, end - 200), end);
      const lastSentence = Math.max(
        lookback.lastIndexOf(". "),
        lookback.lastIndexOf("! "),
        lookback.lastIndexOf("? "),
      );
      if (lastSentence > 0) end = end - lookback.length + lastSentence + 1;
    }
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}

/** Element-wise mean of N vectors. Returns a zero vector if input is empty. */
export function meanVector(vectors: readonly number[][]): number[] {
  if (vectors.length === 0) return zeroVector();
  const dim = vectors[0]?.length ?? EMBEDDING_DIM;
  const sum = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) sum[i] = (sum[i] ?? 0) + (v[i] ?? 0);
  }
  return sum.map((s) => s / vectors.length);
}

function zeroVector(): number[] {
  return new Array<number>(EMBEDDING_DIM).fill(0);
}
