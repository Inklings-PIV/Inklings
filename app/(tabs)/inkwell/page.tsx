import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { HSLOverride } from "@/lib/colour/placeholder";
import { getDb, schema } from "@/lib/db";
import type { ClassicalFeatures } from "@/lib/stylometry/classical";
import { type Blot, InkwellView } from "./inkwell-view";

export const dynamic = "force-dynamic";

async function fetchBlots(): Promise<Blot[]> {
  const db = getDb();
  const algoColours = alias(schema.bookColours, "algo_colours");
  const llmColours = alias(schema.bookColours, "llm_colours");
  const blendedColours = alias(schema.bookColours, "blended_colours");
  const rows = await db
    .select({
      bookId: schema.books.id,
      title: schema.books.title,
      authorName: schema.authors.name,
      classical: schema.bookFeatures.classical,
      mode: schema.bookLayout.mode,
      x: schema.bookLayout.x,
      y: schema.bookLayout.y,
      algoHue: algoColours.hue,
      algoSaturation: algoColours.saturation,
      algoLightness: algoColours.lightness,
      algoJustification: algoColours.justification,
      llmHue: llmColours.hue,
      llmSaturation: llmColours.saturation,
      llmLightness: llmColours.lightness,
      llmJustification: llmColours.justification,
      blendedHue: blendedColours.hue,
      blendedSaturation: blendedColours.saturation,
      blendedLightness: blendedColours.lightness,
      blendedJustification: blendedColours.justification,
    })
    .from(schema.books)
    .innerJoin(schema.authors, eq(schema.books.authorId, schema.authors.id))
    .innerJoin(schema.bookLayout, eq(schema.bookLayout.bookId, schema.books.id))
    .leftJoin(schema.bookFeatures, eq(schema.bookFeatures.bookId, schema.books.id))
    .leftJoin(
      algoColours,
      and(eq(algoColours.bookId, schema.books.id), eq(algoColours.source, "algorithmic")),
    )
    .leftJoin(llmColours, and(eq(llmColours.bookId, schema.books.id), eq(llmColours.source, "llm")))
    .leftJoin(
      blendedColours,
      and(eq(blendedColours.bookId, schema.books.id), eq(blendedColours.source, "blended")),
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
        algorithmic: hslFrom(
          row.algoHue,
          row.algoSaturation,
          row.algoLightness,
          row.algoJustification,
        ),
        llm: hslFrom(row.llmHue, row.llmSaturation, row.llmLightness, row.llmJustification),
        blended: hslFrom(
          row.blendedHue,
          row.blendedSaturation,
          row.blendedLightness,
          row.blendedJustification,
        ),
        layouts: { classical: null, modern: null, "by-hue": null },
      };
      map.set(row.bookId, blot);
    }
    blot.layouts[row.mode] = { x: row.x, y: row.y };
  }
  return [...map.values()];
}

function hslFrom(
  h: number | null,
  s: number | null,
  l: number | null,
  j: string | null,
): HSLOverride | null {
  return h != null && s != null && l != null
    ? { hue: h, saturation: s, lightness: l, justification: j }
    : null;
}

export default async function InkwellPage({
  searchParams,
}: {
  searchParams: Promise<{ selected?: string }>;
}) {
  const [blots, sp] = await Promise.all([fetchBlots(), searchParams]);
  return <InkwellView blots={blots} initialSelectedId={sp.selected ?? null} />;
}
