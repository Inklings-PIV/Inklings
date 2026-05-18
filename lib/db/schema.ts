import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const bookStatusEnum = pgEnum("book_status", ["pending", "ingesting", "ready", "failed"]);

export const layoutModeEnum = pgEnum("layout_mode", ["classical", "modern", "by-hue"]);

export const colourSourceEnum = pgEnum("colour_source", ["algorithmic", "llm", "crowd", "blended"]);

export const voteSourceEnum = pgEnum("vote_source", ["game", "manual"]);

export const gameModeEnum = pgEnum("game_mode", ["swatch", "wheel", "twin"]);

export const contributionStatusEnum = pgEnum("contribution_status", [
  "pending",
  "approved",
  "rejected",
]);

export const scribeRoleEnum = pgEnum("scribe_role", ["scribe", "moderator"]);

// ---------------------------------------------------------------------------
// Identity: scribes (anonymous-first, optional email upgrade)
// ---------------------------------------------------------------------------

export const scribes = pgTable(
  "scribes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull().unique(),
    email: text("email"),
    role: scribeRoleEnum("role").notNull().default("scribe"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [uniqueIndex("scribes_email_idx").on(table.email)],
);

// ---------------------------------------------------------------------------
// Corpus: authors + books
// ---------------------------------------------------------------------------

export const authors = pgTable(
  "authors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    gutenbergId: integer("gutenberg_id"),
    birthYear: smallint("birth_year"),
    deathYear: smallint("death_year"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [uniqueIndex("authors_gutenberg_id_idx").on(table.gutenbergId)],
);

export const books = pgTable(
  "books",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => authors.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    gutenbergId: integer("gutenberg_id"),
    lang: text("lang").notNull().default("en"),
    wordCount: integer("word_count"),
    status: bookStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }),
  },
  (table) => [
    index("books_author_id_idx").on(table.authorId),
    uniqueIndex("books_gutenberg_id_idx").on(table.gutenbergId),
    uniqueIndex("books_author_slug_idx").on(table.authorId, table.slug),
    index("books_status_idx").on(table.status),
  ],
);

// ---------------------------------------------------------------------------
// Pipeline: features (classical + embedding) and layout (classical/modern/by-hue)
// ---------------------------------------------------------------------------

