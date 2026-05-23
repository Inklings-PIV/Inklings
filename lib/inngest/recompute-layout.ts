import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { classicalToVector, hslToHueVector, standardize, umapProjection } from "@/lib/layout/umap";
import type { ClassicalFeatures } from "@/lib/stylometry/classical";

const LAYOUT_VERSION = 1;

/**
 * Load every book's classical features, project to 2D via UMAP, and upsert
 * one row per book into `book_layout` (`mode = 'classical'`). Seeded RNG
 * means the layout is reproducible for a fixed corpus.
 *
 * Triggered:
 *   - on demand:  `corpus/layout.recompute` event
 *   - nightly:    cron 03:00 UTC
 */
export const recomputeLayoutClassical = inngest.createFunction(
  {
    id: "recompute-layout-classical",
    triggers: [{ event: "corpus/layout.recompute" }, { cron: "0 3 * * *" }],
    concurrency: { limit: 1, key: "layout-classical" },
    retries: 2,
  },
  async ({ step }) => {
    const books = await step.run("load-features", async () => {
      const db = getDb();
      const rows = await db
        .select({
          bookId: schema.bookFeatures.bookId,
          classical: schema.bookFeatures.classical,
        })
        .from(schema.bookFeatures);
      return rows
        .filter(
          (r): r is { bookId: string; classical: ClassicalFeatures } =>
            r.classical !== null && typeof r.classical === "object",
        )
        .map((r) => ({ bookId: r.bookId, classical: r.classical as ClassicalFeatures }));
    });

    if (books.length === 0) {
      return { mode: "classical", count: 0, note: "no books with features" };
    }

    const points = await step.run("project", () => {
      const raw = books.map((b) => classicalToVector(b.classical));
      const standardised = standardize(raw);
      const xy = umapProjection(standardised, { seed: 42 });
      return books.map((b, i) => ({
        bookId: b.bookId,
        x: xy[i]?.[0] ?? 0,
        y: xy[i]?.[1] ?? 0,
      }));
    });

    await step.run("upsert-layouts", async () => {
      const db = getDb();
      await db
        .insert(schema.bookLayout)
        .values(
          points.map((p) => ({
            bookId: p.bookId,
            mode: "classical" as const,
            layoutVersion: LAYOUT_VERSION,
            x: p.x,
            y: p.y,
          })),
        )
        .onConflictDoUpdate({
          target: [
            schema.bookLayout.bookId,
            schema.bookLayout.mode,
            schema.bookLayout.layoutVersion,
          ],
          set: {
            x: sql`excluded.x`,
            y: sql`excluded.y`,
            computedAt: new Date(),
          },
        });
    });

    return { mode: "classical", count: points.length };
  },
);

/**
 * Lay out books by colour similarity, not stylometry. Uses the algorithmic
 * `book_colours` row per book today; switch the source filter to `'blended'`
 * once #27 lands. The cylinder vector handles hue wraparound (358° ≈ 2°).
 *
 * Triggered:
 *   - on demand:  `corpus/layout.recompute-by-hue` event
 *   - nightly:    cron 03:15 UTC (after classical at 03:00)
 */
export const recomputeLayoutByHue = inngest.createFunction(
  {
    id: "recompute-layout-by-hue",
    triggers: [{ event: "corpus/layout.recompute-by-hue" }, { cron: "15 3 * * *" }],
    concurrency: { limit: 1, key: "layout-by-hue" },
    retries: 2,
  },
  async ({ step }) => {
    const books = await step.run("load-colours", async () => {
      const db = getDb();
      return db
        .select({
          bookId: schema.bookColours.bookId,
          hue: schema.bookColours.hue,
          saturation: schema.bookColours.saturation,
          lightness: schema.bookColours.lightness,
        })
        .from(schema.bookColours)
        .where(eq(schema.bookColours.source, "algorithmic"));
    });

    if (books.length === 0) {
      return { mode: "by-hue", count: 0, note: "no algorithmic colours" };
    }

    const points = await step.run("project", () => {
      // No standardize() here — the 3 axes are already on comparable scales
      // ([-1, 1] cylinder coords + [0, 1] lightness), and z-scoring would
      // erase the relative weight of saturation vs lightness.
      const raw = books.map((b) => hslToHueVector(b.hue, b.saturation, b.lightness));
      const xy = umapProjection(raw, { seed: 42 });
      return books.map((b, i) => ({
        bookId: b.bookId,
        x: xy[i]?.[0] ?? 0,
        y: xy[i]?.[1] ?? 0,
      }));
    });

    await step.run("upsert-layouts", async () => {
      const db = getDb();
      await db
        .insert(schema.bookLayout)
        .values(
          points.map((p) => ({
            bookId: p.bookId,
            mode: "by-hue" as const,
            layoutVersion: LAYOUT_VERSION,
            x: p.x,
            y: p.y,
          })),
        )
        .onConflictDoUpdate({
          target: [
            schema.bookLayout.bookId,
            schema.bookLayout.mode,
            schema.bookLayout.layoutVersion,
          ],
          set: {
            x: sql`excluded.x`,
            y: sql`excluded.y`,
            computedAt: new Date(),
          },
        });
    });

    return { mode: "by-hue", count: points.length };
  },
);

/**
 * Lay out books by modern-embedding similarity. OpenAI's embeddings are
 * unit-normalised so Euclidean distance ≈ cosine similarity (||a-b||² =
 * 2 − 2·cos(a,b)), which is what UMAP's default metric provides — no
 * standardise() pass needed (and would actively hurt: it would re-weight
 * the dimensions and break the cosine equivalence).
 *
 * Triggered:
 *   - on demand:  `corpus/layout.recompute-modern` event
 *   - nightly:    cron 03:30 UTC
 */
export const recomputeLayoutModern = inngest.createFunction(
  {
    id: "recompute-layout-modern",
    triggers: [{ event: "corpus/layout.recompute-modern" }, { cron: "30 3 * * *" }],
    concurrency: { limit: 1, key: "layout-modern" },
    retries: 2,
  },
  async ({ step }) => {
    const books = await step.run("load-embeddings", async () => {
      const db = getDb();
      const rows = await db
        .select({
          bookId: schema.bookFeatures.bookId,
          embedding: schema.bookFeatures.embedding,
        })
        .from(schema.bookFeatures);
      return rows.flatMap((r) =>
        r.embedding && r.embedding.length > 0 ? [{ bookId: r.bookId, embedding: r.embedding }] : [],
      );
    });

    if (books.length === 0) {
      return { mode: "modern", count: 0, note: "no books with embeddings" };
    }

    const points = await step.run("project", () => {
      const xy = umapProjection(
        books.map((b) => b.embedding),
        { seed: 42 },
      );
      return books.map((b, i) => ({
        bookId: b.bookId,
        x: xy[i]?.[0] ?? 0,
        y: xy[i]?.[1] ?? 0,
      }));
    });

    await step.run("upsert-layouts", async () => {
      const db = getDb();
      await db
        .insert(schema.bookLayout)
        .values(
          points.map((p) => ({
            bookId: p.bookId,
            mode: "modern" as const,
            layoutVersion: LAYOUT_VERSION,
            x: p.x,
            y: p.y,
          })),
        )
        .onConflictDoUpdate({
          target: [
            schema.bookLayout.bookId,
            schema.bookLayout.mode,
            schema.bookLayout.layoutVersion,
          ],
          set: {
            x: sql`excluded.x`,
            y: sql`excluded.y`,
            computedAt: new Date(),
          },
        });
    });

    return { mode: "modern", count: points.length };
  },
);
