import { describe, expect, it } from "vitest";
import {
  circularHueDistance,
  circularMeanHue,
  describeHue,
  signedHueDelta,
  softnessBucket,
  sourceDisagreement,
} from "@/lib/colour/uncertainty";

describe("circularHueDistance", () => {
  it("wraps around the hue circle", () => {
    expect(circularHueDistance(358, 2)).toBe(4);
    expect(circularHueDistance(2, 358)).toBe(4);
  });

  it("caps at 180 for opposite hues", () => {
    expect(circularHueDistance(0, 180)).toBe(180);
    expect(circularHueDistance(90, 270)).toBe(180);
  });

  it("is zero for identical hues", () => {
    expect(circularHueDistance(123, 123)).toBe(0);
  });
});

describe("signedHueDelta", () => {
  it("takes the short way in both directions", () => {
    expect(signedHueDelta(350, 10)).toBe(20);
    expect(signedHueDelta(10, 350)).toBe(-20);
  });

  it("treats 180 as +180, not -180", () => {
    expect(signedHueDelta(0, 180)).toBe(180);
  });
});

describe("circularMeanHue", () => {
  it("averages across the wrap point", () => {
    const mean = circularMeanHue([358, 2]);
    expect(mean).not.toBeNull();
    // ~0°, definitely not the arithmetic 180°.
    expect(circularHueDistance(mean as number, 0)).toBeLessThan(1);
  });

  it("returns null for an empty set", () => {
    expect(circularMeanHue([])).toBeNull();
  });

  it("is the identity for a single hue", () => {
    expect(circularMeanHue([42])).toBeCloseTo(42, 5);
  });
});

describe("sourceDisagreement", () => {
  it("needs at least two sources", () => {
    expect(sourceDisagreement([])).toBeNull();
    expect(sourceDisagreement([{ hue: 10 }])).toBeNull();
  });

  it("is 0 for full agreement and 1 for opposite hues", () => {
    expect(sourceDisagreement([{ hue: 50 }, { hue: 50 }])).toBe(0);
    expect(sourceDisagreement([{ hue: 0 }, { hue: 180 }])).toBe(1);
  });

  it("measures across the wrap point", () => {
    // 358 vs 2 = 4° apart → tiny disagreement, not near-maximal.
    const d = sourceDisagreement([{ hue: 358 }, { hue: 2 }]);
    expect(d).toBeCloseTo(4 / 180, 5);
  });

  it("averages all pairs for three sources", () => {
    // Pairs: 0-60 (60°), 0-120 (120°), 60-120 (60°) → mean 80° → 80/180.
    const d = sourceDisagreement([{ hue: 0 }, { hue: 60 }, { hue: 120 }]);
    expect(d).toBeCloseTo(80 / 180, 5);
  });
});

describe("softnessBucket", () => {
  it("treats unknown disagreement as sharp (no consensus claim)", () => {
    expect(softnessBucket(null)).toBe(0);
  });

  it("buckets at the 30° and 75° thresholds", () => {
    expect(softnessBucket(0)).toBe(0);
    expect(softnessBucket(29 / 180)).toBe(0);
    expect(softnessBucket(30 / 180)).toBe(1);
    expect(softnessBucket(74 / 180)).toBe(1);
    expect(softnessBucket(75 / 180)).toBe(2);
    expect(softnessBucket(1)).toBe(2);
  });
});

describe("describeHue", () => {
  it("names the cardinal hues", () => {
    expect(describeHue(0)).toBe("red");
    expect(describeHue(90)).toBe("green");
    expect(describeHue(225)).toBe("blue");
    expect(describeHue(315)).toBe("magenta");
  });

  it("wraps 360 back to red and survives negatives", () => {
    expect(describeHue(360)).toBe("red");
    expect(describeHue(-45)).toBe("magenta");
  });
});
