"use server";

import { isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { embedText } from "@/lib/stylometry/embed";

export type VibeMatch = { bookId: string; distance: number };

/**
 * "Vibe" search: embed the user's query, then rank books by cosine distance
 * over `book_features.embedding`. Uses pgvector's `<=>` operator (cosine
 * distance, range [0, 2]; lower = more similar). The HNSW index on the column
 * makes this fast even as the corpus grows.
 */
export async function searchByVibe(query: string, limit = 40): Promise<VibeMatch[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const queryEmbedding = await embedText(trimmed);
  // pgvector accepts `[v1,v2,...]::vector` as a literal-cast.
  const literal = `[${queryEmbedding.join(",")}]`;

  const db = getDb();
  const rows = await db
    .select({
      bookId: schema.bookFeatures.bookId,
      distance: sql<number>`${schema.bookFeatures.embedding} <=> ${literal}::vector`,
    })
    .from(schema.bookFeatures)
    .where(isNotNull(schema.bookFeatures.embedding))
    .orderBy(sql`${schema.bookFeatures.embedding} <=> ${literal}::vector`)
    .limit(limit);

  return rows.map((r) => ({ bookId: r.bookId, distance: Number(r.distance) }));
}
