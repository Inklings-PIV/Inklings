// Crowd colour aggregator (#26) — pure function that turns a pile of
// colour_votes into a single HSL. Same hue-wraparound treatment as the
// blender (#27): circular weighted mean via cos/sin, arithmetic mean for
// saturation and lightness.
//
// Today every vote is weighted equally. Per-mode weighting + Twin Smudges
// similarity signals live in follow-up #72.

export type CrowdVote = {
  hue: number;
  saturation: number;
  lightness: number;
};

export type CrowdColour = {
  hue: number;
  saturation: number;
  lightness: number;
  /** Includes the vote count so the UI can hint "averaged from N guesses". */
  justification: string;
};

/**
 * Threshold below which we don't write a crowd row at all. With < 3 votes
 * the average is more about that one player's mood than the corpus's
 * collective sense of the book.
 */
const MIN_VOTES_TO_SURFACE = 3;

export function aggregateCrowdColour(votes: readonly CrowdVote[]): CrowdColour | null {
  if (votes.length < MIN_VOTES_TO_SURFACE) return null;

  // Circular mean for hue (cos/sin trick — 358° + 2° averages to ~0°, not 180°).
  let cosSum = 0;
  let sinSum = 0;
  let satSum = 0;
  let lightSum = 0;
  for (const v of votes) {
    const rad = (v.hue * Math.PI) / 180;
    cosSum += Math.cos(rad);
    sinSum += Math.sin(rad);
    satSum += v.saturation;
    lightSum += v.lightness;
  }
  const n = votes.length;
  const meanRad = Math.atan2(sinSum / n, cosSum / n);
  const hue = Math.round(((meanRad * 180) / Math.PI + 360) % 360);
  const saturation = Math.round(satSum / n);
  const lightness = Math.round(lightSum / n);

  return {
    hue,
    saturation,
    lightness,
    justification: `Averaged from ${n} guess${n === 1 ? "" : "es"}`,
  };
}
