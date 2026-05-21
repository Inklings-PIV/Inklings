import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { ClassicalFeatures } from "@/lib/stylometry/classical";
import { type Blot, BlotsView } from "./blots-view";

export const dynamic = "force-dynamic";

async function fetchBlots(): Promise<Blot[]> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        bookId: schema.books.id,
        title: schema.books.title,
        authorName: schema.authors.name,
        ingestedAt: schema.books.ingestedAt,
        createdAt: schema.books.createdAt,
        classical: schema.bookFeatures.classical,
      })
      .from(schema.books)
      .innerJoin(schema.authors, eq(schema.books.authorId, schema.authors.id))
      .leftJoin(schema.bookFeatures, eq(schema.bookFeatures.bookId, schema.books.id))
      .where(eq(schema.books.status, "ready"));

    return rows.map((r) => ({
      bookId: r.bookId,
      title: r.title,
      authorName: r.authorName,
      ingestedAt: r.ingestedAt ?? r.createdAt,
      classical: (r.classical as ClassicalFeatures | null) ?? null,
    }));
  } catch {
    // DB not configured (preview build without DATABASE_URL); render empty.
    return [];
  }
}

export default async function BlotsPage() {
  const blots = await fetchBlots();
  return <BlotsView blots={blots} />;
}
