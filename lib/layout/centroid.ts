// Place a new item into an existing 2D layout without re-running UMAP. The
// corpus layout (book_layout) is a bulk UMAP fit that can't project a single
// new point, so the writer's draft (#10, the Quill↔Inkwell bridge) is positioned
// near the corpus blots it's stylometrically closest to — an inverse-distance
// weighted centroid of its nearest neighbours. Honest by construction: the draft
// lands among the books it most resembles, never at a fabricated UMAP coordinate.

export type WeightedPoint = {
  x: number;
  y: number;
  /** Stylometric distance to the new item — smaller pulls harder. */
  distance: number;
};

/**
 * Inverse-distance weighted centroid of `points` (weight = 1/(distance + ε)), or
 * null when there are none. An exact match (distance ≤ 0) snaps to that point so
 * ε noise can't drag it off. The result is a convex combination of the inputs,
 * so it always lands inside their bounding box.
 */
export function weightedCentroid(
  points: WeightedPoint[],
  epsilon = 1e-6,
): { x: number; y: number } | null {
  if (points.length === 0) return null;

  const exact = points.find((p) => p.distance <= 0);
  if (exact) return { x: exact.x, y: exact.y };

  let weightSum = 0;
  let xSum = 0;
  let ySum = 0;
  for (const p of points) {
    const weight = 1 / (p.distance + epsilon);
    weightSum += weight;
    xSum += weight * p.x;
    ySum += weight * p.y;
  }
  return { x: xSum / weightSum, y: ySum / weightSum };
}
