// One-shot modern (embedding) UMAP recompute that bypasses Inngest. The
// Inngest function in lib/inngest/recompute-layout.ts handles the cron +
// on-demand path in prod; this is for local backfills.
//
// Usage:
//   pnpm recompute:modern               dev
//   pnpm recompute:modern:prod          prod (DRIZZLE_ENV=prod)

import "./_load-env";
import { sql } from "drizzle-orm";
import { getDb, schema } from "../lib/db";
import { umapProjection } from "../lib/layout/umap";

const LAYOUT_VERSION = 1;

async function main() {
  const db = getDb();

  const rows = await db
    .select({
      bookId: schema.bookFeatures.bookId,
      embedding: schema.bookFeatures.embedding,
    })
    .from(schema.bookFeatures);

  const books = rows.flatMap((r) =>
    r.embedding && r.embedding.length > 0 ? [{ bookId: r.bookId, embedding: r.embedding }] : [],
  );

  if (books.length === 0) {
    process.stdout.write("OK  no books with embeddings (run pnpm backfill:embeddings first)\n");
    return;
  }

  const xy = umapProjection(
    books.map((b) => b.embedding),
    { seed: 42 },
  );

  await db
    .insert(schema.bookLayout)
    .values(
      books.map((b, i) => ({
        bookId: b.bookId,
        mode: "modern" as const,
        layoutVersion: LAYOUT_VERSION,
        x: xy[i]?.[0] ?? 0,
        y: xy[i]?.[1] ?? 0,
      })),
    )
    .onConflictDoUpdate({
      target: [schema.bookLayout.bookId, schema.bookLayout.mode, schema.bookLayout.layoutVersion],
      set: {
        x: sql`excluded.x`,
        y: sql`excluded.y`,
        computedAt: new Date(),
      },
    });

  process.stdout.write(`OK  laid out ${books.length} books by modern embedding\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  });
