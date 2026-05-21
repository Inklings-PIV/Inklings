import { sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { classicalToVector, standardize, umapProjection } from "@/lib/layout/umap";
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
