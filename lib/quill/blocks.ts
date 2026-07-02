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

/** One sentence located in the document, as ProseMirror positions. */
export type SentenceRange = { from: number; to: number };

/**
 * Every sentence in the document, in reading order, as PM positions — flattened
 * across paragraphs so a window can span block boundaries. Built by mapping each
 * textblock's {@link sentenceSpans} offsets onto its content positions.
 *
 * ponytail: assumes a textblock's PM positions advance one-per-character (plain
 * text). An inline leaf with size but no text (e.g. a hard break) would shift
 * the mapping; upgrade to walk inline nodes if those land in the editor.
 */
export function documentSentences(doc: ProseMirrorNode): SentenceRange[] {
  const out: SentenceRange[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = node.textContent;
    if (text.trim()) {
      const start = pos + 1; // first inline position inside the block
      for (const s of sentenceSpans(text)) {
        out.push({ from: start + s.start, to: start + s.end });
      }
    }
    return false; // a textblock holds only inline content — don't descend
  });
  return out;
}

/** Span covering sentence `i` plus `radius` sentences on each side (clamped).
 *  Pure index math, split out so it's testable without a ProseMirror doc. */
export function windowAround(
  sentences: SentenceRange[],
  i: number,
  radius: number,
): SentenceRange | null {
  if (sentences.length === 0) return null;
  const lo = sentences[Math.max(0, i - radius)];
  const hi = sentences[Math.min(sentences.length - 1, i + radius)];
  if (!lo || !hi) return null;
  return { from: lo.from, to: hi.to };
}

/**
 * The rewrite span for a colour drop / brush: the sentence under `pos` plus
 * `radius` sentences on each side, crossing paragraph boundaries. `radius` maps
 * from the brush size (1 sentence → 0, 3 → 1, 7 → 3). Returns null when the
 * document has no prose.
 */
export function sentenceWindowAt(
  doc: ProseMirrorNode,
  pos: number,
  radius = 1,
): { from: number; to: number } | null {
  const sentences = documentSentences(doc);
  if (sentences.length === 0) return null;
  const clamped = Math.min(Math.max(pos, 0), doc.content.size);
  let i = sentences.findIndex((s) => clamped < s.to);
  if (i === -1) i = sentences.length - 1;
  return windowAround(sentences, i, radius);
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Sentence brush with a minimum useful span. Starts at the dropped-on sentence,
 * then expands forward, then backward, until it has enough words or no prose is
 * left to include.
 */
export function sentenceWindowAtMinWords(
  doc: ProseMirrorNode,
  pos: number,
  minWords: number,
): { from: number; to: number } | null {
  const sentences = documentSentences(doc);
  if (sentences.length === 0) return null;
  const clamped = Math.min(Math.max(pos, 0), doc.content.size);
  let sentenceIndex = sentences.findIndex((s) => clamped < s.to);
  if (sentenceIndex === -1) sentenceIndex = sentences.length - 1;

  let start = sentenceIndex;
  let end = sentenceIndex;
  const rangeText = () => {
    const first = sentences[start];
    const last = sentences[end];
    if (!first || !last) return "";
    return doc.textBetween(first.from, last.to, " ");
  };

  while (wordCount(rangeText()) < minWords && (end < sentences.length - 1 || start > 0)) {
    if (end < sentences.length - 1) end += 1;
    else if (start > 0) start -= 1;
  }

  const first = sentences[start];
  const last = sentences[end];
  if (!first || !last) return null;
  return { from: first.from, to: last.to };
}
