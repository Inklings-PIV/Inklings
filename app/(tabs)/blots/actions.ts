"use server";

import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { ensureScribe } from "@/lib/auth/scribe";
import { getDb, schema } from "@/lib/db";
import { fetchBookMeta } from "@/lib/ingestion/gutenberg-meta";
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

// ---------------------------------------------------------------------------
// Gutenberg ID submissions (#11)
// ---------------------------------------------------------------------------

export type SubmitResult =
  | {
      ok: true;
      contributionId: string;
      title: string;
      authorName: string | null;
    }
  | { ok: false; reason: string };

export type MySubmission = {
  contributionId: string;
  gutenbergId: number;
  title: string | null;
  authorName: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
};

type SubmissionPayload = {
  gutenbergId: number;
  title: string;
  authorName: string | null;
  language: string | null;
};

/**
 * Validate a Gutenberg ID and queue it for moderation. Two cheap auto-rejects
 * happen before the row is written — duplicate-already-ingested and
 * non-English — matching the moderation policy locked in #45.
 *
 * The actual ingestion pipeline doesn't fire here; an admin approves the
 * contribution in #12 and that triggers the Inngest job. Splitting it this
 * way keeps unmoderated submissions from burning embedding / Claude credits.
 */
export async function submitGutenbergId(input: { gutenbergId: number }): Promise<SubmitResult> {
  const id = Math.floor(Number(input.gutenbergId));
  if (!Number.isFinite(id) || id <= 0 || id > 999_999) {
    return { ok: false, reason: "Gutenberg IDs are positive integers under a million." };
  }

  const scribe = await ensureScribe();
  const db = getDb();

  // Already in the corpus? Tell the user where to find it instead of queueing.
  const [existingBook] = await db
    .select({ id: schema.books.id, title: schema.books.title })
    .from(schema.books)
    .where(eq(schema.books.gutenbergId, id))
    .limit(1);
  if (existingBook) {
    return {
      ok: false,
      reason: `Already in the corpus: "${existingBook.title}". See /blots/${existingBook.id}.`,
    };
  }

  // Same ID already pending or approved (regardless of submitter) → no point
  // queueing again. Rejected submissions can be re-tried.
  const existingContribs = await db
    .select({
      status: schema.contributions.status,
      payload: schema.contributions.payload,
    })
    .from(schema.contributions)
    .where(eq(schema.contributions.kind, "gutenberg_submission"));
  for (const c of existingContribs) {
    const p = c.payload as SubmissionPayload | null;
    if (p?.gutenbergId === id && c.status !== "rejected") {
      return {
        ok: false,
        reason:
          c.status === "approved"
            ? "Already approved — should be in the corpus shortly."
            : "Already in the moderation queue.",
      };
    }
  }

  const meta = await fetchBookMeta(id);
  if (!meta) {
    return {
      ok: false,
      reason: "Couldn't fetch that ID from Project Gutenberg. Double-check the number.",
    };
  }

  // Auto-reject non-English for now; the corpus + stylometry / colour
  // pipeline is English-only and ingestion would waste credits otherwise.
  if (meta.language && meta.language.toLowerCase() !== "en") {
    return {
      ok: false,
      reason: `That book's language is "${meta.language}". The corpus is English-only for now.`,
    };
  }

  const authorName = meta.authors[0]?.name ?? null;
  const payload: SubmissionPayload = {
    gutenbergId: id,
    title: meta.title,
    authorName,
    language: meta.language,
  };

  const [row] = await db
    .insert(schema.contributions)
    .values({
      scribeId: scribe.id,
      kind: "gutenberg_submission",
      payload,
      status: "pending",
    })
    .returning({ id: schema.contributions.id });
  if (!row) {
    return { ok: false, reason: "Couldn't write the submission — try again in a moment." };
  }

  return {
    ok: true,
    contributionId: row.id,
    title: meta.title,
    authorName,
  };
}

/**
 * The current scribe's recent Gutenberg submissions — shown inside the
 * submission dialog so the user can see what's pending without leaving
 * the page.
 */
export async function listMySubmissions(limit = 8): Promise<MySubmission[]> {
  const scribe = await ensureScribe();
  const db = getDb();
  const rows = await db
    .select({
      contributionId: schema.contributions.id,
      payload: schema.contributions.payload,
      status: schema.contributions.status,
      createdAt: schema.contributions.createdAt,
    })
    .from(schema.contributions)
    .where(
      and(
        eq(schema.contributions.scribeId, scribe.id),
        eq(schema.contributions.kind, "gutenberg_submission"),
      ),
    )
    .orderBy(desc(schema.contributions.createdAt))
    .limit(limit);

  return rows.map((r) => {
    const p = r.payload as SubmissionPayload | null;
    return {
      contributionId: r.contributionId,
      gutenbergId: p?.gutenbergId ?? 0,
      title: p?.title ?? null,
      authorName: p?.authorName ?? null,
      status: r.status,
      createdAt: r.createdAt,
    };
  });
}
