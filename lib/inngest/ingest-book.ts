import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { fetchBookMeta } from "@/lib/ingestion/gutenberg-meta";
import { fetchBookText } from "@/lib/ingestion/gutenberg-text";
import { inngest } from "@/lib/inngest/client";
import { extractClassical } from "@/lib/stylometry/classical";

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

    const text = await step.run("fetch-text", async () => {
      const result = await fetchBookText(gutenbergId);
      if (!result) throw new Error(`No text body for Gutenberg #${gutenbergId}`);
      return result;
    });

    const wordCount = countWords(text);

    const { authorId, bookId } = await step.run("upsert-corpus", async () => {
      const db = getDb();
      const author = meta.authors[0];
      if (!author) throw new Error(`No author on Gutenberg #${gutenbergId}`);

      const [authorRow] = await db
        .insert(schema.authors)
        .values({
          name: author.name,
          slug: slugify(author.name),
          gutenbergId: author.gutenbergId,
          birthYear: author.birthYear,
          deathYear: author.deathYear,
        })
        .onConflictDoUpdate({
          target: schema.authors.slug,
          set: {
            name: author.name,
            birthYear: author.birthYear,
            deathYear: author.deathYear,
            updatedAt: new Date(),
          },
        })
        .returning({ id: schema.authors.id });
      if (!authorRow) throw new Error("Failed to upsert author");

      const [bookRow] = await db
        .insert(schema.books)
        .values({
          authorId: authorRow.id,
          title: meta.title,
          slug: slugify(meta.title),
          gutenbergId,
          lang: meta.language ?? "en",
          wordCount,
          status: "ingesting",
        })
        .onConflictDoUpdate({
          target: schema.books.gutenbergId,
          set: {
            authorId: authorRow.id,
            title: meta.title,
            slug: slugify(meta.title),
            lang: meta.language ?? "en",
            wordCount,
            status: "ingesting",
            updatedAt: new Date(),
          },
        })
        .returning({ id: schema.books.id });
      if (!bookRow) throw new Error("Failed to upsert book");

      return { authorId: authorRow.id, bookId: bookRow.id };
    });

    const classical = await step.run("extract-classical", () => extractClassical(text));

    const embedding = await step.run("embed-text", () => {
      // TODO(#14): replace with embedText(text) from lib/stylometry/embed.ts.
      return new Array<number>(1536).fill(0);
    });

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
