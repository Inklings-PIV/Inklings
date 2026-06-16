import { describe, expect, it } from "vitest";
import { type WeightedPoint, weightedCentroid } from "@/lib/layout/centroid";

describe("weightedCentroid", () => {
  it("returns null for no points", () => {
    expect(weightedCentroid([])).toBeNull();
  });

  it("returns the point itself for a single neighbour", () => {
    const c = weightedCentroid([{ x: 0.4, y: -0.2, distance: 0.7 }]);
    expect(c?.x).toBeCloseTo(0.4, 6);
    expect(c?.y).toBeCloseTo(-0.2, 6);
  });

  it("is the midpoint of two equidistant neighbours", () => {
    const pts: WeightedPoint[] = [
      { x: -1, y: 0, distance: 0.5 },
      { x: 1, y: 0, distance: 0.5 },
    ];
    const c = weightedCentroid(pts);
    expect(c?.x).toBeCloseTo(0, 6);
    expect(c?.y).toBeCloseTo(0, 6);
  });

  it("pulls toward the nearer neighbour", () => {
    const c = weightedCentroid([
      { x: 0, y: 0, distance: 0.1 }, // much closer
      { x: 1, y: 0, distance: 1.0 },
    ]);
    expect(c?.x).toBeGreaterThan(0);
    expect(c?.x).toBeLessThan(0.5); // but not past the midpoint
  });

  it("snaps to an exact match (distance 0), ignoring the rest", () => {
    const c = weightedCentroid([
      { x: 0.9, y: 0.9, distance: 0 },
      { x: -0.9, y: -0.9, distance: 0.3 },
    ]);
    expect(c?.x).toBeCloseTo(0.9, 6);
    expect(c?.y).toBeCloseTo(0.9, 6);
  });

  it("always lands inside the bounding box of its neighbours", () => {
    const pts: WeightedPoint[] = [
      { x: -0.8, y: 0.2, distance: 0.4 },
      { x: 0.3, y: -0.6, distance: 0.9 },
      { x: 0.7, y: 0.5, distance: 0.2 },
    ];
    const c = weightedCentroid(pts);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    expect(c?.x).toBeGreaterThanOrEqual(Math.min(...xs));
    expect(c?.x).toBeLessThanOrEqual(Math.max(...xs));
    expect(c?.y).toBeGreaterThanOrEqual(Math.min(...ys));
    expect(c?.y).toBeLessThanOrEqual(Math.max(...ys));
  });
});
