// The four blot silhouettes used everywhere a "blot" is drawn — landing page
// SVGs and the Inkwell canvas alike. SVG path syntax, viewBox 0 0 120 120.
//
// 3 organic bezier shapes + 1 angular polygonal one for variety. Pick a shape
// per book deterministically via `shapeForId(id)` so the same book always
// looks the same.

export const BLOT_SHAPES: readonly string[] = [
  "M60,12 C75,8 92,20 88,34 C102,38 100,58 86,62 C95,78 78,92 62,86 C58,100 38,96 34,82 C18,86 8,68 20,58 C6,50 12,28 28,30 C30,18 46,12 60,12 Z",
  "M55,8 C74,10 86,24 80,38 C100,42 96,62 78,64 C92,82 70,92 60,80 C56,100 34,96 32,82 C12,80 8,58 22,52 C8,38 20,16 36,22 C42,8 50,8 55,8 Z",
  "M58,10 L70,18 L84,12 L80,30 L98,32 L84,46 L96,58 L80,62 L86,80 L68,78 L60,92 L50,80 L36,90 L34,72 L18,72 L26,58 L10,46 L26,42 L18,26 L36,28 L40,12 Z",
  "M62,14 C82,8 96,28 84,40 C98,52 92,72 76,68 C82,86 60,94 52,80 C40,96 22,84 28,68 C8,68 6,46 22,42 C12,24 32,12 46,20 C50,10 56,12 62,14 Z",
];

/** Stable index from a string id; same id always returns the same shape. */
export function shapeForId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return ((h % BLOT_SHAPES.length) + BLOT_SHAPES.length) % BLOT_SHAPES.length;
}
