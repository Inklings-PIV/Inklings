import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { deriveAlgorithmic } from "@/lib/colour/algorithmic";
import { blendColours } from "@/lib/colour/blend";
import { deriveLLM } from "@/lib/colour/llm";
import { getDb, schema } from "@/lib/db";
import { fetchBookMeta, type GutenbergAuthor } from "@/lib/ingestion/gutenberg-meta";
import { fetchBookText } from "@/lib/ingestion/gutenberg-text";
import { inngest } from "@/lib/inngest/client";
import { extractClassical } from "@/lib/stylometry/classical";
import { embedText } from "@/lib/stylometry/embed";

const PayloadSchema = z.object({
  gutenbergId: z.number().int().positive(),
});

export const ingestBook = inngest.createFunction(
  {
    id: "ingest-book",
    triggers: [{ event: "corpus/book.ingest" }],
    retries: 3,
    // Cap parallel fetches so we don't hammer Project Gutenberg.
    concurrency: { limit: 2, key: "ingest-book" },
  },
  async ({ event, step }) => {
    const { gutenbergId } = PayloadSchema.parse(event.data);

    const meta = await step.run("fetch-meta", async () => {
      const result = await fetchBookMeta(gutenbergId);
      if (!result) throw new Error(`No metadata for Gutenberg #${gutenbergId}`);
      return result;
    });

    // Inline fetch — the full plain-text body exceeds Inngest's per-step
    // output cap (~4 MB in dev/cloud) for collected-works ebooks like
    // Shakespeare #100. Wrapping this in step.run persists the text into
    // run state and hard-fails with "step output size is greater than
    // the limit". Re-fetched on every retry, but Gutenberg is free + cheap
    // at this volume — small cost for the rare retry case. (#87)
    const text = await fetchBookText(gutenbergId);
    if (!text) throw new Error(`No text body for Gutenberg #${gutenbergId}`);

    const wordCount = countWords(text);

    const { authorId, bookId } = await step.run("upsert-corpus", async () => {
      const author = meta.authors[0];
      if (!author) throw new Error(`No author on Gutenberg #${gutenbergId}`);

      const authorId = await upsertAuthor(author);
      const bookId = await upsertBook({
        gutenbergId,
        authorId,
        title: meta.title,
        lang: meta.language ?? "en",
        wordCount,
      });
      return { authorId, bookId };
    });

    const classical = await step.run("extract-classical", () => extractClassical(text));

    const embedding = await step.run("embed-text", () => embedText(text));

    await step.run("save-features", async () => {
      const db = getDb();
      await db
        .insert(schema.bookFeatures)
        .values({ bookId, classical, embedding })
        .onConflictDoUpdate({
          target: schema.bookFeatures.bookId,
          set: { classical, embedding, computedAt: new Date() },
        });
    });

    const algorithmic = await step.run("derive-algorithmic-colour", () =>
      deriveAlgorithmic(classical),
    );

    await step.run("save-algorithmic-colour", async () => {
      const db = getDb();
      const row = {
        bookId,
        source: "algorithmic" as const,
        hue: algorithmic.hue,
        saturation: algorithmic.saturation,
        lightness: algorithmic.lightness,
        justification: algorithmic.justification,
      };
      await db
        .insert(schema.bookColours)
        .values(row)
        .onConflictDoUpdate({
          target: [schema.bookColours.bookId, schema.bookColours.source],
          set: {
            hue: row.hue,
            saturation: row.saturation,
            lightness: row.lightness,
            justification: row.justification,
            computedAt: new Date(),
          },
        });
    });

    const llm = await step.run("derive-llm-colour", () =>
      deriveLLM({ title: meta.title, authorName: meta.authors[0]?.name ?? "Unknown", classical }),
    );

    await step.run("save-llm-colour", async () => {
      const db = getDb();
      const row = {
        bookId,
        source: "llm" as const,
        hue: llm.hue,
        saturation: llm.saturation,
        lightness: llm.lightness,
        justification: llm.justification,
      };
      await db
        .insert(schema.bookColours)
        .values(row)
        .onConflictDoUpdate({
          target: [schema.bookColours.bookId, schema.bookColours.source],
          set: {
            hue: row.hue,
            saturation: row.saturation,
            lightness: row.lightness,
            justification: row.justification,
            computedAt: new Date(),
          },
        });
    });

    const blended = await step.run("derive-blended-colour", () =>
      blendColours({ algorithmic, llm }),
    );

    if (blended) {
      await step.run("save-blended-colour", async () => {
        const db = getDb();
        const row = {
          bookId,
          source: "blended" as const,
          hue: blended.hue,
          saturation: blended.saturation,
          lightness: blended.lightness,
          justification: blended.justification,
        };
        await db
          .insert(schema.bookColours)
          .values(row)
          .onConflictDoUpdate({
            target: [schema.bookColours.bookId, schema.bookColours.source],
            set: {
              hue: row.hue,
              saturation: row.saturation,
              lightness: row.lightness,
              justification: row.justification,
              computedAt: new Date(),
            },
          });
      });
    }

    await step.run("mark-ready", async () => {
      const db = getDb();
      await db
        .update(schema.books)
        .set({ status: "ready", ingestedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.books.id, bookId));
    });

    await step.sendEvent("emit-ingested", {
      name: "corpus/book.ingested",
      data: { bookId, gutenbergId, authorId, title: meta.title },
    });

    return { bookId, authorId, gutenbergId, title: meta.title };
  },
);

