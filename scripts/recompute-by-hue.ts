// One-shot by-hue layout recompute that bypasses Inngest. The Inngest
// function in lib/inngest/recompute-layout.ts handles the cron + on-demand
// path in prod; this script is for local backfills and reruns where the
// Inngest dev server may not be running.
//
// Usage:
//   pnpm recompute:by-hue              dev
//   pnpm recompute:by-hue:prod         prod (DRIZZLE_ENV=prod)

import "./_load-env";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../lib/db";
import { hslToHueVector, umapProjection } from "../lib/layout/umap";

const LAYOUT_VERSION = 1;

async function main() {
  const db = getDb();

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
    process.stdout.write("OK  no blended colours yet (run pnpm derive:blended first)\n");
    return;
  }

  const vectors = rows.map((r) => hslToHueVector(r.hue, r.saturation, r.lightness));
  const xy = umapProjection(vectors, { seed: 42 });

  await db
    .insert(schema.bookLayout)
    .values(
      rows.map((r, i) => ({
        bookId: r.bookId,
        mode: "by-hue" as const,
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

  process.stdout.write(`OK  laid out ${rows.length} books by hue\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  });
