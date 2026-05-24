"use server";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { ensureScribe } from "@/lib/auth/scribe";
import { hueFromHSL } from "@/lib/colour/placeholder";
import { getDb, schema } from "@/lib/db";
import { chooseExcerpt } from "@/lib/excerpts/select";

const SWATCH_COUNT = 6;
const DISTRACTOR_COUNT = SWATCH_COUNT - 1;

export type SwatchForClient = { swatchId: string; css: string };

export type SwatchRoundForClient = {
  sessionId: string;
  roundId: string;
  excerpt: string;
  swatches: SwatchForClient[];
};

export type SwatchGuessResult = {
  correct: boolean;
  correctSwatchId: string;
  /** The book the smudge came from, revealed only after the guess. */
  book: { title: string; authorName: string };
  /** New cumulative session score after this round. */
  sessionScore: number;
};

type StoredSwatch = {
  swatchId: string;
  bookId: string;
  hue: number;
  saturation: number;
  lightness: number;
};

type StoredPresented = {
  correctSwatchId: string;
  swatches: StoredSwatch[];
};

/**
 * Start a new Smudge → Swatch round. Picks a random book with an algorithmic
 * colour, gets its representative excerpt, builds 6 swatches (the algo answer
 * + 5 random distractors from other books), persists the round, and returns
 * a redacted view to the client.
 */
export async function startSwatchRound(input: {
  sessionId: string | null;
}): Promise<SwatchRoundForClient> {
  const scribe = await ensureScribe();
  const db = getDb();

  // Reuse the scribe's open swatch session, or open a fresh one.
  let sessionId = input.sessionId;
  if (!sessionId) {
    const [open] = await db
      .select({ id: schema.gameSessions.id })
      .from(schema.gameSessions)
      .where(
        and(
          eq(schema.gameSessions.scribeId, scribe.id),
          eq(schema.gameSessions.mode, "swatch"),
          isNull(schema.gameSessions.endedAt),
        ),
      )
      .orderBy(sql`${schema.gameSessions.startedAt} desc`)
      .limit(1);
    if (open) {
      sessionId = open.id;
    } else {
      const [created] = await db
        .insert(schema.gameSessions)
        .values({ scribeId: scribe.id, mode: "swatch" })
        .returning({ id: schema.gameSessions.id });
      if (!created) throw new Error("Failed to create game session");
      sessionId = created.id;
    }
  }

  // Pick a correct book — random pick from books that have an algorithmic
  // colour row (so we always have something to score against).
  const [correct] = await db
    .select({
      bookId: schema.books.id,
      hue: schema.bookColours.hue,
      saturation: schema.bookColours.saturation,
      lightness: schema.bookColours.lightness,
    })
    .from(schema.bookColours)
    .innerJoin(schema.books, eq(schema.books.id, schema.bookColours.bookId))
    .where(eq(schema.bookColours.source, "algorithmic"))
    .orderBy(sql`random()`)
    .limit(1);
  if (!correct) {
    throw new Error("No books with algorithmic colours yet — run pnpm derive:colours");
  }

  // 5 distractor colours from other books.
  const distractors = await db
    .select({
      bookId: schema.bookColours.bookId,
      hue: schema.bookColours.hue,
      saturation: schema.bookColours.saturation,
      lightness: schema.bookColours.lightness,
    })
    .from(schema.bookColours)
    .where(
      and(
        eq(schema.bookColours.source, "algorithmic"),
        ne(schema.bookColours.bookId, correct.bookId),
      ),
    )
    .orderBy(sql`random()`)
    .limit(DISTRACTOR_COUNT);

  // Build the shuffled swatch list, opaque swatchIds so the client can't peek.
  const stored: StoredSwatch[] = shuffle(
    [correct, ...distractors].map((s) => ({
      swatchId: crypto.randomUUID(),
      bookId: s.bookId,
      hue: s.hue,
      saturation: s.saturation,
      lightness: s.lightness,
    })),
  );
  const correctSwatchId = stored.find((s) => s.bookId === correct.bookId)?.swatchId;
  if (!correctSwatchId) throw new Error("Lost track of the correct swatch");

  // Default strategy is longest-paragraph — instant on cold cache. The
  // `representative` strategy embeds every candidate paragraph (~10–30s
  // cold), too slow for the round-loading UX. We can revisit per #66.
  const excerpt = await chooseExcerpt(correct.bookId);

  const presented: StoredPresented = { correctSwatchId, swatches: stored };
  const [round] = await db
    .insert(schema.gameRounds)
    .values({
      sessionId,
      bookId: correct.bookId,
      mode: "swatch",
      presented,
    })
    .returning({ id: schema.gameRounds.id });
  if (!round) throw new Error("Failed to create game round");

  return {
    sessionId,
    roundId: round.id,
    excerpt,
    swatches: stored.map((s) => ({
      swatchId: s.swatchId,
      css: hueFromHSL(s.hue, s.saturation, s.lightness).css,
    })),
  };
}

/**
 * Score the player's guess. Compares against the round's stored
 * `correctSwatchId`, updates the round + session score, records a
 * `colour_votes` row with the chosen swatch's HSL so #26 (crowd
 * aggregator) can later read from the same data.
 */
export async function submitSwatchGuess(input: {
  roundId: string;
  swatchId: string;
}): Promise<SwatchGuessResult> {
  const scribe = await ensureScribe();
  const db = getDb();

  const [round] = await db
    .select({
      sessionId: schema.gameRounds.sessionId,
      bookId: schema.gameRounds.bookId,
      presented: schema.gameRounds.presented,
      existingGuess: schema.gameRounds.guess,
    })
    .from(schema.gameRounds)
    .where(eq(schema.gameRounds.id, input.roundId))
    .limit(1);
  if (!round) throw new Error("Round not found");
  if (round.existingGuess) throw new Error("Round already guessed");

  const presented = round.presented as StoredPresented;
  const picked = presented.swatches.find((s) => s.swatchId === input.swatchId);
  if (!picked) throw new Error("Swatch not part of this round");

  const correct = picked.swatchId === presented.correctSwatchId;
  const scoreDelta = correct ? 1 : 0;

  await db
    .update(schema.gameRounds)
    .set({
      guess: { swatchId: input.swatchId },
      scored: scoreDelta,
    })
    .where(eq(schema.gameRounds.id, input.roundId));

  // Record the player's belief about this book's hue, regardless of correct.
  // #26 (crowd aggregator) will average across all these.
  await db.insert(schema.colourVotes).values({
    bookId: round.bookId,
    scribeId: scribe.id,
    hue: picked.hue,
    saturation: picked.saturation,
    lightness: picked.lightness,
    source: "game",
  });

  // Bump session score; return the new total.
  const [session] = await db
    .update(schema.gameSessions)
    .set({ score: sql`${schema.gameSessions.score} + ${scoreDelta}` })
    .where(eq(schema.gameSessions.id, round.sessionId))
    .returning({ score: schema.gameSessions.score });

  // Reveal which book it was.
  const [reveal] = await db
    .select({
      title: schema.books.title,
      authorName: schema.authors.name,
    })
    .from(schema.books)
    .innerJoin(schema.authors, eq(schema.authors.id, schema.books.authorId))
    .where(eq(schema.books.id, round.bookId))
    .limit(1);
  if (!reveal) throw new Error("Book metadata missing");

  return {
    correct,
    correctSwatchId: presented.correctSwatchId,
    book: reveal,
    sessionScore: session?.score ?? 0,
  };
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}
