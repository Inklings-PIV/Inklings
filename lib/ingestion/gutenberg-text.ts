const TEXT_URL = (id: number) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`;

// Match the boilerplate markers across the common variants:
//   *** START OF THE PROJECT GUTENBERG EBOOK …
//   *** START OF THIS PROJECT GUTENBERG EBOOK …
//   ***START OF…
// And the matching END markers.
const START_RE = /\*{3}\s*START OF (?:THE |THIS )?PROJECT GUTENBERG EBOOK[^*]*\*{3}/i;
const END_RE = /\*{3}\s*END OF (?:THE |THIS )?PROJECT GUTENBERG EBOOK[^*]*\*{3}/i;

/**
 * Fetch the plaintext of a Project Gutenberg book and strip the licence
 * boilerplate that wraps it. Returns `null` on network error, non-2xx
 * response, or a body that doesn't carry the START marker.
 */
export async function fetchBookText(gutenbergId: number): Promise<string | null> {
  try {
    const res = await fetch(TEXT_URL(gutenbergId));
    if (!res.ok) return null;
    const raw = await res.text();
    return stripGutenbergBoilerplate(raw);
  } catch {
    return null;
  }
}

/**
 * Pure helper. Slices everything between the START and END markers, trims,
 * and returns the body. If the START marker is missing the file isn't a
 * recognisable PG plaintext — return null. If only the END marker is
 * missing (some older files lack it) we return everything after START.
 */
export function stripGutenbergBoilerplate(raw: string): string | null {
  if (!raw) return null;

  const startMatch = START_RE.exec(raw);
  if (!startMatch || startMatch.index === undefined) return null;
  const afterStart = raw.slice(startMatch.index + startMatch[0].length);

  const endMatch = END_RE.exec(afterStart);
  const body =
    endMatch && endMatch.index !== undefined ? afterStart.slice(0, endMatch.index) : afterStart;

  const trimmed = body.trim();
  return trimmed.length > 0 ? trimmed : null;
}
