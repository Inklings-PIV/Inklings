// Fetches and parses Project Gutenberg's full catalog CSV (~70k rows,
// ~50 MB uncompressed) and returns the top-N curated English books.
// Used by `scripts/seed-corpus.ts --top=N`.
//
// "Top" is best-effort: PG's public CSV has no Downloads column, so we
// use the `Bookshelves` field as a quality proxy. Books on any PG
// bookshelf are editorially curated (Best Books Ever Listings,
// Banned Books, Children's Literature, etc.) — a fair signal that
// they're notable rather than obscure pamphlets. Within the curated
// set we sort by gutenbergId ascending, which roughly tracks
// public-domain age and canon-establishment for the classics.
//
// The file is cached to .cache/pg_catalog.csv for a week — PG's catalog
// doesn't move fast, so the throttling is courteous and reruns are
// instant after the first fetch.

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CATALOG_URL = "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv";
const CACHE_DIR = ".cache";
const CACHE_FILE = "pg_catalog.csv";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CatalogEntry = {
  gutenbergId: number;
  title: string;
  /** Raw "; "-joined author string from PG's catalog; we don't split it. */
  authors: string;
  language: string;
  /** Semicolon-joined PG bookshelf tags; empty for uncurated books. */
  bookshelves: string;
};

async function getCatalogText(): Promise<string> {
  const cachePath = join(process.cwd(), CACHE_DIR, CACHE_FILE);
  try {
    const s = await stat(cachePath);
    if (Date.now() - s.mtimeMs < CACHE_TTL_MS) {
      return await readFile(cachePath, "utf-8");
    }
  } catch {
    // cache miss — fetch fresh
  }

  process.stdout.write(`Fetching PG catalog (~50 MB)…\n`);
  const res = await fetch(CATALOG_URL);
  if (!res.ok) throw new Error(`PG catalog fetch failed: ${res.status}`);
  const text = await res.text();

  await mkdir(join(process.cwd(), CACHE_DIR), { recursive: true });
  await writeFile(cachePath, text, "utf-8");
  return text;
}

/**
 * Minimal CSV parser. PG's catalog is well-formed RFC-4180-style:
 * commas separate, double-quotes wrap fields containing commas or
 * newlines, embedded quotes double up. ~70k rows; running this fully
 * in-memory is fine for a dev script.
 */
function* parseCsv(text: string): Generator<string[]> {
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n") {
      row.push(field);
      yield row;
      row = [];
      field = "";
      continue;
    }
    if (c === "\r") continue;
    field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    yield row;
  }
}

export async function fetchTopEnglishBooks(n: number): Promise<CatalogEntry[]> {
  const text = await getCatalogText();
  const rows = parseCsv(text);

  const header = rows.next().value;
  if (!header) throw new Error("PG catalog appears empty");

  // Columns: Text#,Type,Issued,Title,Language,Authors,Subjects,LoCC,Bookshelves
  const col = {
    id: header.indexOf("Text#"),
    type: header.indexOf("Type"),
    title: header.indexOf("Title"),
    language: header.indexOf("Language"),
    authors: header.indexOf("Authors"),
    locc: header.indexOf("LoCC"),
    bookshelves: header.indexOf("Bookshelves"),
  };
  for (const [name, idx] of Object.entries(col)) {
    if (idx < 0) throw new Error(`PG catalog missing column: ${name}`);
  }

  const entries: CatalogEntry[] = [];
  for (const row of rows) {
    if (row[col.type] !== "Text") continue;
    if (row[col.language] !== "en") continue;
    const id = Number.parseInt(row[col.id] ?? "", 10);
    if (!Number.isFinite(id) || id <= 0) continue;
    const title = (row[col.title] ?? "").trim();
    if (!title) continue;
    const bookshelves = (row[col.bookshelves] ?? "").trim();
    if (bookshelves.length === 0) continue;
    // Stylometry + colour derivation are tuned for fiction; we drop
    // anything outside Library of Congress class P (Language and
    // Literature). PR=English lit, PS=American lit, PT=Germanic /
    // Scandinavian, PZ=Juvenile fiction, PQ=Romance-language lit
    // (translated), PA/PB/PJ=Classical & Asian (translated). Keeps
    // out the Declaration of Independence, the CIA Factbook, the
    // Bible, and similar non-fiction.
    const locc = (row[col.locc] ?? "").trim();
    if (!/^P[ABJQRSTZ]\b/.test(locc)) continue;
    entries.push({
      gutenbergId: id,
      title,
      authors: (row[col.authors] ?? "").trim(),
      language: "en",
      bookshelves,
    });
  }

  // Within the curated set, low gutenbergId tracks public-domain age
  // and canon-establishment for the classics; stable ordering across
  // reruns also means rerunning seed-corpus picks up where it left off.
  entries.sort((a, b) => a.gutenbergId - b.gutenbergId);
  return entries.slice(0, n);
}
