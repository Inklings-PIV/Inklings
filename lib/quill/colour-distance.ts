// Distance between two prose hues, for the "drift to target" meter (#5). The
// Quill reads a draft's colour and the writer's target's colour on the same
// HSL scale; this measures how far apart they are so the meter can show how
// close the prose has drifted toward the target as it's edited.

/** A hue on the app's HSL scale: hue 0–360 (cyclic), saturation/lightness 0–100. */
export type Hsl = { hue: number; saturation: number; lightness: number };

// Hue carries most of the "feel", so it dominates; saturation (intensity) next;
// lightness (mood weight) least. Weights sum to 1 so the distance lands in 0..1.
const HUE_WEIGHT = 0.6;
const SAT_WEIGHT = 0.25;
const LIGHT_WEIGHT = 0.15;

/** Shortest angular gap between two hues, 0..180 — the colour wheel wraps, so
 *  350° and 10° are 20° apart, not 340°. */
function hueGap(a: number, b: number): number {
  const raw = Math.abs(a - b) % 360;
  return raw > 180 ? 360 - raw : raw;
}

/**
 * Weighted distance between two hues, normalised to 0 (identical) … 1 (as far
 * as the scale allows). Hue is measured cyclically; saturation and lightness
 * linearly. The weighting privileges hue, then saturation, then lightness —
 * the order in which each shifts a reader's sense of the prose's colour.
 */
export function hueDistance(a: Hsl, b: Hsl): number {
  const dh = hueGap(a.hue, b.hue) / 180;
  const ds = Math.abs(a.saturation - b.saturation) / 100;
  const dl = Math.abs(a.lightness - b.lightness) / 100;
  return HUE_WEIGHT * dh + SAT_WEIGHT * ds + LIGHT_WEIGHT * dl;
}

/**
 * How close the draft sits to its target, 0 (far) … 1 (matched) — the
 * complement of {@link hueDistance}, ready to drive a progress meter
 * ("you're 70% to the target").
 */
export function driftToTarget(draft: Hsl, target: Hsl): number {
  return 1 - hueDistance(draft, target);
}
