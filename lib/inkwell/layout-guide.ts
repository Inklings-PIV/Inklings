// How to read each Inkwell layout (style-level explainer, S2).
//
// The canvas positions are UMAP projections, so the X/Y axes carry no fixed
// semantic meaning — only *proximity* is meaningful. A viewer who reads the
// axes like a scatter plot misreads the data. This guide gives an honest,
// per-layout one-liner so the canvas reads as data, not decoration.

export type InkwellLayout = "classical" | "modern" | "by-hue";

export type LayoutGuide = {
  /** What the positions are derived from. */
  reading: string;
  /** How to interpret distance/position honestly. */
  distance: string;
};

export const LAYOUT_GUIDE: Record<InkwellLayout, LayoutGuide> = {
  classical: {
    reading:
      "Placed by classical stylometry — function-word frequencies, sentence-length statistics, MTLD, and punctuation density.",
    distance:
      "Nearby blots write alike on the page. The axes themselves carry no fixed meaning — it's a UMAP projection, so read proximity, not position.",
  },
  modern: {
    reading:
      "Placed by modern sentence embeddings — a semantic and tonal fingerprint of the prose.",
    distance:
      "Proximity means similar meaning and voice. Like the classical view, the axes are a UMAP projection, not labelled scales.",
  },
  "by-hue": {
    reading: "Arranged by each blot's derived hue rather than by stylometry.",
    distance:
      "Neighbours share a colour; angle around the wheel tracks hue while radius is arbitrary. This view answers “what colour”, not “what style”.",
  },
};

export function layoutGuide(layout: InkwellLayout): LayoutGuide {
  return LAYOUT_GUIDE[layout];
}
