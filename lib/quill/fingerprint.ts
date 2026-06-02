// Normalise a classical stylometric fingerprint into labelled 0..1 bars for the
// Quill readout (style-level feature). The Inkwell shows this fingerprint per
// author (pitch p5); here we turn the writer's own draft into the same shape so
// they can read their style numerically, not just as a hue.
//
// The scaling constants map a typical prose range onto 0..1 so the bars stay
// distinctive without saturating. They are heuristics, documented inline, not
// corpus z-scores — the goal is a legible relative shape while typing.

import type { ClassicalFeatures } from "@/lib/stylometry/classical";

export type FingerprintMetric = {
  key: string;
  label: string;
  /** Normalised 0..1 bar value. */
  value: number;
  /** Human-readable raw value for the tooltip. */
  detail: string;
};

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Map classical features to five readable style bars. Pure and deterministic.
 */
export function toFingerprint(features: ClassicalFeatures): FingerprintMetric[] {
  const sl = features.sentenceLength;
  const p = features.punctuation;
  // Core "rhythm" punctuation that shapes sentence flow (per 1000 words).
  const flow = p.comma + p.semicolon + p.colon + p.emDash;
  // "Voice" punctuation that signals emphasis / address.
  const voice = p.exclamationMark + p.questionMark;

  return [
    {
      key: "richness",
      label: "Lexical richness",
      value: clamp01(features.mtld / 120),
      detail: `MTLD ${features.mtld.toFixed(0)}`,
    },
    {
      key: "sentence-length",
      label: "Sentence length",
      value: clamp01(sl.mean / 40),
      detail: `${sl.mean.toFixed(1)} words avg`,
    },
    {
      key: "sentence-variety",
      label: "Sentence variety",
      value: clamp01(sl.std / 20),
      detail: `±${sl.std.toFixed(1)} words`,
    },
    {
      key: "punctuation-flow",
      label: "Punctuation flow",
      value: clamp01(flow / 150),
      detail: `${flow.toFixed(0)} per 1k words`,
    },
    {
      key: "voice",
      label: "Voice & address",
      value: clamp01(voice / 30),
      detail: `${voice.toFixed(0)} per 1k words`,
    },
  ];
}

export type FingerprintComparison = {
  key: string;
  label: string;
  /** Normalised 0..1 bar value for side A. */
  a: number;
  /** Normalised 0..1 bar value for side B. */
  b: number;
  detailA: string;
  detailB: string;
};

/**
 * Align two fingerprints metric-for-metric so two books (or a draft and a book)
 * can be overlaid bar-for-bar. Pure; metric order follows {@link toFingerprint}.
 */
export function compareFingerprints(
  a: ClassicalFeatures,
  b: ClassicalFeatures,
): FingerprintComparison[] {
  const fb = new Map(toFingerprint(b).map((m) => [m.key, m]));
  return toFingerprint(a).map((m) => {
    const other = fb.get(m.key);
    return {
      key: m.key,
      label: m.label,
      a: m.value,
      b: other?.value ?? 0,
      detailA: m.detail,
      detailB: other?.detail ?? "—",
    };
  });
}
