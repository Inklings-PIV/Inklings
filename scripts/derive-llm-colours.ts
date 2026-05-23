// One-shot LLM colour backfill — for books that already exist but don't yet
// have a `book_colours` row with source='llm'. New ingests get this for free
// through the pipeline step in `lib/inngest/ingest-book.ts`.
//
// Usage:
//   pnpm derive:llm-colours              dev
//   pnpm derive:llm-colours:prod         prod

import "./_load-env";
import { eq } from "drizzle-orm";
import { deriveLLM } from "../lib/colour/llm";
import { getDb, schema } from "../lib/db";
import type { ClassicalFeatures } from "../lib/stylometry/classical";

async function main() {
  const db = getDb();

  const rows = await db
    .select({
      bookId: schema.books.id,
      title: schema.books.title,
      authorName: schema.authors.name,
      classical: schema.bookFeatures.classical,
    })
    .from(schema.books)
    .innerJoin(schema.authors, eq(schema.books.authorId, schema.authors.id))
    .innerJoin(schema.bookFeatures, eq(schema.bookFeatures.bookId, schema.books.id));

  if (rows.length === 0) {
    process.stdout.write("OK  nothing to backfill\n");
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      process.stdout.write(`→ ${r.title}... `);
      const c = await deriveLLM({
        title: r.title,
        authorName: r.authorName,
        classical: (r.classical as ClassicalFeatures | null) ?? null,
      });
      await db
        .insert(schema.bookColours)
        .values({
          bookId: r.bookId,
          source: "llm",
          hue: c.hue,
          saturation: c.saturation,
          lightness: c.lightness,
          justification: c.justification,
        })
        .onConflictDoUpdate({
          target: [schema.bookColours.bookId, schema.bookColours.source],
          set: {
            hue: c.hue,
            saturation: c.saturation,
            lightness: c.lightness,
            justification: c.justification,
            computedAt: new Date(),
          },
        });
      process.stdout.write(`ok — ${c.justification}\n`);
      ok++;
    } catch (err) {
      process.stdout.write(`fail (${(err as Error).message})\n`);
      failed++;
    }
  }

  process.stdout.write(`\nDONE  ${ok} derived, ${failed} skipped/failed\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  });
