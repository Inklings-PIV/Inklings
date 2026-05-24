"use server";

import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { ensureScribe } from "@/lib/auth/scribe";
import { hueFromHSL } from "@/lib/colour/placeholder";
import { getDb, schema } from "@/lib/db";
import { chooseExcerpt } from "@/lib/excerpts/select";

const SWATCH_COUNT = 6;
const DISTRACTOR_COUNT = SWATCH_COUNT - 1;

// ---------------------------------------------------------------------------
// Cross-mode scoring (#35) — every round scores 0–100 so a Wheel player and
// a Swatch player share the same scale. Streaks count any round scoring at
// least STREAK_WIN_THRESHOLD as a "win".
// ---------------------------------------------------------------------------

const ROUND_MAX = 100;
const STREAK_WIN_THRESHOLD = 70;

/** Reads the most recent rounds for a session and returns the current run of "wins". */
async function computeStreak(sessionId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ scored: schema.gameRounds.scored })
    .from(schema.gameRounds)
    .where(eq(schema.gameRounds.sessionId, sessionId))
    .orderBy(desc(schema.gameRounds.createdAt));
  let streak = 0;
  for (const row of rows) {
    if (row.scored != null && row.scored >= STREAK_WIN_THRESHOLD) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

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
  /** This round's score, 0–100 (Swatch is binary: 100 / 0). */
  scored: number;
  /** New cumulative session score after this round. */
  sessionScore: number;
  /** Current consecutive run of wins (rounds scoring ≥ 70). */
  streak: number;
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
  const scoreDelta = correct ? ROUND_MAX : 0;

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

  const streak = await computeStreak(round.sessionId);

  return {
    correct,
    correctSwatchId: presented.correctSwatchId,
    book: reveal,
    scored: scoreDelta,
    sessionScore: session?.score ?? 0,
    streak,
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

// ---------------------------------------------------------------------------
// Smudge → Wheel (#33) — continuous HSL pick instead of constrained swatches.
// ---------------------------------------------------------------------------

export type WheelRoundForClient = {
  sessionId: string;
  roundId: string;
  excerpt: string;
};

export type WheelGuessResult = {
  /** This round's score, 0–100 (distance-weighted: hue 70%, sat 30%). */
  scored: number;
  /** What the algorithmic deriver thinks for this book — the "target". */
  correct: { hue: number; saturation: number; lightness: number };
  book: { title: string; authorName: string };
  sessionScore: number;
  streak: number;
};

type WheelPresented = {
  correctHue: number;
  correctSaturation: number;
  correctLightness: number;
};

/** Same shape as startSwatchRound but no swatches — the wheel is the picker. */
export async function startWheelRound(input: {
  sessionId: string | null;
}): Promise<WheelRoundForClient> {
  const scribe = await ensureScribe();
  const db = getDb();

  let sessionId = input.sessionId;
  if (!sessionId) {
    const [open] = await db
      .select({ id: schema.gameSessions.id })
      .from(schema.gameSessions)
      .where(
        and(
          eq(schema.gameSessions.scribeId, scribe.id),
          eq(schema.gameSessions.mode, "wheel"),
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
        .values({ scribeId: scribe.id, mode: "wheel" })
        .returning({ id: schema.gameSessions.id });
      if (!created) throw new Error("Failed to create game session");
      sessionId = created.id;
    }
  }

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

  const excerpt = await chooseExcerpt(correct.bookId);

  const presented: WheelPresented = {
    correctHue: correct.hue,
    correctSaturation: correct.saturation,
    correctLightness: correct.lightness,
  };
  const [round] = await db
    .insert(schema.gameRounds)
    .values({
      sessionId,
      bookId: correct.bookId,
      mode: "wheel",
      presented,
    })
    .returning({ id: schema.gameRounds.id });
  if (!round) throw new Error("Failed to create game round");

  return { sessionId, roundId: round.id, excerpt };
}

/**
 * Score the wheel guess by distance to the book's algorithmic colour.
 * 0–10 with hue weighted 70%, saturation 30%, lightness ignored (the wheel
 * doesn't expose it). The chosen HSL is also written to colour_votes so
 * #26 (crowd aggregator) reads from the same pool as #32.
 */
export async function submitWheelGuess(input: {
  roundId: string;
  hue: number;
  saturation: number;
  lightness: number;
}): Promise<WheelGuessResult> {
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

  const presented = round.presented as WheelPresented;

  const hueDist = circularHueDistance(input.hue, presented.correctHue);
  const satDist = Math.abs(input.saturation - presented.correctSaturation);
  const normalised = Math.max(0, 1 - (hueDist / 180) * 0.7 - (satDist / 100) * 0.3);
  const scored = Math.round(normalised * ROUND_MAX);

  await db
    .update(schema.gameRounds)
    .set({
      guess: { hue: input.hue, saturation: input.saturation, lightness: input.lightness },
      scored,
    })
    .where(eq(schema.gameRounds.id, input.roundId));

  await db.insert(schema.colourVotes).values({
    bookId: round.bookId,
    scribeId: scribe.id,
    hue: input.hue,
    saturation: input.saturation,
    lightness: input.lightness,
    source: "game",
  });

  const [session] = await db
    .update(schema.gameSessions)
    .set({ score: sql`${schema.gameSessions.score} + ${scored}` })
    .where(eq(schema.gameSessions.id, round.sessionId))
    .returning({ score: schema.gameSessions.score });

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

  const streak = await computeStreak(round.sessionId);

  return {
    scored,
    correct: {
      hue: presented.correctHue,
      saturation: presented.correctSaturation,
      lightness: presented.correctLightness,
    },
    book: reveal,
    sessionScore: session?.score ?? 0,
    streak,
  };
}

function circularHueDistance(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return Math.min(raw, 360 - raw);
}

// ---------------------------------------------------------------------------
// Twin Smudges (#34) — pair comparison, "same hue?" vs "different hue?".
// ---------------------------------------------------------------------------

/**
 * Two books count as "same hue" when their algorithmic colours' circular
 * hue distance is within this threshold. 30° is a reasonable line in the
 * sand for a Twin round; #72 can refine.
 */
const TWIN_SAME_HUE_THRESHOLD = 30;

export type TwinJudgement = "same" | "different";

export type TwinRoundForClient = {
  sessionId: string;
  roundId: string;
  excerptA: string;
  excerptB: string;
};

export type TwinGuessResult = {
  correct: boolean;
  truth: TwinJudgement;
  hueDistance: number;
  bookA: { title: string; authorName: string; hue: number; saturation: number; lightness: number };
  bookB: { title: string; authorName: string; hue: number; saturation: number; lightness: number };
  scored: number;
  sessionScore: number;
  streak: number;
};

type TwinPresented = {
  bookAId: string;
  bookBId: string;
  truth: TwinJudgement;
  hueDistance: number;
};

export async function startTwinRound(input: {
  sessionId: string | null;
}): Promise<TwinRoundForClient> {
  const scribe = await ensureScribe();
  const db = getDb();

  let sessionId = input.sessionId;
  if (!sessionId) {
    const [open] = await db
      .select({ id: schema.gameSessions.id })
      .from(schema.gameSessions)
      .where(
        and(
          eq(schema.gameSessions.scribeId, scribe.id),
          eq(schema.gameSessions.mode, "twin"),
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
        .values({ scribeId: scribe.id, mode: "twin" })
        .returning({ id: schema.gameSessions.id });
      if (!created) throw new Error("Failed to create game session");
      sessionId = created.id;
    }
  }

  // Two distinct random books with algorithmic colours. ORDER BY random()
  // LIMIT 2 is fine for a 35-book corpus; cardinality grows linearly.
  const candidates = await db
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
    .limit(2);
  if (candidates.length < 2) {
    throw new Error("Need at least 2 books with algorithmic colours — run pnpm derive:colours");
  }
  const [bookA, bookB] = candidates as [(typeof candidates)[number], (typeof candidates)[number]];

  const hueDistance = circularHueDistance(bookA.hue, bookB.hue);
  const truth: TwinJudgement = hueDistance <= TWIN_SAME_HUE_THRESHOLD ? "same" : "different";

  const [excerptA, excerptB] = await Promise.all([
    chooseExcerpt(bookA.bookId),
    chooseExcerpt(bookB.bookId),
  ]);

  const presented: TwinPresented = {
    bookAId: bookA.bookId,
    bookBId: bookB.bookId,
    truth,
    hueDistance,
  };

  // game_rounds.bookId is NOT NULL, so we anchor to bookA; bookB lives in
  // `presented`. #72 may evolve into a separate twin_rounds shape.
  const [round] = await db
    .insert(schema.gameRounds)
    .values({
      sessionId,
      bookId: bookA.bookId,
      mode: "twin",
      presented,
    })
    .returning({ id: schema.gameRounds.id });
  if (!round) throw new Error("Failed to create game round");

  return { sessionId, roundId: round.id, excerptA, excerptB };
}

/**
 * Twin rounds produce a similarity signal, not an HSL pick — so we
 * intentionally don't write to colour_votes (which feeds the crowd
 * aggregator with per-book HSL guesses). #72 discusses how Twin data
 * could later inform crowd confidence.
 */
export async function submitTwinGuess(input: {
  roundId: string;
  guess: TwinJudgement;
}): Promise<TwinGuessResult> {
  const db = getDb();

  const [round] = await db
    .select({
      sessionId: schema.gameRounds.sessionId,
      presented: schema.gameRounds.presented,
      existingGuess: schema.gameRounds.guess,
    })
    .from(schema.gameRounds)
    .where(eq(schema.gameRounds.id, input.roundId))
    .limit(1);
  if (!round) throw new Error("Round not found");
  if (round.existingGuess) throw new Error("Round already guessed");

  const presented = round.presented as TwinPresented;
  const correct = input.guess === presented.truth;
  const scored = correct ? ROUND_MAX : 0;

  await db
    .update(schema.gameRounds)
    .set({ guess: { choice: input.guess }, scored })
    .where(eq(schema.gameRounds.id, input.roundId));

  const [session] = await db
    .update(schema.gameSessions)
    .set({ score: sql`${schema.gameSessions.score} + ${scored}` })
    .where(eq(schema.gameSessions.id, round.sessionId))
    .returning({ score: schema.gameSessions.score });

  // Pull metadata + HSL for both books to render the reveal.
  const pairRows = await db
    .select({
      bookId: schema.books.id,
      title: schema.books.title,
      authorName: schema.authors.name,
      hue: schema.bookColours.hue,
      saturation: schema.bookColours.saturation,
      lightness: schema.bookColours.lightness,
    })
    .from(schema.bookColours)
    .innerJoin(schema.books, eq(schema.books.id, schema.bookColours.bookId))
    .innerJoin(schema.authors, eq(schema.authors.id, schema.books.authorId))
    .where(
      and(
        eq(schema.bookColours.source, "algorithmic"),
        inArray(schema.books.id, [presented.bookAId, presented.bookBId]),
      ),
    );
  const byId = new Map(pairRows.map((r) => [r.bookId, r]));
  const a = byId.get(presented.bookAId);
  const b = byId.get(presented.bookBId);
  if (!a || !b) throw new Error("Lost track of one of the twin books");

  const streak = await computeStreak(round.sessionId);

  return {
    correct,
    truth: presented.truth,
    hueDistance: presented.hueDistance,
    bookA: {
      title: a.title,
      authorName: a.authorName,
      hue: a.hue,
      saturation: a.saturation,
      lightness: a.lightness,
    },
    bookB: {
      title: b.title,
      authorName: b.authorName,
      hue: b.hue,
      saturation: b.saturation,
      lightness: b.lightness,
    },
    scored,
    sessionScore: session?.score ?? 0,
    streak,
  };
}

// ---------------------------------------------------------------------------
// Leaderboard — top scribes by lifetime score across every mode/session.
// ---------------------------------------------------------------------------

export type LeaderboardRow = {
  scribeId: string;
  totalScore: number;
  /** True for the row matching the current scribe — for the "(you)" highlight. */
  isMe: boolean;
};

const LEADERBOARD_LIMIT = 8;

/**
 * Sums every session's score per scribe, returns the top N. The current
 * scribe is always included even if outside the top — appended at the end
 * with their actual rank.
 */
export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const me = await ensureScribe();
  const db = getDb();

  const totals = await db
    .select({
      scribeId: schema.gameSessions.scribeId,
      totalScore: sql<number>`SUM(${schema.gameSessions.score})`.as("totalScore"),
    })
    .from(schema.gameSessions)
    .groupBy(schema.gameSessions.scribeId)
    .orderBy(sql`SUM(${schema.gameSessions.score}) DESC`)
    .limit(LEADERBOARD_LIMIT);

  const rows: LeaderboardRow[] = totals.map((r) => ({
    scribeId: r.scribeId,
    totalScore: Number(r.totalScore),
    isMe: r.scribeId === me.id,
  }));

  // If the current scribe isn't in the top N, append them so they always
  // see where they stand.
  if (!rows.some((r) => r.isMe)) {
    const [mine] = await db
      .select({
        totalScore: sql<number>`COALESCE(SUM(${schema.gameSessions.score}), 0)`.as("totalScore"),
      })
      .from(schema.gameSessions)
      .where(eq(schema.gameSessions.scribeId, me.id));
    rows.push({ scribeId: me.id, totalScore: Number(mine?.totalScore ?? 0), isMe: true });
  }

  return rows;
}
