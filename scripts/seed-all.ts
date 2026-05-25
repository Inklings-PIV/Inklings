// Usage:
//   pnpm seed:all                          dev: hand-picked SEED_BOOKS (~36)
//   pnpm seed:all --top=100                dev: top-100 from PG catalog
//   pnpm seed:all --top=1000 --prod        prod: full 1k against prod DB
//
// Convention (#83): dev stays small (≤100 books, snappy UMAP and queries);
// prod gets the real 1k corpus. --prod requires INNGEST_EVENT_KEY +
// DATABASE_URL_PROD in .env; the Inngest + Next servers still need to be
// running locally so the registered functions can drain events.

// IMPORTANT: --prod must take effect BEFORE _load-env or @/lib/* are imported,
// because they read process.env at module-load. Hence dynamic imports below.
const isProd = process.argv.includes("--prod");
if (isProd) {
  // @types/node marks NODE_ENV readonly; Object.assign sidesteps the check.
  Object.assign(process.env, { NODE_ENV: "production", DRIZZLE_ENV: "prod" });
}

const topArg = process.argv.find((a) => a.startsWith("--top="))?.split("=")[1];
const topN = topArg ? Math.max(1, Number.parseInt(topArg, 10)) : 0;

void (async () => {
  await import("./_load-env");

  const { and, count, eq, gt, inArray } = await import("drizzle-orm");
  const { getDb, schema } = await import("../lib/db");
  const { SEED_BOOKS } = await import("../lib/ingestion/seed-list");
  const { fetchTopEnglishBooks } = await import("../lib/ingestion/gutenberg-catalog");
  const { inngest } = await import("../lib/inngest/client");
  const { chooseExcerpt } = await import("../lib/excerpts/select");

  type SeedBook = { gutenbergId: number; title: string; author: string };

  const target = isProd ? "PROD" : "DEV";
  const startTime = Date.now();

  if (isProd && !process.env.INNGEST_EVENT_KEY) {
    fail("--prod requires INNGEST_EVENT_KEY in your .env");
  }
  if (isProd && !process.env.DATABASE_URL_PROD) {
    fail("--prod requires DATABASE_URL_PROD in your .env");
  }

  // Pre-flight: in dev mode, sending events succeeds the moment the
  // Inngest dev server is up — but if the Next app isn't running, no
  // function is registered and events sit in the queue forever. We
  // probe /api/inngest to fail fast with a useful message instead of
  // timing out after an hour with no progress.
  if (!isProd) {
    const inngestApi = "http://localhost:3000/api/inngest";
    try {
      const res = await fetch(inngestApi, { method: "GET" });
      if (!res.ok) {
        fail(
          `Next dev server replied ${res.status} at ${inngestApi}. Start it with \`pnpm dev\` in another terminal — the Inngest dev server discovers registered functions through this route.`,
        );
      }
    } catch {
      fail(
        `Couldn't reach Next dev server at ${inngestApi}. Start it with \`pnpm dev\` in another terminal. (Inngest dev server alone isn't enough — it polls /api/inngest to discover functions.)`,
      );
    }
  }

  // Sourcing: --top=N → PG catalog (curated English literature, sorted by
  // gutenbergId asc); absent the flag we use the hand-picked SEED_BOOKS.
  let candidates: SeedBook[];
  if (topN > 0) {
    log(`[${target}]  pulling top ${topN} curated books from PG catalog...`);
    const top = await fetchTopEnglishBooks(topN);
    candidates = top.map((e) => ({
      gutenbergId: e.gutenbergId,
      title: e.title,
      author: e.authors,
    }));
    log(`  got ${candidates.length} candidates`);
  } else {
    candidates = [...SEED_BOOKS];
  }

  // Skip-already-ingested — without this every rerun re-fires the
  // pipeline for books we've already processed and double-bills.
  const ids = candidates.map((c) => c.gutenbergId);
  const dbForSkip = getDb();
  const existing = await dbForSkip
    .select({ gutenbergId: schema.books.gutenbergId, status: schema.books.status })
    .from(schema.books)
    .where(inArray(schema.books.gutenbergId, ids));
  const skipSet = new Set(existing.filter((r) => r.status !== "failed").map((r) => r.gutenbergId));
  const fresh = candidates.filter((c) => !skipSet.has(c.gutenbergId));

  log(
    `[${target}]  ${candidates.length} candidates · ${skipSet.size} already done · ${fresh.length} to ingest\n`,
  );

  // 1. Send seed events
  if (fresh.length > 0) {
    log("→ enqueuing ingest events...");
    await inngest.send(
      fresh.map((b) => ({
        name: "corpus/book.ingest" as const,
        data: { gutenbergId: b.gutenbergId },
      })),
    );
    log(`  sent ${fresh.length} events\n`);
  } else {
    log("→ no fresh books to enqueue (corpus already covers the candidates)\n");
  }

  // 2. Wait for ingestion. Timeout scales with fresh count — Inngest
  // concurrency is 2 and each book takes ~30 s, so we budget ~45 s/book
  // with a 20-minute floor for tiny runs.
  log("→ waiting for ingestion (polls every 5s)...");
  const db = getDb();
  const ingestTimeoutMs = Math.max(20 * 60 * 1000, fresh.length * 45_000);
  log(`  timeout budget: ${Math.round(ingestTimeoutMs / 60_000)} min`);
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
    timeoutMs: ingestTimeoutMs,
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

  // 9. Pre-warm excerpts for every candidate book that doesn't have one
  //    cached yet. Excerpts feed the game's Smudge, the Quill's seeds, and
  //    excerpt-grounded LLM colour (#66) — they're computed lazily on
  //    first hit otherwise, leading to a 5–10 s stall in the game UI. The
  //    default "longest-paragraph" strategy only refetches the Gutenberg
  //    text (free), no API spend.
  log("\n→ pre-warming excerpts (longest-paragraph strategy)…");
  const booksForExcerpt = await db
    .select({ id: schema.books.id, gutenbergId: schema.books.gutenbergId })
    .from(schema.books)
    .where(inArray(schema.books.gutenbergId, ids));
  const existingExcerpts = await db
    .select({ bookId: schema.bookExcerpts.bookId })
    .from(schema.bookExcerpts)
    .where(
      and(
        eq(schema.bookExcerpts.strategy, "longest-paragraph"),
        inArray(
          schema.bookExcerpts.bookId,
          booksForExcerpt.map((b) => b.id),
        ),
      ),
    );
  const haveExcerpt = new Set(existingExcerpts.map((r) => r.bookId));
  const needExcerpt = booksForExcerpt.filter((b) => !haveExcerpt.has(b.id));
  log(
    `  ${booksForExcerpt.length} books · ${haveExcerpt.size} already cached · ${needExcerpt.length} to warm`,
  );

  if (needExcerpt.length > 0) {
    let done = 0;
    let failed = 0;
    const concurrency = 4;
    let cursor = 0;
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (cursor < needExcerpt.length) {
          const i = cursor++;
          const book = needExcerpt[i];
          if (!book) continue;
          try {
            await chooseExcerpt(book.id);
            done++;
          } catch {
            failed++;
          }
          if ((done + failed) % 25 === 0 || done + failed === needExcerpt.length) {
            log(
              `  ${String(done + failed).padStart(4)}/${needExcerpt.length} warmed  (${failed} failed)`,
            );
          }
        }
      }),
    );
    log(`  excerpts: ${done} cached, ${failed} failed`);
  }

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
  let lastHeartbeat = startedAt;
  // Track time-of-last-progress separately from start-of-wait so the
  // stuck hint reflects "no movement recently", not "elapsed since
  // start". Without this, the hint re-fires on every progress tick
  // after the first 2 min — noise instead of signal.
  let lastProgressAt = startedAt;
  // Heartbeat every 30 s even when the count hasn't moved — turns
  // an opaque hang into a visible "still N/M" line so the operator
  // can decide to stop early.
  const HEARTBEAT_MS = 30_000;
  // Hint at the most common cause of a stuck queue after a couple
  // of quiet minutes — Next dev not running, so no Inngest worker.
  const STUCK_HINT_MS = 2 * 60_000;
  let hintShown = false;
  while (true) {
    const current = await opts.poll();
    const now = Date.now();
    const sec = Math.round((now - startedAt) / 1000);
    if (current !== lastShown) {
      log(`  ${String(current).padStart(4)}/${opts.expected} ${opts.label}  (${sec}s)`);
      lastShown = current;
      lastHeartbeat = now;
      lastProgressAt = now;
      hintShown = false;
    } else if (now - lastHeartbeat > HEARTBEAT_MS) {
      log(`  ${String(current).padStart(4)}/${opts.expected} ${opts.label}  (${sec}s, still)`);
      lastHeartbeat = now;
    }
    if (current >= opts.expected) return;
    if (current < opts.expected && now - lastProgressAt > STUCK_HINT_MS && !hintShown) {
      log(
        `  ⚠ no progress in ${Math.round((now - lastProgressAt) / 1000)}s. Check the Inngest dashboard at http://localhost:8288 — if no runs are appearing, the worker probably stalled.`,
      );
      hintShown = true;
    }
    if (now - startedAt > opts.timeoutMs) {
      throw new Error(
        `timed out at ${current}/${opts.expected} ${opts.label} after ${Math.round(
          opts.timeoutMs / 1000,
        )}s`,
      );
    }
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
}
