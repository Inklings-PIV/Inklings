// Algorithmic colour deriver (#24) — maps a book's classical fingerprint to
// an HSL triple. Pure function; deterministic; no I/O.
//
// Mapping rationale:
//   Hue ......... tone, proxied by punctuation balance.
//                 Warm cues (! and em-dashes) push toward orange-red (~25°);
//                 cool cues (?, ; and :) push toward blue-violet (~265°).
//                 The plan mentions "sentiment → hue", which we'll graduate
//                 to once a sentiment field exists in ClassicalFeatures;
//                 punctuation tone gives a real per-book signal in the meantime.
//   Saturation .. vocabulary richness via MTLD (length-robust TTR variant).
//                 Higher MTLD ⇒ richer vocab ⇒ more saturated, but the range
//                 is capped at 70% so the canvas keeps its ink-on-paper feel.
//   Lightness ... sentence rhythm via mean sentence length.
//                 Terse prose (Hemingway) reads denser → darker ink;
//                 baroque prose (James) reads airier → paler ink.

import type { ClassicalFeatures } from "@/lib/stylometry/classical";

export type AlgorithmicColour = {
  /** 0–360 */
  hue: number;
  /** 0–100 */
  saturation: number;
  /** 0–100 */
  lightness: number;
  /** Short explanation of what drove the colour. Stored alongside the row. */
  justification: string;
};

export function deriveAlgorithmic(features: ClassicalFeatures): AlgorithmicColour {
  const tone = toneSignal(features); // [-1, 1], warm → cool
  const richness = richnessSignal(features); // [0, 1]
  const rhythm = rhythmSignal(features); // [0, 1]

  // Warm pole at 25°, cool pole at 265°. Tone -1 ⇒ warm, +1 ⇒ cool.
  const hue = Math.round(25 + ((tone + 1) / 2) * 240);
  const saturation = Math.round(35 + richness * 35);
  const lightness = Math.round(45 + rhythm * 22);

  return { hue, saturation, lightness, justification: explain(tone, richness, rhythm) };
}

function toneSignal(f: ClassicalFeatures): number {
  const p = f.punctuation;
  const warm = p.exclamationMark + 0.5 * p.emDash;
  const cool = p.questionMark + 0.5 * p.semicolon + 0.3 * p.colon;
  // tanh squashes raw delta (per-1k punctuation counts) into [-1, 1] so a
  // single outlier book can't peg the whole hue spectrum.
  // Returns positive for cool-dominant books (so the hue map reads naturally).
  return Math.tanh((cool - warm) / 4);
}

function richnessSignal(f: ClassicalFeatures): number {
  // MTLD typically 30–130 for English prose. Clamp into [0, 1] around that.
  return clamp01((f.mtld - 40) / 80);
}

function rhythmSignal(f: ClassicalFeatures): number {
  // Mean sentence length: terse ~8 words → 0, flowing ~28 words → 1.
  return clamp01((f.sentenceLength.mean - 10) / 20);
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function explain(tone: number, richness: number, rhythm: number): string {
  const t = tone > 0.2 ? "cool" : tone < -0.2 ? "warm" : "balanced";
  const r = richness > 0.6 ? "rich" : richness > 0.3 ? "moderate" : "spare";
  const h = rhythm > 0.6 ? "flowing" : rhythm > 0.3 ? "measured" : "terse";
  return `${t} tone, ${r} vocabulary, ${h} rhythm`;
}
