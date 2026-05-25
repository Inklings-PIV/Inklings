// Local, Inngest-free seed for the corpus. Runs the entire ingest pipeline
// in this process — no event bus, no deploy, no /api/inngest. Talks to the
// database the env points at; pair with --prod to write to prod.
//
// Why this exists: seed:all (the Inngest-backed orchestrator) requires the
// app to be deployed and synced with Inngest Cloud before its --prod mode
// works. For a one-shot corpus backfill, that's a lot of plumbing for a
// 30-minute job. This script bypasses the bus entirely.
//
// Usage:
//   pnpm seed:direct                       dev: hand-picked SEED_BOOKS
//   pnpm seed:direct --top=100             dev: top-100 curated English lit
//   pnpm seed:direct --top=1000 --prod     prod: full 1k against DATABASE_URL_PROD
//   pnpm seed:direct --top=1000 --concurrency=8  raise parallelism (default 4)
//
// Concurrency is bounded by OpenAI's TPM cap (handled inside embedText) and
// Claude's RPM ceiling. Tier-1 holds up fine at 4; raise carefully.
//
// At ~10k books or larger, switch to the Vercel + Inngest Cloud path. This
// script is for the bootstrap; #84 takes over from there.

export {};

const isProd = process.argv.includes("--prod");
if (isProd) {
  Object.assign(process.env, { NODE_ENV: "production", DRIZZLE_ENV: "prod" });
}

const topArg = process.argv.find((a) => a.startsWith("--top="))?.split("=")[1];
const topN = topArg ? Math.max(1, Number.parseInt(topArg, 10)) : 0;
const concArg = process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1];
const concurrency = concArg ? Math.max(1, Number.parseInt(concArg, 10)) : 4;

