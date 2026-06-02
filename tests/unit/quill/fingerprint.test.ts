import { describe, expect, it } from "vitest";
import { toFingerprint } from "@/lib/quill/fingerprint";
import type { ClassicalFeatures } from "@/lib/stylometry/classical";

function makeFeatures(overrides: Partial<ClassicalFeatures> = {}): ClassicalFeatures {
  return {
    wordCount: 5000,
    sentenceCount: 300,
    sentenceLength: { mean: 16, std: 8, p50: 14, p90: 28 },
    typeTokenRatio: 0.15,
    mtld: 70,
    punctuation: {
      comma: 50,
      period: 60,
      semicolon: 5,
      colon: 3,
      questionMark: 4,
      exclamationMark: 6,
      emDash: 8,
      parenthesis: 2,
    },
    functionWords: {},
    ...overrides,
  };
}

describe("toFingerprint", () => {
  it("returns five metrics with values inside 0..1", () => {
    const fp = toFingerprint(makeFeatures());
    expect(fp).toHaveLength(5);
    for (const m of fp) {
      expect(m.value).toBeGreaterThanOrEqual(0);
      expect(m.value).toBeLessThanOrEqual(1);
      expect(m.label.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic", () => {
    const f = makeFeatures();
    expect(toFingerprint(f)).toEqual(toFingerprint(f));
  });

  it("longer sentences raise the sentence-length bar", () => {
    const get = (mean: number) =>
      toFingerprint(
        makeFeatures({ sentenceLength: { mean, std: 8, p50: mean, p90: mean + 10 } }),
      ).find((m) => m.key === "sentence-length")?.value ?? 0;
    expect(get(30)).toBeGreaterThan(get(10));
  });

  it("higher MTLD raises the lexical-richness bar", () => {
    const get = (mtld: number) =>
      toFingerprint(makeFeatures({ mtld })).find((m) => m.key === "richness")?.value ?? 0;
    expect(get(110)).toBeGreaterThan(get(40));
  });

  it("clamps extreme values to 1", () => {
    const fp = toFingerprint(makeFeatures({ mtld: 9999 }));
    expect(fp.find((m) => m.key === "richness")?.value).toBe(1);
  });
});
