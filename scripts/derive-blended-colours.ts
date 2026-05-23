// One-shot blended-colour backfill — reads each book's per-source rows
// (algo + LLM today; crowd later) and writes a 'blended' row. New ingests
// get this for free via the pipeline step in lib/inngest/ingest-book.ts.
//
// Usage:
//   pnpm derive:blended              dev
//   pnpm derive:blended:prod         prod

import "./_load-env";
import { blendColours, type SourceInput } from "../lib/colour/blend";
import { getDb, schema } from "../lib/db";

async function main() {
  const db = getDb();

  // Pull every per-source colour row, group by bookId.
  const rows = await db
    .select({
      bookId: schema.bookColours.bookId,
      source: schema.bookColours.source,
      hue: schema.bookColours.hue,
      saturation: schema.bookColours.saturation,
      lightness: schema.bookColours.lightness,
    })
    .from(schema.bookColours);

  type PerBook = {
    algorithmic?: SourceInput;
    llm?: SourceInput;
    crowd?: SourceInput;
  };
  const perBook = new Map<string, PerBook>();
  for (const r of rows) {
    // Don't include the 'blended' row itself as an input — it IS the output.
    if (r.source === "blended") continue;
    const entry = perBook.get(r.bookId) ?? {};
    if (r.source === "algorithmic" || r.source === "llm" || r.source === "crowd") {
      entry[r.source] = { hue: r.hue, saturation: r.saturation, lightness: r.lightness };
    }
    perBook.set(r.bookId, entry);
  }

  if (perBook.size === 0) {
    process.stdout.write("OK  no per-source colours to blend yet\n");
    return;
  }

  let ok = 0;
  let skipped = 0;
  for (const [bookId, sources] of perBook) {
    const blended = blendColours(sources);
    if (!blended) {
      skipped++;
      continue;
    }
    await db
      .insert(schema.bookColours)
      .values({
        bookId,
        source: "blended",
        hue: blended.hue,
        saturation: blended.saturation,
        lightness: blended.lightness,
        justification: blended.justification,
      })
      .onConflictDoUpdate({
        target: [schema.bookColours.bookId, schema.bookColours.source],
        set: {
          hue: blended.hue,
          saturation: blended.saturation,
          lightness: blended.lightness,
          justification: blended.justification,
          computedAt: new Date(),
        },
      });
    ok++;
  }

  process.stdout.write(`OK  blended ${ok} books (skipped ${skipped})\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  });
