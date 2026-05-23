// Usage:
//   pnpm seed:all              dev: needs Next + Inngest dev servers running
//   pnpm seed:all --prod       prod: needs INNGEST_EVENT_KEY + DATABASE_URL_PROD in .env

// IMPORTANT: --prod must take effect BEFORE _load-env or @/lib/* are imported,
// because they read process.env at module-load. Hence dynamic imports below.
const isProd = process.argv.includes("--prod");
if (isProd) {
  // @types/node marks NODE_ENV readonly; Object.assign sidesteps the check.
  Object.assign(process.env, { NODE_ENV: "production", DRIZZLE_ENV: "prod" });
}

void (async () => {
  await import("./_load-env");

  const { and, count, eq, gt, inArray } = await import("drizzle-orm");
  const { getDb, schema } = await import("../lib/db");
  const { SEED_BOOKS } = await import("../lib/ingestion/seed-list");
  const { inngest } = await import("../lib/inngest/client");

  const target = isProd ? "PROD" : "DEV";
  const startTime = Date.now();

  if (isProd && !process.env.INNGEST_EVENT_KEY) {
    fail("--prod requires INNGEST_EVENT_KEY in your .env");
  }
  if (isProd && !process.env.DATABASE_URL_PROD) {
    fail("--prod requires DATABASE_URL_PROD in your .env");
  }

  const ids = SEED_BOOKS.map((b) => b.gutenbergId);
  log(`[${target}]  seeding ${ids.length} books end-to-end\n`);

  // 1. Send seed events
  log("→ enqueuing ingest events...");
  await inngest.send(
    SEED_BOOKS.map((b) => ({
      name: "corpus/book.ingest" as const,
      data: { gutenbergId: b.gutenbergId },
    })),
  );
  log(`  sent ${ids.length} events\n`);

  // 2. Wait for ingestion
  log("→ waiting for ingestion (polls every 5s)...");
  const db = getDb();
  await waitForCount({
    label: "ready",
    expected: ids.length,
    poll: () =>
      db
        .select({ n: count() })
        .from(schema.books)
        .where(and(eq(schema.books.status, "ready"), inArray(schema.books.gutenbergId, ids)))
        .then((r) => Number(r[0]?.n ?? 0)),
    intervalMs: 5_000,
    timeoutMs: 20 * 60 * 1000,
  });

  // 3. Trigger classical layout
  log("\n→ triggering classical UMAP recompute...");
  const classicalStartedAt = new Date();
  await inngest.send({ name: "corpus/layout.recompute", data: { mode: "classical" } });
  log("  event sent");

  // 4. Wait for classical UMAP to write fresh layout rows
  log("\n→ waiting for classical layout...");
  await waitForCount({
    label: "classical",
    expected: ids.length,
    poll: () =>
      db
        .select({ n: count() })
        .from(schema.bookLayout)
        .innerJoin(schema.books, eq(schema.books.id, schema.bookLayout.bookId))
        .where(
          and(
            eq(schema.bookLayout.mode, "classical"),
            gt(schema.bookLayout.computedAt, classicalStartedAt),
            inArray(schema.books.gutenbergId, ids),
          ),
        )
        .then((r) => Number(r[0]?.n ?? 0)),
    intervalMs: 2_500,
    timeoutMs: 5 * 60 * 1000,
  });

  // 5. Trigger by-hue layout (needs algorithmic colours, written during ingest)
  log("\n→ triggering by-hue UMAP recompute...");
  const byHueStartedAt = new Date();
  await inngest.send({ name: "corpus/layout.recompute-by-hue", data: {} });
  log("  event sent");

  // 6. Wait for by-hue UMAP
  log("\n→ waiting for by-hue layout...");
  await waitForCount({
    label: "by-hue",
    expected: ids.length,
    poll: () =>
      db
        .select({ n: count() })
        .from(schema.bookLayout)
        .innerJoin(schema.books, eq(schema.books.id, schema.bookLayout.bookId))
        .where(
          and(
            eq(schema.bookLayout.mode, "by-hue"),
            gt(schema.bookLayout.computedAt, byHueStartedAt),
            inArray(schema.books.gutenbergId, ids),
          ),
        )
        .then((r) => Number(r[0]?.n ?? 0)),
    intervalMs: 2_500,
    timeoutMs: 5 * 60 * 1000,
  });

  // 7. Trigger modern (embedding) layout — needs the embeddings written
  //    during ingest. Fires last because the embeddings are the slowest input.
  log("\n→ triggering modern UMAP recompute...");
  const modernStartedAt = new Date();
  await inngest.send({ name: "corpus/layout.recompute-modern", data: {} });
  log("  event sent");

  // 8. Wait for modern UMAP
  log("\n→ waiting for modern layout...");
  await waitForCount({
    label: "modern",
    expected: ids.length,
    poll: () =>
      db
        .select({ n: count() })
        .from(schema.bookLayout)
        .innerJoin(schema.books, eq(schema.books.id, schema.bookLayout.bookId))
        .where(
          and(
            eq(schema.bookLayout.mode, "modern"),
            gt(schema.bookLayout.computedAt, modernStartedAt),
            inArray(schema.books.gutenbergId, ids),
          ),
        )
        .then((r) => Number(r[0]?.n ?? 0)),
    intervalMs: 2_500,
    timeoutMs: 5 * 60 * 1000,
  });

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  log(`\n[${target}]  done in ${elapsed}s — open /inkwell`);
  process.exit(0);
})().catch((err) => {
  process.stderr.write(`ERR  ${(err as Error).message}\n`);
  process.exit(1);
});

function log(line: string): void {
  process.stdout.write(`${line}\n`);
}

function fail(message: string): never {
  process.stderr.write(`ERR  ${message}\n`);
  process.exit(1);
}

async function waitForCount(opts: {
  label: string;
  expected: number;
  poll: () => Promise<number>;
  intervalMs: number;
  timeoutMs: number;
}): Promise<void> {
  const startedAt = Date.now();
  let lastShown = -1;
  while (true) {
    const current = await opts.poll();
    if (current !== lastShown) {
      const sec = Math.round((Date.now() - startedAt) / 1000);
      log(`  ${String(current).padStart(2)}/${opts.expected} ${opts.label}  (${sec}s)`);
      lastShown = current;
    }
    if (current >= opts.expected) return;
    if (Date.now() - startedAt > opts.timeoutMs) {
      throw new Error(
        `timed out at ${current}/${opts.expected} ${opts.label} after ${Math.round(
          opts.timeoutMs / 1000,
        )}s`,
      );
    }
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
}
