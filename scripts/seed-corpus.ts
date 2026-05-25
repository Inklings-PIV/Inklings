import "./_load-env";
import { inArray } from "drizzle-orm";
import { getDb, schema } from "../lib/db";
import { fetchTopEnglishBooks } from "../lib/ingestion/gutenberg-catalog";
import { SEED_BOOKS, type SeedBook } from "../lib/ingestion/seed-list";
import { inngest } from "../lib/inngest/client";

type Args = { top: number; dryRun: boolean };

function parseArgs(argv: readonly string[]): Args {
  const map = new Map<string, string>();
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const [k, v] = a.slice(2).split("=");
    if (k) map.set(k, v ?? "true");
  }
  const topRaw = map.get("top");
  const top = topRaw ? Math.max(1, Number.parseInt(topRaw, 10)) : 0;
  return { top, dryRun: map.get("dry-run") === "true" };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Sourcing: `--top=N` pulls the N most-downloaded English books from
  // PG's catalog; absent the flag we fall back to the hand-picked
  // SEED_BOOKS for predictable small runs.
  let candidates: SeedBook[];
  if (args.top > 0) {
    const top = await fetchTopEnglishBooks(args.top);
    candidates = top.map((e) => ({
      gutenbergId: e.gutenbergId,
      title: e.title,
      author: e.authors,
    }));
    process.stdout.write(`Pulled top ${candidates.length} from PG catalog.\n`);
  } else {
    candidates = [...SEED_BOOKS];
    process.stdout.write(`Using hand-picked SEED_BOOKS (${candidates.length} entries).\n`);
  }

  // Skip-already-ingested — without this, every rerun re-fires the
  // pipeline for books we've already processed and double-bills the
  // embedding + LLM calls. Failed books are kept in the candidate set
  // so they get a retry on the next run.
  const ids = candidates.map((c) => c.gutenbergId);
  const db = getDb();
  const existing = await db
    .select({ gutenbergId: schema.books.gutenbergId, status: schema.books.status })
    .from(schema.books)
    .where(inArray(schema.books.gutenbergId, ids));
  const skipSet = new Set(existing.filter((r) => r.status !== "failed").map((r) => r.gutenbergId));
  const fresh = candidates.filter((c) => !skipSet.has(c.gutenbergId));

  process.stdout.write(
    `\n${candidates.length} candidates · ${skipSet.size} already done (skip) · ${fresh.length} to enqueue\n\n`,
  );
  for (const b of fresh.slice(0, 20)) {
    const title = b.title.length > 50 ? `${b.title.slice(0, 47)}…` : b.title;
    process.stdout.write(
      `    #${String(b.gutenbergId).padStart(6)}  ${title.padEnd(50)}  ${b.author}\n`,
    );
  }
  if (fresh.length > 20) process.stdout.write(`    … and ${fresh.length - 20} more\n`);

  if (args.dryRun) {
    process.stdout.write("\n(dry run, not sending events)\n");
    return;
  }
  if (fresh.length === 0) {
    process.stdout.write("\nNothing to enqueue.\n");
    return;
  }

  const events = fresh.map((b) => ({
    name: "corpus/book.ingest" as const,
    data: { gutenbergId: b.gutenbergId },
  }));
  const result = await inngest.send(events);
  process.stdout.write(
    `\nOK — enqueued ${fresh.length} books, ${result.ids.length} event ids returned by Inngest.\n`,
  );
  process.stdout.write(
    "The Inngest dev server will work through them (concurrency limit = 2 by default).\n",
  );
  process.stdout.write("When the queue drains, run `pnpm recompute:layout`.\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  });
