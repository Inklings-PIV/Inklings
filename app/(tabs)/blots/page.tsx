import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { HSLOverride } from "@/lib/colour/placeholder";
import { getDb, schema } from "@/lib/db";
import type { ClassicalFeatures } from "@/lib/stylometry/classical";
import { type Blot, BlotsView } from "./blots-view";

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
      ingestedAt: schema.books.ingestedAt,
      createdAt: schema.books.createdAt,
      classical: schema.bookFeatures.classical,
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
    .leftJoin(schema.bookFeatures, eq(schema.bookFeatures.bookId, schema.books.id))
    .leftJoin(
      algoColours,
      and(eq(algoColours.bookId, schema.books.id), eq(algoColours.source, "algorithmic")),
    )
    .leftJoin(llmColours, and(eq(llmColours.bookId, schema.books.id), eq(llmColours.source, "llm")))
    .leftJoin(
      blendedColours,
      and(eq(blendedColours.bookId, schema.books.id), eq(blendedColours.source, "blended")),
    )
    .where(eq(schema.books.status, "ready"));

  return rows.map((r) => ({
    bookId: r.bookId,
    title: r.title,
    authorName: r.authorName,
    ingestedAt: r.ingestedAt ?? r.createdAt,
    classical: (r.classical as ClassicalFeatures | null) ?? null,
    algorithmic: hslFrom(r.algoHue, r.algoSaturation, r.algoLightness, r.algoJustification),
    llm: hslFrom(r.llmHue, r.llmSaturation, r.llmLightness, r.llmJustification),
    blended: hslFrom(r.blendedHue, r.blendedSaturation, r.blendedLightness, r.blendedJustification),
  }));
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

export default async function BlotsPage() {
  const blots = await fetchBlots();
  return <BlotsView blots={blots} />;
}
