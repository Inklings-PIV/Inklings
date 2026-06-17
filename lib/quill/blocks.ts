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

/**
 * Split a textblock's plain text into sentence spans — `[start, end)` offsets
 * into the string, with inter-sentence whitespace belonging to neither span.
 * Boundaries are runs of .!? followed by whitespace or end-of-text.
 */
export function sentenceSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  const re = /[.!?]+(?=\s|$)/g;
  let start = 0;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex exec loop
  while ((m = re.exec(text))) {
    const end = m.index + m[0].length;
    spans.push({ start, end });
    let next = end;
    while (next < text.length && /\s/.test(text.charAt(next))) next++;
    start = next;
  }
  if (start < text.length) spans.push({ start, end: text.length });
  return spans;
}

/**
 * The rewrite span for a colour drop: the sentence under `pos` plus the one
 * before and after it, as ProseMirror positions ready for `textBetween` /
 * `setTextSelection`. Returns null when `pos` isn't inside non-empty prose.
 *
 * ponytail: window stays inside the dropped-on textblock; a target sentence at
 * the block edge won't reach into the neighbouring paragraph. Upgrade by
 * resolving prev/next textblock positions if cross-paragraph bleed is wanted.
 */
export function sentenceWindowAt(
  doc: ProseMirrorNode,
  pos: number,
): { from: number; to: number } | null {
  const clamped = Math.min(Math.max(pos, 0), doc.content.size);
  const $pos = doc.resolve(clamped);
  if (!$pos.parent.isTextblock) return null;
  const text = $pos.parent.textContent;
  if (!text.trim()) return null;
  const blockStart = $pos.start();
  const offset = Math.min(Math.max(clamped - blockStart, 0), text.length);
  const spans = sentenceSpans(text);
  if (spans.length === 0) return null;
  let i = spans.findIndex((s) => offset < s.end);
  if (i === -1) i = spans.length - 1;
  const lo = spans[Math.max(0, i - 1)];
  const hi = spans[Math.min(spans.length - 1, i + 1)];
  if (!lo || !hi) return null;
  return { from: blockStart + lo.start, to: blockStart + hi.end };
}