void (async () => {
  await import("./_load-env");

  const { and, count, eq, inArray, isNotNull, sql } = await import("drizzle-orm");
  const { getDb, schema } = await import("../lib/db");
  const { SEED_BOOKS } = await import("../lib/ingestion/seed-list");
  const { fetchTopEnglishBooks } = await import("../lib/ingestion/gutenberg-catalog");
  const { fetchBookMeta } = await import("../lib/ingestion/gutenberg-meta");
  const { fetchBookText } = await import("../lib/ingestion/gutenberg-text");
  const { extractClassical } = await import("../lib/stylometry/classical");
  const { embedText } = await import("../lib/stylometry/embed");
  const { deriveAlgorithmic } = await import("../lib/colour/algorithmic");
  const { deriveLLM } = await import("../lib/colour/llm");
  const { blendColours } = await import("../lib/colour/blend");
  const { upsertAuthor, upsertBook, countWords } = await import("../lib/inngest/ingest-book");
  const { chooseExcerpt } = await import("../lib/excerpts/select");
  const { classicalToVector, hslToHueVector, standardize, umapProjection } = await import(
    "../lib/layout/umap"
  );

  type SeedBook = { gutenbergId: number; title: string; author: string };
  const LAYOUT_VERSION = 1;

  const target = isProd ? "PROD" : "DEV";
  const startTime = Date.now();

  if (isProd && !process.env.DATABASE_URL_PROD) {
    fail("--prod requires DATABASE_URL_PROD in your .env");
  }

  // 0. Resolve candidates
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

  // 1. Skip-already-ingested
  const ids = candidates.map((c) => c.gutenbergId);
  const db = getDb();
  const existing = await db
    .select({ gutenbergId: schema.books.gutenbergId, status: schema.books.status })
    .from(schema.books)
    .where(inArray(schema.books.gutenbergId, ids));
  const skipSet = new Set(existing.filter((r) => r.status !== "failed").map((r) => r.gutenbergId));
  const fresh = candidates.filter((c) => !skipSet.has(c.gutenbergId));

  log(
    `[${target}]  ${candidates.length} candidates · ${skipSet.size} already done · ${fresh.length} to ingest`,
  );
  log(`[${target}]  concurrency: ${concurrency}\n`);

  // 2. Ingest each fresh book in parallel (bounded). Each book runs the
  // full pipeline inline — no Inngest, no step boundaries, just async.
  let doneCount = 0;
  let failedCount = 0;
  const failed: { gutenbergId: number; error: string }[] = [];
  const t0 = Date.now();
  let cursor = 0;

  async function ingestOne(book: SeedBook): Promise<void> {
    const meta = await fetchBookMeta(book.gutenbergId);
    if (!meta) throw new Error("metadata fetch returned null");
    const text = await fetchBookText(book.gutenbergId);
    if (!text) throw new Error("text fetch returned null");
    const wordCount = countWords(text);
    const author = meta.authors[0];
    if (!author) throw new Error("no author on metadata");
    const authorId = await upsertAuthor(author);
    const bookId = await upsertBook({
      gutenbergId: book.gutenbergId,
      authorId,
      title: meta.title,
      lang: meta.language ?? "en",
      wordCount,
    });

    const classical = extractClassical(text);
    const embedding = await embedText(text);

    await db
      .insert(schema.bookFeatures)
      .values({ bookId, classical, embedding })
      .onConflictDoUpdate({
        target: schema.bookFeatures.bookId,
        set: { classical, embedding, computedAt: new Date() },
      });

    const algorithmic = deriveAlgorithmic(classical);
    await saveColour(bookId, "algorithmic", algorithmic);

    const llm = await deriveLLM({ title: meta.title, authorName: author.name, classical });
    await saveColour(bookId, "llm", llm);

    const blended = blendColours({ algorithmic, llm });
    if (blended) await saveColour(bookId, "blended", blended);

    await db
      .update(schema.books)
      .set({ status: "ready", ingestedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.books.id, bookId));
  }

  async function saveColour(
    bookId: string,
    source: "algorithmic" | "llm" | "crowd" | "blended",
    c: { hue: number; saturation: number; lightness: number; justification: string },
  ): Promise<void> {
    await db
      .insert(schema.bookColours)
      .values({
        bookId,
        source,
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
  }

  log("→ ingesting books...");
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (cursor < fresh.length) {
        const i = cursor++;
        const book = fresh[i];
        if (!book) continue;
        try {
          await ingestOne(book);
          doneCount++;
        } catch (err) {
          failedCount++;
          failed.push({ gutenbergId: book.gutenbergId, error: (err as Error).message });
        }
        const total = doneCount + failedCount;
        if (total % 10 === 0 || total === fresh.length) {
          const elapsed = Math.round((Date.now() - t0) / 1000);
          const rate = total > 0 ? (elapsed / total).toFixed(1) : "—";
          log(
            `  ${String(total).padStart(4)}/${fresh.length}  (${elapsed}s, ${rate}s/book, ${failedCount} failed)`,
          );
        }
      }
    }),
  );
  log(`  done: ${doneCount} ingested, ${failedCount} failed\n`);

  if (failedCount > 0) {
    log(`  ⚠ ${failedCount} failures`);
    // Group by error message so a systemic problem (schema drift, env var
    // missing, etc.) doesn't drown in 1k near-identical lines. Show the
    // first 5 IDs per error class and a total count.
    const groups = new Map<string, number[]>();
    for (const f of failed) {
      const key = f.error.split("\n")[0]?.slice(0, 200) ?? f.error.slice(0, 200);
      const arr = groups.get(key) ?? [];
      arr.push(f.gutenbergId);
      groups.set(key, arr);
    }
    for (const [errMsg, gids] of groups) {
      log(`    ${gids.length}× — ${errMsg}`);
      log(`        e.g. #${gids.slice(0, 5).join(", #")}${gids.length > 5 ? ", …" : ""}`);
    }
  }

  // 3. Layouts inline. Same logic as recomputeLayout* Inngest functions
  // but as plain awaits. Each is cheap (<5 s at 1k points).
  log("→ recomputing classical layout...");
  await recomputeLayout("classical");
  log("→ recomputing by-hue layout...");
  await recomputeLayout("by-hue");
  log("→ recomputing modern layout...");
  await recomputeLayout("modern");

  async function recomputeLayout(mode: "classical" | "by-hue" | "modern"): Promise<void> {
    let points: { bookId: string; x: number; y: number }[];
    if (mode === "classical") {
      const rows = await db
        .select({ bookId: schema.bookFeatures.bookId, classical: schema.bookFeatures.classical })
        .from(schema.bookFeatures);
      const usable = rows.flatMap((r) =>
        r.classical && typeof r.classical === "object"
          ? // biome-ignore lint/suspicious/noExplicitAny: classical jsonb has a known schema
            [{ bookId: r.bookId, classical: r.classical as any }]
          : [],
      );
      if (usable.length === 0) {
        log(`  ${mode}: 0 books (skipped)`);
        return;
      }
      const raw = usable.map((b) => classicalToVector(b.classical));
      const xy = umapProjection(standardize(raw), { seed: 42 });
      points = usable.map((b, i) => ({ bookId: b.bookId, x: xy[i]?.[0] ?? 0, y: xy[i]?.[1] ?? 0 }));
    } else if (mode === "by-hue") {
      const rows = await db
        .select({
          bookId: schema.bookColours.bookId,
          hue: schema.bookColours.hue,
          saturation: schema.bookColours.saturation,
          lightness: schema.bookColours.lightness,
        })
        .from(schema.bookColours)
        .where(eq(schema.bookColours.source, "blended"));
      if (rows.length === 0) {
        log(`  ${mode}: 0 books (skipped)`);
        return;
      }
      const raw = rows.map((b) => hslToHueVector(b.hue, b.saturation, b.lightness));
      const xy = umapProjection(raw, { seed: 42 });
      points = rows.map((b, i) => ({ bookId: b.bookId, x: xy[i]?.[0] ?? 0, y: xy[i]?.[1] ?? 0 }));
    } else {
      // modern
      const rows = await db
        .select({ bookId: schema.bookFeatures.bookId, embedding: schema.bookFeatures.embedding })
        .from(schema.bookFeatures);
      const usable = rows.flatMap((r) =>
        r.embedding && r.embedding.length > 0 ? [{ bookId: r.bookId, embedding: r.embedding }] : [],
      );
      if (usable.length === 0) {
        log(`  ${mode}: 0 books (skipped)`);
        return;
      }
      const xy = umapProjection(
        usable.map((b) => b.embedding),
        { seed: 42 },
      );
      points = usable.map((b, i) => ({ bookId: b.bookId, x: xy[i]?.[0] ?? 0, y: xy[i]?.[1] ?? 0 }));
    }

    await db
      .insert(schema.bookLayout)
      .values(
        points.map((p) => ({
          bookId: p.bookId,
          mode,
          layoutVersion: LAYOUT_VERSION,
          x: p.x,
          y: p.y,
        })),
      )
      .onConflictDoUpdate({
        target: [schema.bookLayout.bookId, schema.bookLayout.mode, schema.bookLayout.layoutVersion],
        set: { x: sql`excluded.x`, y: sql`excluded.y`, computedAt: new Date() },
      });
    log(`  ${mode}: ${points.length} laid out`);
  }

  // 4. Pre-warm excerpts.
  log("\n→ pre-warming excerpts...");
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
    let exDone = 0;
    let exFailed = 0;
    let exCursor = 0;
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (exCursor < needExcerpt.length) {
          const i = exCursor++;
          const book = needExcerpt[i];
          if (!book) continue;
          try {
            await chooseExcerpt(book.id);
            exDone++;
          } catch {
            exFailed++;
          }
          if ((exDone + exFailed) % 25 === 0 || exDone + exFailed === needExcerpt.length) {
            log(`  ${String(exDone + exFailed).padStart(4)}/${needExcerpt.length} warmed`);
          }
        }
      }),
    );
    log(`  excerpts: ${exDone} cached, ${exFailed} failed`);
  }

  // Light final stats — totals across the corpus, so the operator can sanity-check.
  const totalReady = await db
    .select({ n: count() })
    .from(schema.books)
    .where(eq(schema.books.status, "ready"))
    .then((r) => Number(r[0]?.n ?? 0));
  const totalWithBlended = await db
    .select({ n: count() })
    .from(schema.bookColours)
    .where(eq(schema.bookColours.source, "blended"))
    .then((r) => Number(r[0]?.n ?? 0));
  const totalWithEmbedding = await db
    .select({ n: count() })
    .from(schema.bookFeatures)
    .where(isNotNull(schema.bookFeatures.embedding))
    .then((r) => Number(r[0]?.n ?? 0));

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  log(
    `\n[${target}]  done in ${elapsed}s — corpus: ${totalReady} ready · ${totalWithBlended} blended · ${totalWithEmbedding} embedded`,
  );
  process.exit(failedCount > 0 ? 1 : 0);
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
