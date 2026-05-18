CREATE TYPE "public"."book_status" AS ENUM('pending', 'ingesting', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."colour_source" AS ENUM('algorithmic', 'llm', 'crowd', 'blended');--> statement-breakpoint
CREATE TYPE "public"."contribution_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."game_mode" AS ENUM('swatch', 'wheel', 'twin');--> statement-breakpoint
CREATE TYPE "public"."layout_mode" AS ENUM('classical', 'modern', 'by-hue');--> statement-breakpoint
CREATE TYPE "public"."scribe_role" AS ENUM('scribe', 'moderator');--> statement-breakpoint
CREATE TYPE "public"."vote_source" AS ENUM('game', 'manual');--> statement-breakpoint
CREATE TABLE "authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"gutenberg_id" integer,
	"birth_year" smallint,
	"death_year" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authors_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "book_colours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"source" "colour_source" NOT NULL,
	"hue" smallint NOT NULL,
	"saturation" smallint NOT NULL,
	"lightness" smallint NOT NULL,
	"justification" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_features" (
	"book_id" uuid PRIMARY KEY NOT NULL,
	"classical" jsonb,
	"embedding" vector(1536),
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "book_layout" (
	"book_id" uuid NOT NULL,
	"mode" "layout_mode" NOT NULL,
	"layout_version" integer NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "book_layout_book_id_mode_layout_version_pk" PRIMARY KEY("book_id","mode","layout_version")
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"gutenberg_id" integer,
	"lang" text DEFAULT 'en' NOT NULL,
	"word_count" integer,
	"status" "book_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ingested_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "colour_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"scribe_id" uuid NOT NULL,
	"hue" smallint NOT NULL,
	"saturation" smallint NOT NULL,
	"lightness" smallint NOT NULL,
	"source" "vote_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scribe_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "contribution_status" DEFAULT 'pending' NOT NULL,
	"moderated_by" uuid,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"mode" "game_mode" NOT NULL,
	"presented" jsonb NOT NULL,
	"guess" jsonb,
	"scored" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scribe_id" uuid NOT NULL,
	"mode" "game_mode" NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quill_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scribe_id" uuid NOT NULL,
	"text" text NOT NULL,
	"computed_colour" jsonb,
	"target_colour" jsonb,
	"suggestions" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scribes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"email" text,
	"role" "scribe_role" DEFAULT 'scribe' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scribes_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "book_colours" ADD CONSTRAINT "book_colours_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_features" ADD CONSTRAINT "book_features_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_layout" ADD CONSTRAINT "book_layout_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colour_votes" ADD CONSTRAINT "colour_votes_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "colour_votes" ADD CONSTRAINT "colour_votes_scribe_id_scribes_id_fk" FOREIGN KEY ("scribe_id") REFERENCES "public"."scribes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_scribe_id_scribes_id_fk" FOREIGN KEY ("scribe_id") REFERENCES "public"."scribes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_moderated_by_scribes_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."scribes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_scribe_id_scribes_id_fk" FOREIGN KEY ("scribe_id") REFERENCES "public"."scribes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quill_samples" ADD CONSTRAINT "quill_samples_scribe_id_scribes_id_fk" FOREIGN KEY ("scribe_id") REFERENCES "public"."scribes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "authors_gutenberg_id_idx" ON "authors" USING btree ("gutenberg_id");--> statement-breakpoint
CREATE UNIQUE INDEX "book_colours_book_source_idx" ON "book_colours" USING btree ("book_id","source");--> statement-breakpoint
CREATE INDEX "book_features_embedding_hnsw_idx" ON "book_features" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "book_layout_mode_version_idx" ON "book_layout" USING btree ("mode","layout_version");--> statement-breakpoint
CREATE INDEX "books_author_id_idx" ON "books" USING btree ("author_id");--> statement-breakpoint
CREATE UNIQUE INDEX "books_gutenberg_id_idx" ON "books" USING btree ("gutenberg_id");--> statement-breakpoint
CREATE UNIQUE INDEX "books_author_slug_idx" ON "books" USING btree ("author_id","slug");--> statement-breakpoint
CREATE INDEX "books_status_idx" ON "books" USING btree ("status");--> statement-breakpoint
CREATE INDEX "colour_votes_book_id_idx" ON "colour_votes" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "colour_votes_scribe_id_idx" ON "colour_votes" USING btree ("scribe_id");--> statement-breakpoint
CREATE INDEX "contributions_scribe_id_idx" ON "contributions" USING btree ("scribe_id");--> statement-breakpoint
CREATE INDEX "contributions_status_idx" ON "contributions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "game_rounds_session_id_idx" ON "game_rounds" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "game_rounds_book_id_idx" ON "game_rounds" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "game_sessions_scribe_id_idx" ON "game_sessions" USING btree ("scribe_id");--> statement-breakpoint
CREATE INDEX "quill_samples_scribe_id_idx" ON "quill_samples" USING btree ("scribe_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scribes_email_idx" ON "scribes" USING btree ("email");