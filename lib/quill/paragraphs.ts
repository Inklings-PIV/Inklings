// Split editor HTML into paragraph-level plain text (B5 EmoArc hue band).
//
// The Readout shows one global hue today; EmoArc (Amin et al., "Interactive
// Emotion Graph for Human-AI Collaborative Writing") shows the *arc* across a
// text. To plot that arc we need each block of prose on its own, so we cut the
// TipTap HTML on block-closing tags and strip the rest to readable text.

const BLOCK_CLOSE = /<\/(?:p|h[1-6]|blockquote|li|pre)>/gi;

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");
}

/**
 * Split editor HTML into an ordered list of non-empty paragraph texts. Blocks
 * are delimited by their closing tag; inline markup is flattened. Plain text
 * with no block tags is returned as a single paragraph.
 */
export function splitParagraphs(html: string): string[] {
  return html
    .split(BLOCK_CLOSE)
    .map((chunk) => stripTags(chunk).trim())
    .filter((chunk) => chunk.length > 0);
}
