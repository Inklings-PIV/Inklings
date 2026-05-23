import { eq } from "drizzle-orm";
import { z } from "zod";
import { deriveAlgorithmic } from "@/lib/colour/algorithmic";
import { blendColours } from "@/lib/colour/blend";
import { deriveLLM } from "@/lib/colour/llm";
import { getDb, schema } from "@/lib/db";
import { fetchBookMeta } from "@/lib/ingestion/gutenberg-meta";
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
