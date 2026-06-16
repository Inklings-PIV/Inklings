// Source disagreement — how far apart the independent hue derivations land
// for one book. The Inkwell encodes this as blot softness (consensus = sharp
// ink, contested = ink on wet paper), the detail panel as a centred hue strip.
//
// Hue-only on purpose: "what colour is this book" is read almost entirely from
// hue; saturation/lightness differences between methods are second-order.
// All distances are circular (358° and 2° are 4° apart, not 356°).

export type SourceHue = { hue: number };

/** Shortest angular distance between two hues, in degrees (0..180). */
export function circularHueDistance(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/** Signed shortest rotation from `from` to `to`, in degrees (-180..180]. */
export function signedHueDelta(from: number, to: number): number {
  const d = (((to - from) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

/**
 * Circular mean of a set of hues (cos/sin trick, same treatment as the crowd
 * aggregator) — 358° and 2° average to ~0°, not 180°. Null for an empty set.
 */
export function circularMeanHue(hues: readonly number[]): number | null {
  if (hues.length === 0) return null;
  let cosSum = 0;
  let sinSum = 0;
  for (const h of hues) {
    const rad = (h * Math.PI) / 180;
    cosSum += Math.cos(rad);
    sinSum += Math.sin(rad);
  }
  const meanRad = Math.atan2(sinSum / hues.length, cosSum / hues.length);
  return ((meanRad * 180) / Math.PI + 360) % 360;
}

/**
 * Mean pairwise circular hue distance across the derived sources, normalised
 * to 0..1 (0 = all sources agree, 1 = maximally apart at 180°). Null with
 * fewer than two sources — disagreement needs a pair. Callers should pass
 * only *independent* derivations (algorithmic, LLM, crowd) — the blended row
 * is their average and would dilute the signal.
 */
export function sourceDisagreement(sources: readonly SourceHue[]): number | null {
  if (sources.length < 2) return null;
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      // biome-ignore lint/style/noNonNullAssertion: i/j are bounded by length.
      sum += circularHueDistance(sources[i]!.hue, sources[j]!.hue);
      pairs++;
    }
  }
  return sum / pairs / 180;
}

/** 0 = sharp (consensus) · 1 = loose · 2 = diffuse (contested). */
export type Softness = 0 | 1 | 2;

// Three buckets, not a continuum: the underlying signal (a handful of method
// pairs) doesn't carry more precision, and the icon atlas stays small.
const LOOSE_AT = 30 / 180;
const DIFFUSE_AT = 75 / 180;

/** Buckets a disagreement score into the three icon-gradient variants. */
export function softnessBucket(disagreement: number | null): Softness {
  // Single-source books make no consensus claim either way — placeholder
  // hues aren't presented as derived, so sharp is not a false "agreement".
  if (disagreement == null) return 0;
  if (disagreement < LOOSE_AT) return 0;
  if (disagreement < DIFFUSE_AT) return 1;
  return 2;
}

// Ranges follow the conventional HSL wheel (green sits at 120, not 90), so
// the words match what the swatch actually looks like.
const HUE_RANGES: ReadonlyArray<[upTo: number, name: string]> = [
  [30, "red"],
  [60, "orange"],
  [90, "yellow"],
  [150, "green"],
  [210, "teal"],
  [270, "blue"],
  [300, "violet"],
  [330, "magenta"],
  [360, "red"],
];

/** Coarse colour word for a hue, for "algo reads orange, LLM reads teal" lines. */
export function describeHue(hue: number): string {
  const h = ((hue % 360) + 360) % 360;
  const match = HUE_RANGES.find(([upTo]) => h < upTo);
  return match ? match[1] : "red";
}
