// Backfill algorithmic colours for all books that already have features.
// New ingests get this for free via the `derive-algorithmic-colour` step
// in `lib/inngest/ingest-book.ts`; this script handles the existing corpus.
//
// Usage:
//   pnpm derive:colours         dev
//   pnpm derive:colours:prod    prod (DRIZZLE_ENV=prod via package script)

import "./_load-env";
import { deriveAlgorithmic } from "../lib/colour/algorithmic";
import { getDb, schema } from "../lib/db";
import type { ClassicalFeatures } from "../lib/stylometry/classical";

async function main() {
  const db = getDb();

  const rows = await db
    .select({
      bookId: schema.bookFeatures.bookId,
      classical: schema.bookFeatures.classical,
    })
    .from(schema.bookFeatures);

  let written = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!row.classical) {
      skipped++;
      continue;
    }
    const c = deriveAlgorithmic(row.classical as ClassicalFeatures);
    await db
      .insert(schema.bookColours)
      .values({
        bookId: row.bookId,
        source: "algorithmic",
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
    written++;
  }

  process.stdout.write(`OK  derived ${written} algorithmic colours (skipped ${skipped})\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  });
