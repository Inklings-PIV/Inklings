// Locate each editable block of prose inside a ProseMirror document — the
// bridge that lets the EmoArc hue band (built from splitParagraphs) drive the
// editor. The band's i-th segment is this list's i-th range, so hovering a
// segment can highlight its paragraph and clicking one can act on it.

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/**
 * One block of prose located in the document. `from`/`to` bound the block's
 * *inline content* (inside the node), so the range feeds straight into
 * `textBetween`, `setTextSelection`, or `insertContentAt`. To address the node
 * itself (e.g. `Decoration.node`), widen by one on each side: `from - 1`/`to + 1`.
 */
export type BlockRange = {
  from: number;
  to: number;
  /** Whitespace-collapsed plain text — equal to its `splitParagraphs` segment. */
  text: string;
};

/**
 * Enumerate the document's non-empty text blocks in reading order, aligned 1:1
 * with {@link import("./paragraphs").splitParagraphs}. Both treat each
 * paragraph, heading, list item, blockquote line, and code block as one unit
 * and drop the empties, so range `i` here is hue-band segment `i`.
 *
 * Walking with `descendants` (not the top-level-only `doc.forEach`) is what
 * reaches list items and blockquote lines — skipping them is the off-by-one
 * that would misalign the band from the text it points at.
 */
export function textblockRanges(doc: ProseMirrorNode): BlockRange[] {
  const ranges: BlockRange[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = node.textContent.replace(/\s+/g, " ").trim();
    if (text) ranges.push({ from: pos + 1, to: pos + node.nodeSize - 1, text });
    // A textblock holds only inline content — never descend into it.
    return false;
  });
  return ranges;
}

/** The block at hue-band segment `index`, or null when the index is out of range. */
export function blockRangeAt(doc: ProseMirrorNode, index: number): BlockRange | null {
  if (index < 0) return null;
  return textblockRanges(doc)[index] ?? null;
}
