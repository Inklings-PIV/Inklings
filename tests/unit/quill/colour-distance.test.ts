import { describe, expect, it } from "vitest";
import { driftToTarget, type Hsl, hueDistance } from "@/lib/quill/colour-distance";

const at = (hue: number, saturation = 60, lightness = 55): Hsl => ({ hue, saturation, lightness });

describe("hueDistance", () => {
  it("is zero for identical colours", () => {
    expect(hueDistance(at(200), at(200))).toBe(0);
  });

  it("treats hue as cyclic — 350 and 10 are close, not far apart", () => {
    const wrapped = hueDistance(at(350), at(10)); // 20° apart across the seam
    const naive = hueDistance(at(20), at(40)); // also 20° apart, no seam
    expect(wrapped).toBeCloseTo(naive, 6);
    expect(wrapped).toBeLessThan(hueDistance(at(350), at(180)));
  });

  it("reaches its hue ceiling at 180° opposition", () => {
    // Only hue differs by a half-turn → the full hue weight, nothing else.
    expect(hueDistance(at(0), at(180))).toBeCloseTo(0.6, 6);
  });

  it("returns 1 at maximum distance across all three channels", () => {
    expect(
      hueDistance(
        { hue: 0, saturation: 0, lightness: 0 },
        { hue: 180, saturation: 100, lightness: 100 },
      ),
    ).toBe(1);
  });

  it("weights hue above saturation above lightness", () => {
    const hueOnly = hueDistance(
      { hue: 0, saturation: 60, lightness: 55 },
      { hue: 180, saturation: 60, lightness: 55 },
    );
    const satOnly = hueDistance(
      { hue: 200, saturation: 0, lightness: 55 },
      { hue: 200, saturation: 100, lightness: 55 },
    );
    const lightOnly = hueDistance(
      { hue: 200, saturation: 60, lightness: 0 },
      { hue: 200, saturation: 60, lightness: 100 },
    );
    expect(hueOnly).toBeGreaterThan(satOnly);
    expect(satOnly).toBeGreaterThan(lightOnly);
  });

  it("stays within [0, 1] for arbitrary inputs", () => {
    for (const [a, b] of [
      [at(12, 90, 70), at(300, 10, 40)],
      [at(359, 100, 75), at(1, 0, 45)],
      [at(120, 50, 50), at(240, 50, 50)],
    ] as const) {
      const d = hueDistance(a, b);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
  });
});

describe("driftToTarget", () => {
  it("is 1 when the draft already matches the target", () => {
    expect(driftToTarget(at(200), at(200))).toBe(1);
  });

  it("is the complement of the distance", () => {
    const a = at(40, 80, 60);
    const b = at(220, 30, 50);
    expect(driftToTarget(a, b)).toBeCloseTo(1 - hueDistance(a, b), 6);
  });

  it("rises as the draft moves toward the target", () => {
    const target = at(220);
    const far = driftToTarget(at(40), target);
    const near = driftToTarget(at(210), target);
    expect(near).toBeGreaterThan(far);
  });
});
