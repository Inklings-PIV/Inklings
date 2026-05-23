import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { ClassicalFeatures } from "@/lib/stylometry/classical";
import { type Blot, InkwellView } from "./inkwell-view";

export const dynamic = "force-dynamic";

async function fetchBlots(): Promise<Blot[]> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        bookId: schema.books.id,
        title: schema.books.title,
        authorName: schema.authors.name,
        classical: schema.bookFeatures.classical,
        mode: schema.bookLayout.mode,
        x: schema.bookLayout.x,
        y: schema.bookLayout.y,
        algoHue: schema.bookColours.hue,
        algoSaturation: schema.bookColours.saturation,
        algoLightness: schema.bookColours.lightness,
        algoJustification: schema.bookColours.justification,
      })
      .from(schema.books)
      .innerJoin(schema.authors, eq(schema.books.authorId, schema.authors.id))
      .innerJoin(schema.bookLayout, eq(schema.bookLayout.bookId, schema.books.id))
      .leftJoin(schema.bookFeatures, eq(schema.bookFeatures.bookId, schema.books.id))
      .leftJoin(
        schema.bookColours,
        and(
          eq(schema.bookColours.bookId, schema.books.id),
          eq(schema.bookColours.source, "algorithmic"),
        ),
      );

    const map = new Map<string, Blot>();
    for (const row of rows) {
      let blot = map.get(row.bookId);
      if (!blot) {
        blot = {
          bookId: row.bookId,
          title: row.title,
          authorName: row.authorName,
          classical: (row.classical as ClassicalFeatures | null) ?? null,
          algorithmic:
            row.algoHue != null && row.algoSaturation != null && row.algoLightness != null
              ? {
                  hue: row.algoHue,
                  saturation: row.algoSaturation,
                  lightness: row.algoLightness,
                  justification: row.algoJustification,
                }
              : null,
          layouts: { classical: null, modern: null, "by-hue": null },
        };
        map.set(row.bookId, blot);
      }
      blot.layouts[row.mode] = { x: row.x, y: row.y };
    }
    return [...map.values()];
  } catch {
    // DB not configured (e.g., preview build without DATABASE_URL); return empty.
    return [];
  }
}

export default async function InkwellPage({
  searchParams,
}: {
  searchParams: Promise<{ selected?: string }>;
}) {
  const [blots, sp] = await Promise.all([fetchBlots(), searchParams]);
  return <InkwellView blots={blots} initialSelectedId={sp.selected ?? null} />;
}
