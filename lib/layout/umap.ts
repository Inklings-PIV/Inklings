import { UMAP } from "umap-js";
import { type ClassicalFeatures, FUNCTION_WORDS } from "@/lib/stylometry/classical";

/**
 * Flatten a `ClassicalFeatures` record into a fixed-length numeric vector
 * suitable for UMAP. Length is stable across books because the function-word
 * vocabulary is fixed.
 *
 * 4 (sentence-length stats) + 1 (mtld) + 8 (punctuation) + 150 (function words)
 * = 163 dimensions.
 *
 * Skips `wordCount`, `sentenceCount`, and the naive `typeTokenRatio` — those
 * vary with text length rather than style.
 */
export function classicalToVector(f: ClassicalFeatures): number[] {
  return [
    f.sentenceLength.mean,
    f.sentenceLength.std,
    f.sentenceLength.p50,
    f.sentenceLength.p90,
    f.mtld,
    f.punctuation.comma,
    f.punctuation.period,
    f.punctuation.semicolon,
    f.punctuation.colon,
    f.punctuation.questionMark,
    f.punctuation.exclamationMark,
    f.punctuation.emDash,
    f.punctuation.parenthesis,
    ...FUNCTION_WORDS.map((w) => f.functionWords[w] ?? 0),
  ];
}

export const CLASSICAL_VECTOR_DIM = 4 + 1 + 8 + FUNCTION_WORDS.length;

/**
 * Z-score each dimension across the corpus. Required before UMAP because the
 * raw features live on wildly different scales (mean sentence length ~10s vs.
 * function-word freqs ~0.01).
 *
 * Returns a copy; does not mutate input.
 */
export function standardize(vectors: number[][]): number[][] {
  if (vectors.length === 0) return [];
  const first = vectors[0];
  if (!first) return [];
  const dim = first.length;
  if (dim === 0) return vectors.map(() => []);

  const means = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) means[i] = (means[i] ?? 0) + (v[i] ?? 0);
  }
  for (let i = 0; i < dim; i++) means[i] = (means[i] ?? 0) / vectors.length;

  const variances = new Array<number>(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) {
      const d = (v[i] ?? 0) - (means[i] ?? 0);
      variances[i] = (variances[i] ?? 0) + d * d;
    }
  }
  const stds = variances.map((s) => Math.sqrt(s / vectors.length) || 1);

  return vectors.map((v) => v.map((x, i) => (x - (means[i] ?? 0)) / (stds[i] ?? 1)));
}

/**
 * 2D UMAP projection, normalised to fit the canvas's [-1, 1] convention.
 *
 * Pinned PRNG seed = stable layout when run on identical data. Degenerate
 * corpora (0 or 1 books) are handled — UMAP itself requires n_neighbors < n.
 */
export function umapProjection(vectors: number[][], opts: { seed?: number } = {}): number[][] {
  if (vectors.length === 0) return [];
  if (vectors.length === 1) return [[0, 0]];

  const seed = opts.seed ?? 42;
  const random = mulberry32(seed);

  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: Math.max(2, Math.min(15, vectors.length - 1)),
    minDist: 0.1,
    random,
  });

  const projected = umap.fit(vectors);
  return normaliseToUnitBox(projected);
}

function normaliseToUnitBox(points: number[][]): number[][] {
  if (points.length === 0) return [];

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    const x = p[0] ?? 0;
    const y = p[1] ?? 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  return points.map((p) => {
    const x = p[0] ?? 0;
    const y = p[1] ?? 0;
    return [((x - minX) / rangeX) * 2 - 1, ((y - minY) / rangeY) * 2 - 1];
  });
}

/** Mulberry32 — small, fast, seeded PRNG. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
