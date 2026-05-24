import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { getDb, schema } from "@/lib/db";
import { type Hand, HandsView } from "./hands-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Hands · Inklings",
  description:
    "Every author in the corpus, ranked by signature hue, alphabet, or blot count. Each hand is the mark a writer leaves across their books.",
};

async function fetchHands(): Promise<Hand[]> {
  const db = getDb();
  // One row per (author, blended-colour). We aggregate book count + signature
  // hue in TS rather than SQL — the corpus is small enough that an O(n) pass
  // is cheaper than the GROUP BY + circular-mean gymnastics in Postgres.
  const rows = await db
    .select({
      authorId: schema.authors.id,
      authorName: schema.authors.name,
      authorSlug: schema.authors.slug,
      birthYear: schema.authors.birthYear,
      deathYear: schema.authors.deathYear,
      bookId: schema.books.id,
      ingestedAt: schema.books.ingestedAt,
      hue: schema.bookColours.hue,
      saturation: schema.bookColours.saturation,
      lightness: schema.bookColours.lightness,
    })
    .from(schema.authors)
    .leftJoin(schema.books, eq(schema.books.authorId, schema.authors.id))
    .leftJoin(
      schema.bookColours,
      and(eq(schema.bookColours.bookId, schema.books.id), eq(schema.bookColours.source, "blended")),
    );

  const byAuthor = new Map<string, RawHand>();
  for (const r of rows) {
    let h = byAuthor.get(r.authorId);
    if (!h) {
      h = {
        authorId: r.authorId,
        authorName: r.authorName,
        authorSlug: r.authorSlug,
        birthYear: r.birthYear,
        deathYear: r.deathYear,
        bookIds: new Set(),
        lastIngestedAt: null,
        blended: [],
      };
      byAuthor.set(r.authorId, h);
    }
    if (r.bookId) h.bookIds.add(r.bookId);
    if (r.ingestedAt && (!h.lastIngestedAt || r.ingestedAt > h.lastIngestedAt)) {
      h.lastIngestedAt = r.ingestedAt;
    }
    if (r.hue != null && r.saturation != null && r.lightness != null) {
      h.blended.push({ hue: r.hue, saturation: r.saturation, lightness: r.lightness });
    }
  }

  return Array.from(byAuthor.values()).map((h) => ({
    authorName: h.authorName,
    authorSlug: h.authorSlug,
    birthYear: h.birthYear,
    deathYear: h.deathYear,
    blotCount: h.bookIds.size,
    lastIngestedAt: h.lastIngestedAt,
    blendedHues: h.blended,
  }));
}

type RawHand = {
  authorId: string;
  authorName: string;
  authorSlug: string;
  birthYear: number | null;
  deathYear: number | null;
  bookIds: Set<string>;
  lastIngestedAt: Date | null;
  blended: { hue: number; saturation: number; lightness: number }[];
};

export default async function HandsPage() {
  const hands = await fetchHands();
  return <HandsView hands={hands} />;
}