// ---------------------------------------------------------------------------
// Helpers (exported for tests)
// ---------------------------------------------------------------------------

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Disambiguation (#56). Two authors with the same name collide on
// authors.slug; two translations of the same work collide on
// (books.gutenberg_id, lang). Both helpers degrade gracefully through
// suffix variants before giving up.
// ---------------------------------------------------------------------------

/**
 * Generates slug candidates for an author, increasingly specific. The
 * caller tries them in order; the first one that doesn't collide wins.
 */
export function* authorSlugCandidates(meta: GutenbergAuthor): Generator<string> {
  const base = slugify(meta.name);
  yield base;
  if (meta.birthYear) yield `${base}-${meta.birthYear}`;
  if (meta.birthYear && meta.deathYear) yield `${base}-${meta.birthYear}-${meta.deathYear}`;
  // Last-resort suffix — vanishingly unlikely we get here, but it keeps
  // ingestion from failing on a 3-way collision of identically-named
  // authors with overlapping lifespans.
  yield `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

async function upsertAuthor(meta: GutenbergAuthor): Promise<string> {
  const db = getDb();

  // If we already know this author by their Gutenberg agent id, update in
  // place — keeps the existing (possibly disambiguated) slug intact.
  if (meta.gutenbergId != null) {
    const [existing] = await db
      .select({ id: schema.authors.id })
      .from(schema.authors)
      .where(eq(schema.authors.gutenbergId, meta.gutenbergId))
      .limit(1);
    if (existing) {
      await db
        .update(schema.authors)
        .set({
          name: meta.name,
          birthYear: meta.birthYear,
          deathYear: meta.deathYear,
          updatedAt: new Date(),
        })
        .where(eq(schema.authors.id, existing.id));
      return existing.id;
    }
  }

  // New author — walk the candidate slugs until one isn't taken. Insert
  // is the source of truth; ON CONFLICT DO NOTHING returns no row when
  // the slug is already in use, and we try the next candidate.
  for (const slug of authorSlugCandidates(meta)) {
    const [row] = await db
      .insert(schema.authors)
      .values({
        name: meta.name,
        slug,
        gutenbergId: meta.gutenbergId,
        birthYear: meta.birthYear,
        deathYear: meta.deathYear,
      })
      .onConflictDoNothing({ target: schema.authors.slug })
      .returning({ id: schema.authors.id });
    if (row) return row.id;
  }
  throw new Error(`Could not disambiguate slug for author ${meta.name}`);
}

type UpsertBookInput = {
  gutenbergId: number;
  authorId: string;
  title: string;
  lang: string;
  wordCount: number;
};

async function upsertBook(input: UpsertBookInput): Promise<string> {
  const db = getDb();
  const { gutenbergId, authorId, title, lang, wordCount } = input;

  // Same gutenberg_id + lang ⇒ a re-ingest of an existing row. Update.
  const [sameLang] = await db
    .select({ id: schema.books.id })
    .from(schema.books)
    .where(and(eq(schema.books.gutenbergId, gutenbergId), eq(schema.books.lang, lang)))
    .limit(1);
  if (sameLang) {
    await db
      .update(schema.books)
      .set({
        authorId,
        title,
        wordCount,
        status: "ingesting",
        updatedAt: new Date(),
      })
      .where(eq(schema.books.id, sameLang.id));
    return sameLang.id;
  }

  // Same gutenberg_id, different lang ⇒ a translation. Link to the first
  // row ingested for this gutenberg_id; the UI can later use this chain
  // to surface "translations of the same work" (out of scope for #56).
  let translationOf: string | null = null;
  const [original] = await db
    .select({ id: schema.books.id })
    .from(schema.books)
    .where(eq(schema.books.gutenbergId, gutenbergId))
    .orderBy(asc(schema.books.createdAt))
    .limit(1);
  if (original) translationOf = original.id;

  const slug = await pickAvailableBookSlug(authorId, slugify(title), lang);
  const [row] = await db
    .insert(schema.books)
    .values({
      authorId,
      title,
      slug,
      gutenbergId,
      lang,
      wordCount,
      status: "ingesting",
      translationOf,
    })
    .returning({ id: schema.books.id });
  if (!row) throw new Error(`Failed to insert book for Gutenberg #${gutenbergId}`);
  return row.id;
}

async function pickAvailableBookSlug(
  authorId: string,
  base: string,
  lang: string,
): Promise<string> {
  const db = getDb();
  // Same author can have two books with the same slugified title only
  // when they're translations of the same work — append the lang code,
  // then a random suffix if even that's taken.
  const candidates = [
    base,
    `${base}-${lang}`,
    `${base}-${lang}-${Math.random().toString(36).slice(2, 4)}`,
  ];
  for (const slug of candidates) {
    const [taken] = await db
      .select({ id: schema.books.id })
      .from(schema.books)
      .where(and(eq(schema.books.authorId, authorId), eq(schema.books.slug, slug)))
      .limit(1);
    if (!taken) return slug;
  }
  throw new Error(`Could not pick a unique book slug for ${base} (author ${authorId})`);
}
