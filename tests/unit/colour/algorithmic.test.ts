import { describe, expect, it } from "vitest";
import { deriveAlgorithmic } from "@/lib/colour/algorithmic";
import type { ClassicalFeatures } from "@/lib/stylometry/classical";

function makeFeatures(overrides: Partial<ClassicalFeatures> = {}): ClassicalFeatures {
  return {
    wordCount: 50000,
    sentenceCount: 3000,
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

describe("deriveAlgorithmic", () => {
  it("returns HSL inside the schema's smallint ranges", () => {
    const c = deriveAlgorithmic(makeFeatures());
    expect(c.hue).toBeGreaterThanOrEqual(0);
    expect(c.hue).toBeLessThanOrEqual(360);
    expect(c.saturation).toBeGreaterThanOrEqual(0);
    expect(c.saturation).toBeLessThanOrEqual(100);
    expect(c.lightness).toBeGreaterThanOrEqual(0);
    expect(c.lightness).toBeLessThanOrEqual(100);
  });

  it("is deterministic", () => {
    const f = makeFeatures();
    expect(deriveAlgorithmic(f)).toEqual(deriveAlgorithmic(f));
  });

  it("warm punctuation (! and em-dash) pulls hue toward the warm end", () => {
    const warm = deriveAlgorithmic(
      makeFeatures({
        punctuation: {
          ...makeFeatures().punctuation,
          exclamationMark: 20,
          emDash: 20,
          questionMark: 0,
          semicolon: 0,
          colon: 0,
        },
      }),
    );
    const cool = deriveAlgorithmic(
      makeFeatures({
        punctuation: {
          ...makeFeatures().punctuation,
          exclamationMark: 0,
          emDash: 0,
          questionMark: 20,
          semicolon: 20,
          colon: 10,
        },
      }),
    );
    expect(warm.hue).toBeLessThan(cool.hue);
  });

  it("higher MTLD increases saturation", () => {
    const sparse = deriveAlgorithmic(makeFeatures({ mtld: 30 }));
    const rich = deriveAlgorithmic(makeFeatures({ mtld: 130 }));
    expect(rich.saturation).toBeGreaterThan(sparse.saturation);
  });

  it("longer mean sentence increases lightness", () => {
    const terse = deriveAlgorithmic(
      makeFeatures({ sentenceLength: { mean: 8, std: 2, p50: 8, p90: 12 } }),
    );
    const flowing = deriveAlgorithmic(
      makeFeatures({ sentenceLength: { mean: 28, std: 10, p50: 26, p90: 40 } }),
    );
    expect(flowing.lightness).toBeGreaterThan(terse.lightness);
  });

  it("justification mentions tone, vocabulary, and rhythm", () => {
    const c = deriveAlgorithmic(makeFeatures());
    expect(c.justification).toMatch(/tone/);
    expect(c.justification).toMatch(/vocabulary/);
    expect(c.justification).toMatch(/rhythm/);
  });

  it("handles empty / pathological features without throwing or NaN", () => {
    const c = deriveAlgorithmic(
      makeFeatures({
        wordCount: 0,
        sentenceCount: 0,
        sentenceLength: { mean: 0, std: 0, p50: 0, p90: 0 },
        mtld: 0,
        punctuation: {
          comma: 0,
          period: 0,
          semicolon: 0,
          colon: 0,
          questionMark: 0,
          exclamationMark: 0,
          emDash: 0,
          parenthesis: 0,
        },
      }),
    );
    expect(Number.isFinite(c.hue)).toBe(true);
    expect(Number.isFinite(c.saturation)).toBe(true);
    expect(Number.isFinite(c.lightness)).toBe(true);
  });
});
