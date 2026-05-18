import "./_load-env";
import { getDb, schema } from "../lib/db";

const { authors, books, bookFeatures, bookLayout } = schema;

async function main() {
  const db = getDb();

  const [author] = await db
    .insert(authors)
    .values({
      name: "Jane Austen",
      slug: "jane-austen",
      gutenbergId: 68,
      birthYear: 1775,
      deathYear: 1817,
    })
    .onConflictDoUpdate({
      target: authors.slug,
      set: { name: "Jane Austen", updatedAt: new Date() },
    })
    .returning();

  if (!author) throw new Error("Failed to upsert author");
  process.stdout.write(`OK  author: ${author.name} (${author.id})\n`);

  const [book] = await db
    .insert(books)
    .values({
      authorId: author.id,
      title: "Pride and Prejudice",
      slug: "pride-and-prejudice",
      gutenbergId: 1342,
      lang: "en",
      wordCount: 122189,
      status: "ready",
      ingestedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: books.gutenbergId,
      set: { status: "ready", ingestedAt: new Date() },
    })
    .returning();

  if (!book) throw new Error("Failed to upsert book");
  process.stdout.write(`OK  book:   ${book.title} (${book.id})\n`);

  // TODO(#13): replace stub with wink-nlp classical feature extraction.
  // TODO(#14): replace zero vector with text-embedding-3-small embedding.
  await db
    .insert(bookFeatures)
    .values({
      bookId: book.id,
      classical: { stub: true, note: "Replace in #13" },
      embedding: new Array(1536).fill(0),
    })
    .onConflictDoUpdate({
      target: bookFeatures.bookId,
      set: {
        classical: { stub: true, note: "Replace in #13" },
        computedAt: new Date(),
      },
    });
  process.stdout.write("OK  features: stub classical + zero embedding\n");

  // TODO(#15, #16, #17): replace stub coords with UMAP outputs.
  await db
    .insert(bookLayout)
    .values([
      { bookId: book.id, mode: "classical", layoutVersion: 1, x: 0, y: 0 },
      { bookId: book.id, mode: "modern", layoutVersion: 1, x: 0.2, y: 0.15 },
      { bookId: book.id, mode: "by-hue", layoutVersion: 1, x: -0.2, y: 0.15 },
    ])
    .onConflictDoNothing();
  process.stdout.write("OK  layout:   3 stub coords (classical, modern, by-hue)\n");

  process.stdout.write("\nTracer seeded. Visit /inkwell to see the dot.\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  });
