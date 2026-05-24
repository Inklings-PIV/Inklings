// Shared per-author signature hue maths. Used by /authors/[slug] (detail),
// /authors (index, "The Hands"), and /authors/[slug]/opengraph-image (share
// preview). Each one fetches a different shape of row, so the helper takes
// the lowest common denominator: a list of nullable HSL triples. Filter
// callers do their own `source = "blended"` join.

export type HsLTriple = { hue: number; saturation: number; lightness: number };

/**
 * Circular mean over an author's blended hues. Hue is angular so the naïve
 * mean would wrap badly around 0° (red → purple); we average the unit-circle
 * components and convert back. Saturation and lightness average normally.
 *
 * Returns null when no row carries a colour yet — the caller can fall back
 * to a muted swatch instead of pretending grey is the author's hue.
 */
export function averageBlendedHsl(
  rows: ReadonlyArray<{
    hue: number | null;
    saturation: number | null;
    lightness: number | null;
  }>,
): HsLTriple | null {
  let cosSum = 0;
  let sinSum = 0;
  let satSum = 0;
  let lightSum = 0;
  let n = 0;
  for (const r of rows) {
    if (r.hue == null || r.saturation == null || r.lightness == null) continue;
    const rad = (r.hue * Math.PI) / 180;
    cosSum += Math.cos(rad);
    sinSum += Math.sin(rad);
    satSum += r.saturation;
    lightSum += r.lightness;
    n++;
  }
  if (n === 0) return null;
  return {
    hue: Math.round(((Math.atan2(sinSum / n, cosSum / n) * 180) / Math.PI + 360) % 360),
    saturation: Math.round(satSum / n),
    lightness: Math.round(lightSum / n),
  };
}
