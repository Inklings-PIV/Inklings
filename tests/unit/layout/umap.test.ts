import { describe, expect, it } from "vitest";
import {
  CLASSICAL_VECTOR_DIM,
  classicalToVector,
  standardize,
  umapProjection,
} from "@/lib/layout/umap";
import { extractClassical } from "@/lib/stylometry/classical";

describe("classicalToVector", () => {
  it("returns a vector of the fixed expected dimension", () => {
    const f = extractClassical("It is a truth universally acknowledged. A second sentence.");
    const v = classicalToVector(f);
    expect(v).toHaveLength(CLASSICAL_VECTOR_DIM);
    expect(CLASSICAL_VECTOR_DIM).toBe(163);
  });

  it("produces the same dimension for very different texts", () => {
    const a = classicalToVector(extractClassical("Short. Short. Short."));
    const b = classicalToVector(
      extractClassical(
        "A long, sprawling, baroque sentence that meanders through several clauses before finally arriving at a full stop.",
      ),
    );
    expect(a).toHaveLength(b.length);
  });
});

describe("standardize", () => {
  it("zero-means each dimension across the corpus", () => {
    const out = standardize([
      [1, 10, 100],
      [2, 20, 200],
      [3, 30, 300],
    ]);
    for (let d = 0; d < 3; d++) {
      const col = out.map((r) => r[d] ?? 0);
      const mean = col.reduce((a, b) => a + b, 0) / col.length;
      expect(mean).toBeCloseTo(0, 10);
    }
  });

  it("handles a single vector without crashing (std becomes 1)", () => {
    const out = standardize([[5, 5, 5]]);
    expect(out).toEqual([[0, 0, 0]]);
  });

  it("returns empty on empty input", () => {
    expect(standardize([])).toEqual([]);
  });

  it("uses 1 as the divisor when a dimension has zero variance", () => {
    const out = standardize([
      [7, 1],
      [7, 2],
      [7, 3],
    ]);
    for (const row of out) {
      expect(row[0]).toBe(0); // zero-variance column
      expect(Number.isFinite(row[1])).toBe(true);
    }
  });
});

describe("umapProjection", () => {
  it("returns an empty array for an empty corpus", () => {
    expect(umapProjection([])).toEqual([]);
  });

  it("returns [(0, 0)] for a single book (UMAP can't lay out 1 point)", () => {
    expect(umapProjection([[1, 2, 3]])).toEqual([[0, 0]]);
  });

  it("returns N × 2 coordinates for N >= 2 books", () => {
    const v = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
      [1, 1, 0, 0],
    ];
    const out = umapProjection(v, { seed: 1 });
    expect(out).toHaveLength(5);
    for (const p of out) {
      expect(p).toHaveLength(2);
      const x = p[0] ?? 0;
      const y = p[1] ?? 0;
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(-1);
      expect(y).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic for a fixed seed", () => {
    const v = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
      [1, 1, 0, 0],
    ];
    const a = umapProjection(v, { seed: 7 });
    const b = umapProjection(v, { seed: 7 });
    expect(a).toEqual(b);
  });
});
