// The emotional arc of the draft — its "story shape". Per-sentence valence is
// smoothed into a curve and matched against the six canonical arcs Reagan
// et al. 2016 found dominating 1,327 Project Gutenberg novels (EPJ Data
// Science, 10.1140/epjds/s13688-016-0093-1) — the very corpus the Inkwell
// ingests. Pure math: valences come from the caller (wink lexicon, see
// lib/stylometry/valence.ts), so everything here is deterministic and cheap.

export type ArcMatch = {
  key: string;
  label: string;
  /** Pearson correlation against the template, 0..1 (negatives lose to the mirrored template). */
  r: number;
};

/** A draft needs at least this many sentences before a "shape" is honest. */
export const MIN_ARC_SENTENCES = 8;

/** Resolution both curves are resampled to before correlating. */
const SAMPLES = 24;

// The six shapes, as unit-domain prototypes. Only the *shape* matters — both
// sides are z-normalised before correlating, so scale and offset drop out.
export const ARC_TEMPLATES: ReadonlyArray<{
  key: string;
  label: string;
  shape: (t: number) => number;
}> = [
  { key: "rags-to-riches", label: "Rags to riches", shape: (t) => t },
  { key: "tragedy", label: "Riches to rags", shape: (t) => -t },
  { key: "man-in-a-hole", label: "Man in a hole", shape: (t) => Math.cos(2 * Math.PI * t) },
  { key: "icarus", label: "Icarus", shape: (t) => -Math.cos(2 * Math.PI * t) },
  { key: "cinderella", label: "Cinderella", shape: (t) => Math.sin(2 * Math.PI * t) },
  { key: "oedipus", label: "Oedipus", shape: (t) => -Math.sin(2 * Math.PI * t) },
];

/** Centred moving average; the window is clamped to the series length. */
export function movingAverage(xs: readonly number[], window: number): number[] {
  if (xs.length === 0) return [];
  const w = Math.max(1, Math.min(window, xs.length));
  const half = Math.floor(w / 2);
  return xs.map((_, i) => {
    const from = Math.max(0, i - half);
    const to = Math.min(xs.length, i + half + 1);
    let sum = 0;
    for (let j = from; j < to; j++) sum += xs[j] ?? 0;
    return sum / (to - from);
  });
}

/** Linear resampling to exactly `n` points (n ≥ 2, xs.length ≥ 2). */
export function resampleLinear(xs: readonly number[], n: number): number[] {
  if (xs.length === 0) return [];
  if (xs.length === 1) return new Array(n).fill(xs[0]);
  return Array.from({ length: n }, (_, i) => {
    const pos = (i / (n - 1)) * (xs.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(xs.length - 1, lo + 1);
    const frac = pos - lo;
    return (xs[lo] ?? 0) * (1 - frac) + (xs[hi] ?? 0) * frac;
  });
}

/** Pearson correlation; null when either side is flat (zero variance). */
export function pearson(a: readonly number[], b: readonly number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i++) {
    meanA += a[i] ?? 0;
    meanB += b[i] ?? 0;
  }
  meanA /= n;
  meanB /= n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = (a[i] ?? 0) - meanA;
    const db = (b[i] ?? 0) - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  // Epsilon, not exact zero: resampling a constant series leaves float
  // jitter (~1e-17 per point) that would otherwise correlate as noise.
  if (varA < 1e-12 || varB < 1e-12) return null;
  return cov / Math.sqrt(varA * varB);
}

/**
 * Nearest canonical arc for a smoothed valence curve, or null when the curve
 * is too short or flat to make an honest claim. Each template's mirror is its
 * own entry in the list, so only positive correlations compete.
 */
export function classifyArc(curve: readonly number[]): ArcMatch | null {
  if (curve.length < MIN_ARC_SENTENCES) return null;
  const sampled = resampleLinear(curve, SAMPLES);
  let best: ArcMatch | null = null;
  for (const template of ARC_TEMPLATES) {
    const proto = Array.from({ length: SAMPLES }, (_, i) => template.shape(i / (SAMPLES - 1)));
    const r = pearson(sampled, proto);
    if (r == null) return null; // flat draft curve — same for every template
    if (r > (best?.r ?? 0)) best = { key: template.key, label: template.label, r };
  }
  return best;
}

/** Template curve sampled for chart overlay, scaled into [min,max] of the draft curve. */
export function templateOverlay(
  key: string,
  n: number,
  range: { min: number; max: number },
): number[] | null {
  const template = ARC_TEMPLATES.find((t) => t.key === key);
  if (!template || n < 2) return null;
  const raw = Array.from({ length: n }, (_, i) => template.shape(i / (n - 1)));
  const lo = Math.min(...raw);
  const hi = Math.max(...raw);
  const span = hi - lo || 1;
  const target = range.max - range.min || 1;
  return raw.map((v) => range.min + ((v - lo) / span) * target);
}
