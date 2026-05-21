import { XMLParser } from "fast-xml-parser";

export type GutenbergAuthor = {
  /** Author name normalised to "Firstname Lastname" order. */
  name: string;
  /** Project Gutenberg's per-agent ID, extracted from `rdf:about="…/agents/68"`. */
  gutenbergId: number | null;
  birthYear: number | null;
  deathYear: number | null;
};

export type GutenbergBookMeta = {
  /** The Gutenberg book ID (the one passed in). */
  id: number;
  title: string;
  authors: GutenbergAuthor[];
  /** RFC 4646 / BCP 47 code, e.g. "en". */
  language: string | null;
  /** Library of Congress subject headings (LCSH) or call numbers (LCC). */
  subjects: string[];
};

const RDF_URL = (id: number) => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.rdf`;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  removeNSPrefix: true,
});

/**
 * Fetch and parse Project Gutenberg's RDF metadata for a single book.
 * Returns `null` on network error, 4xx/5xx response, or malformed XML.
 */
export async function fetchBookMeta(gutenbergId: number): Promise<GutenbergBookMeta | null> {
  try {
    const res = await fetch(RDF_URL(gutenbergId));
    if (!res.ok) return null;
    const xml = await res.text();
    return parseGutenbergRdf(xml, gutenbergId);
  } catch {
    return null;
  }
}

/**
 * Pure parser — separated from the fetch so it's easy to test against a fixture.
 */
export function parseGutenbergRdf(xml: string, gutenbergId: number): GutenbergBookMeta | null {
  try {
    const doc = parser.parse(xml) as RdfDocument;
    const ebook = doc?.RDF?.ebook;
    if (!ebook) return null;

    const title = stringValue(ebook.title).trim();
    if (!title) return null;

    return {
      id: gutenbergId,
      title,
      authors: extractAuthors(ebook),
      language: extractLanguage(ebook),
      subjects: extractSubjects(ebook),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type RdfDocument = {
  RDF?: { ebook?: RdfEbook };
};

type RdfEbook = {
  title?: RdfTextNode;
  creator?: RdfCreator | RdfCreator[];
  editor?: RdfCreator | RdfCreator[];
  language?: RdfDescriptionWrapper;
  subject?: RdfDescriptionWrapper | RdfDescriptionWrapper[];
};

type RdfCreator = { agent?: RdfAgent } | RdfAgent;

type RdfAgent = {
  "@_about"?: string;
  name?: RdfTextNode;
  birthdate?: RdfTextNode;
  deathdate?: RdfTextNode;
};

type RdfDescriptionWrapper = {
  Description?: {
    value?: RdfTextNode;
    memberOf?: { "@_resource"?: string };
  };
};

type RdfTextNode = string | number | { "#text"?: string | number };

function extractAuthors(ebook: RdfEbook): GutenbergAuthor[] {
  const raw = ebook.creator ?? ebook.editor;
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .map((c) => {
      const agent = "agent" in c ? c.agent : (c as RdfAgent);
      return parseAgent(agent);
    })
    .filter((a): a is GutenbergAuthor => a !== null);
}

function parseAgent(agent: RdfAgent | undefined): GutenbergAuthor | null {
  if (!agent) return null;
  const rawName = stringValue(agent.name).trim();
  if (!rawName) return null;
  return {
    name: flipName(rawName),
    gutenbergId: parseAgentId(agent["@_about"]),
    birthYear: parseYear(agent.birthdate),
    deathYear: parseYear(agent.deathdate),
  };
}

function flipName(name: string): string {
  // PG stores authors as "Lastname, Firstname". Flip when it matches that shape.
  const parts = name.split(",").map((p) => p.trim());
  if (parts.length === 2 && parts[0] && parts[1]) {
    return `${parts[1]} ${parts[0]}`;
  }
  return name;
}

function parseAgentId(about: string | undefined): number | null {
  if (typeof about !== "string") return null;
  const m = about.match(/agents\/(\d+)/);
  if (!m?.[1]) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function parseYear(raw: RdfTextNode | undefined): number | null {
  const s = stringValue(raw).trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function extractLanguage(ebook: RdfEbook): string | null {
  const val = ebook.language?.Description?.value;
  const s = stringValue(val).trim();
  return s || null;
}

function extractSubjects(ebook: RdfEbook): string[] {
  const raw = ebook.subject;
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const v = stringValue(s?.Description?.value).trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function stringValue(node: RdfTextNode | undefined): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (typeof node === "object" && "#text" in node) {
    const t = node["#text"];
    if (typeof t === "string") return t;
    if (typeof t === "number") return String(t);
  }
  return "";
}