export const bookFeatures = pgTable(
  "book_features",
  {
    bookId: uuid("book_id")
      .primaryKey()
      .references(() => books.id, { onDelete: "cascade" }),
    classical: jsonb("classical"),
    embedding: vector("embedding", { dimensions: 1536 }),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index("book_features_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const bookLayout = pgTable(
  "book_layout",
  {
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    mode: layoutModeEnum("mode").notNull(),
    layoutVersion: integer("layout_version").notNull(),
    x: real("x").notNull(),
    y: real("y").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    primaryKey({ columns: [table.bookId, table.mode, table.layoutVersion] }),
    index("book_layout_mode_version_idx").on(table.mode, table.layoutVersion),
  ],
);

// ---------------------------------------------------------------------------
// Colour pipeline: per-source hues + crowd votes
// ---------------------------------------------------------------------------

export const bookColours = pgTable(
  "book_colours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    source: colourSourceEnum("source").notNull(),
    hue: smallint("hue").notNull(),
    saturation: smallint("saturation").notNull(),
    lightness: smallint("lightness").notNull(),
    justification: text("justification"),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [uniqueIndex("book_colours_book_source_idx").on(table.bookId, table.source)],
);

export const colourVotes = pgTable(
  "colour_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    scribeId: uuid("scribe_id")
      .notNull()
      .references(() => scribes.id, { onDelete: "cascade" }),
    hue: smallint("hue").notNull(),
    saturation: smallint("saturation").notNull(),
    lightness: smallint("lightness").notNull(),
    source: voteSourceEnum("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index("colour_votes_book_id_idx").on(table.bookId),
    index("colour_votes_scribe_id_idx").on(table.scribeId),
  ],
);

// ---------------------------------------------------------------------------
// Game: sessions and rounds
// ---------------------------------------------------------------------------

export const gameSessions = pgTable(
  "game_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scribeId: uuid("scribe_id")
      .notNull()
      .references(() => scribes.id, { onDelete: "cascade" }),
    mode: gameModeEnum("mode").notNull(),
    score: integer("score").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().default(sql`now()`),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [index("game_sessions_scribe_id_idx").on(table.scribeId)],
);

export const gameRounds = pgTable(
  "game_rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => gameSessions.id, { onDelete: "cascade" }),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    mode: gameModeEnum("mode").notNull(),
    presented: jsonb("presented").notNull(),
    guess: jsonb("guess"),
    scored: integer("scored"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index("game_rounds_session_id_idx").on(table.sessionId),
    index("game_rounds_book_id_idx").on(table.bookId),
  ],
);

// ---------------------------------------------------------------------------
// Quill: writing samples and readouts
// ---------------------------------------------------------------------------

export const quillSamples = pgTable(
  "quill_samples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scribeId: uuid("scribe_id")
      .notNull()
      .references(() => scribes.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    computedColour: jsonb("computed_colour"),
    targetColour: jsonb("target_colour"),
    suggestions: jsonb("suggestions"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [index("quill_samples_scribe_id_idx").on(table.scribeId)],
);

// ---------------------------------------------------------------------------
// Contributions: user submissions awaiting moderation
// ---------------------------------------------------------------------------

export const contributions = pgTable(
  "contributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scribeId: uuid("scribe_id")
      .notNull()
      .references(() => scribes.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    status: contributionStatusEnum("status").notNull().default("pending"),
    moderatedBy: uuid("moderated_by").references(() => scribes.id, {
      onDelete: "set null",
    }),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    index("contributions_scribe_id_idx").on(table.scribeId),
    index("contributions_status_idx").on(table.status),
  ],
);

// ---------------------------------------------------------------------------
// Relations (enables Drizzle's findMany/findFirst with `with`)
// ---------------------------------------------------------------------------

export const authorsRelations = relations(authors, ({ many }) => ({
  books: many(books),
}));

export const booksRelations = relations(books, ({ one, many }) => ({
  author: one(authors, {
    fields: [books.authorId],
    references: [authors.id],
  }),
  features: one(bookFeatures, {
    fields: [books.id],
    references: [bookFeatures.bookId],
  }),
  layouts: many(bookLayout),
  colours: many(bookColours),
  colourVotes: many(colourVotes),
  gameRounds: many(gameRounds),
}));

export const bookFeaturesRelations = relations(bookFeatures, ({ one }) => ({
  book: one(books, {
    fields: [bookFeatures.bookId],
    references: [books.id],
  }),
}));

export const bookLayoutRelations = relations(bookLayout, ({ one }) => ({
  book: one(books, {
    fields: [bookLayout.bookId],
    references: [books.id],
  }),
}));

export const bookColoursRelations = relations(bookColours, ({ one }) => ({
  book: one(books, {
    fields: [bookColours.bookId],
    references: [books.id],
  }),
}));

export const colourVotesRelations = relations(colourVotes, ({ one }) => ({
  book: one(books, {
    fields: [colourVotes.bookId],
    references: [books.id],
  }),
  scribe: one(scribes, {
    fields: [colourVotes.scribeId],
    references: [scribes.id],
  }),
}));

export const scribesRelations = relations(scribes, ({ many }) => ({
  colourVotes: many(colourVotes),
  gameSessions: many(gameSessions),
  quillSamples: many(quillSamples),
  contributions: many(contributions, { relationName: "submitter" }),
  moderations: many(contributions, { relationName: "moderator" }),
}));

export const gameSessionsRelations = relations(gameSessions, ({ one, many }) => ({
  scribe: one(scribes, {
    fields: [gameSessions.scribeId],
    references: [scribes.id],
  }),
  rounds: many(gameRounds),
}));

export const gameRoundsRelations = relations(gameRounds, ({ one }) => ({
  session: one(gameSessions, {
    fields: [gameRounds.sessionId],
    references: [gameSessions.id],
  }),
  book: one(books, {
    fields: [gameRounds.bookId],
    references: [books.id],
  }),
}));

export const quillSamplesRelations = relations(quillSamples, ({ one }) => ({
  scribe: one(scribes, {
    fields: [quillSamples.scribeId],
    references: [scribes.id],
  }),
}));

export const contributionsRelations = relations(contributions, ({ one }) => ({
  submitter: one(scribes, {
    fields: [contributions.scribeId],
    references: [scribes.id],
    relationName: "submitter",
  }),
  moderator: one(scribes, {
    fields: [contributions.moderatedBy],
    references: [scribes.id],
    relationName: "moderator",
  }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Scribe = typeof scribes.$inferSelect;
export type NewScribe = typeof scribes.$inferInsert;

export type Author = typeof authors.$inferSelect;
export type NewAuthor = typeof authors.$inferInsert;

export type Book = typeof books.$inferSelect;
export type NewBook = typeof books.$inferInsert;

export type BookFeatures = typeof bookFeatures.$inferSelect;
export type NewBookFeatures = typeof bookFeatures.$inferInsert;

export type BookLayout = typeof bookLayout.$inferSelect;
export type NewBookLayout = typeof bookLayout.$inferInsert;

export type BookColour = typeof bookColours.$inferSelect;
export type NewBookColour = typeof bookColours.$inferInsert;

export type ColourVote = typeof colourVotes.$inferSelect;
export type NewColourVote = typeof colourVotes.$inferInsert;

export type GameSession = typeof gameSessions.$inferSelect;
export type NewGameSession = typeof gameSessions.$inferInsert;

export type GameRound = typeof gameRounds.$inferSelect;
export type NewGameRound = typeof gameRounds.$inferInsert;

export type QuillSample = typeof quillSamples.$inferSelect;
export type NewQuillSample = typeof quillSamples.$inferInsert;

export type Contribution = typeof contributions.$inferSelect;
export type NewContribution = typeof contributions.$inferInsert;
