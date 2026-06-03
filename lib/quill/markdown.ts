// Convert the Quill editor's HTML (TipTap StarterKit output) to Markdown for
// export (super-feature F4). Pure and deterministic. Handles the block and
// inline marks StarterKit produces — headings, paragraphs, blockquotes, flat
// bullet/ordered lists, bold/italic/code, and line breaks.

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function htmlToMarkdown(html: string): string {
  if (!html.trim()) return "";

  let s = html;

  // Inline marks first, so block handlers see plain-ish content.
  s = s.replace(/<(strong|b)>(.*?)<\/\1>/gis, "**$2**");
  s = s.replace(/<(em|i)>(.*?)<\/\1>/gis, "*$2*");
  s = s.replace(/<code>(.*?)<\/code>/gis, "`$1`");
  s = s.replace(/<br\s*\/?>/gi, "\n");

  // Lists (flat). Strip any inner <p> the renderer may wrap items in.
  s = s.replace(
    /<ul>(.*?)<\/ul>/gis,
    (_m, inner: string) =>
      `${inner.replace(/<li>(.*?)<\/li>/gis, (_x, item: string) => `- ${item.replace(/<\/?p>/gi, "").trim()}\n`)}\n`,
  );
  s = s.replace(/<ol>(.*?)<\/ol>/gis, (_m, inner: string) => {
    let n = 0;
    return `${inner.replace(/<li>(.*?)<\/li>/gis, (_x, item: string) => {
      n += 1;
      return `${n}. ${item.replace(/<\/?p>/gi, "").trim()}\n`;
    })}\n`;
  });

  // Headings.
  s = s.replace(/<h1>(.*?)<\/h1>/gis, "# $1\n\n");
  s = s.replace(/<h2>(.*?)<\/h2>/gis, "## $1\n\n");
  s = s.replace(/<h3>(.*?)<\/h3>/gis, "### $1\n\n");

  // Blockquotes — prefix every line with "> ".
  s = s.replace(/<blockquote>(.*?)<\/blockquote>/gis, (_m, inner: string) => {
    const text = inner.replace(/<\/?p>/gi, "\n").trim();
    return `${text
      .split(/\n+/)
      .map((line) => `> ${line.trim()}`)
      .join("\n")}\n\n`;
  });

  // Paragraphs.
  s = s.replace(/<p>(.*?)<\/p>/gis, "$1\n\n");

  // Drop any remaining tags, decode entities, normalise blank lines.
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  return s.replace(/\n{3,}/g, "\n\n").trim();
}
