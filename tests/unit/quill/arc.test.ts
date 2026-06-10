import { describe, expect, it } from "vitest";
import {
  classifyArc,
  MIN_ARC_SENTENCES,
  movingAverage,
  pearson,
  resampleLinear,
  templateOverlay,
} from "@/lib/quill/arc";

describe("movingAverage", () => {
  it("smooths a spike without shifting the series length", () => {
    const out = movingAverage([0, 0, 10, 0, 0], 3);
    expect(out).toHaveLength(5);
    expect(out[2]).toBeCloseTo(10 / 3, 5);
  });

  it("handles empty input and window larger than the series", () => {
    expect(movingAverage([], 5)).toEqual([]);
    expect(movingAverage([2, 4], 99)).toEqual([3, 3]);
  });
});

describe("resampleLinear", () => {
  it("interpolates between points", () => {
    expect(resampleLinear([0, 10], 3)).toEqual([0, 5, 10]);
  });

  it("preserves endpoints", () => {
    const out = resampleLinear([1, 5, 2, 8], 10);
    expect(out[0]).toBe(1);
    expect(out[9]).toBe(8);
  });
});

describe("pearson", () => {
  it("is 1 for identical series and -1 for inverted ones", () => {
    expect(pearson([1, 2, 3], [10, 20, 30])).toBeCloseTo(1, 9);
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 9);
  });

  it("returns null for flat series", () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  });
});

describe("classifyArc", () => {
  const t = (n: number) => Array.from({ length: n }, (_, i) => i / (n - 1));

  it("needs at least MIN_ARC_SENTENCES points", () => {
    expect(classifyArc(t(MIN_ARC_SENTENCES - 1))).toBeNull();
  });

  it("returns null for a flat curve (no shape claim)", () => {
    expect(classifyArc(new Array(20).fill(0.3))).toBeNull();
  });

  it("recognises a steady rise as rags-to-riches", () => {
    const match = classifyArc(t(20));
    expect(match?.key).toBe("rags-to-riches");
    expect(match?.r).toBeGreaterThan(0.95);
  });

  it("recognises a fall as tragedy, not as a weak rise", () => {
    const match = classifyArc(t(20).map((v) => 1 - v));
    expect(match?.key).toBe("tragedy");
  });

  it("recognises a dip-and-recover as man-in-a-hole", () => {
    const curve = t(30).map((x) => Math.cos(2 * Math.PI * x) + 0.1 * Math.sin(9 * x));
    expect(classifyArc(curve)?.key).toBe("man-in-a-hole");
  });

  it("recognises rise-fall-rise as cinderella", () => {
    const curve = t(30).map((x) => Math.sin(2 * Math.PI * x));
    expect(classifyArc(curve)?.key).toBe("cinderella");
  });
});

describe("templateOverlay", () => {
  it("scales the template into the given range", () => {
    const out = templateOverlay("rags-to-riches", 5, { min: -2, max: 4 });
    expect(out).not.toBeNull();
    expect(Math.min(...(out as number[]))).toBeCloseTo(-2, 9);
    expect(Math.max(...(out as number[]))).toBeCloseTo(4, 9);
  });

  it("returns null for an unknown key", () => {
    expect(templateOverlay("nope", 5, { min: 0, max: 1 })).toBeNull();
  });
});
