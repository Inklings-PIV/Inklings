// One-shot embedding backfill for books that already exist but whose
// `book_features.embedding` is still the zeros stub (pre-#14). Re-fetches
// the raw text from Project Gutenberg (we don't cache it), embeds via
// OpenAI text-embedding-3-small, mean-averages chunks, writes the result.
//
// New books get real embeddings automatically through the swapped pipeline
// step in `lib/inngest/ingest-book.ts`. This script is only for the
// already-ingested corpus.
//
// Usage:
//   pnpm backfill:embeddings              all books, dev
//   pnpm backfill:embeddings:prod         all books, prod
//   pnpm backfill:embeddings 135          just Gutenberg #135 (Les Mis), dev

import "./_load-env";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "../lib/db";
import { fetchBookText } from "../lib/ingestion/gutenberg-text";
import { embedText } from "../lib/stylometry/embed";

async function main() {
  // Optional positional arg: a Gutenberg ID to embed in isolation. Skips the
  // others — useful for retrying a single book after a TPM-cap failure.
  const onlyArg = process.argv[2];
  const onlyGutenbergId = onlyArg ? Number.parseInt(onlyArg, 10) : null;
  if (onlyArg && (!onlyGutenbergId || Number.isNaN(onlyGutenbergId))) {
    process.stderr.write(`ERR  invalid Gutenberg ID: ${onlyArg}\n`);
    process.exit(1);
  }

  const db = getDb();
  const rows = await db
    .select({
      bookId: schema.books.id,
      title: schema.books.title,
      gutenbergId: schema.books.gutenbergId,
    })
    .from(schema.books)
    .innerJoin(schema.bookFeatures, eq(schema.bookFeatures.bookId, schema.books.id))
    .where(
      onlyGutenbergId
        ? and(isNotNull(schema.books.gutenbergId), eq(schema.books.gutenbergId, onlyGutenbergId))
        : isNotNull(schema.books.gutenbergId),
    );

  if (rows.length === 0) {
    process.stdout.write("OK  nothing to backfill\n");
    return;
  }

  let ok = 0;
  let failed = 0;
  // OpenAI's tier-1 TPM cap for text-embedding-3-small is 1M tokens/min.
  // A brief sleep between books smooths the request stream so back-to-back
  // big books don't lock us out of the per-minute budget.
  const INTER_BOOK_DELAY_MS = 4_000;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    if (i > 0) await sleep(INTER_BOOK_DELAY_MS);
    if (r.gutenbergId == null) {
      failed++;
      continue;
    }
    try {
      process.stdout.write(`→ ${r.title} (#${r.gutenbergId})... `);
      const text = await fetchBookText(r.gutenbergId);
      if (!text) {
        process.stdout.write("no text, skipped\n");
        failed++;
        continue;
      }
      const embedding = await embedText(text);
      await db
        .update(schema.bookFeatures)
        .set({ embedding, computedAt: new Date() })
        .where(eq(schema.bookFeatures.bookId, r.bookId));
      process.stdout.write("ok\n");
      ok++;
    } catch (err) {
      process.stdout.write(`fail (${(err as Error).message})\n`);
      failed++;
    }
  }

  process.stdout.write(`\nDONE  ${ok} embedded, ${failed} skipped/failed\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  });
