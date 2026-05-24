CREATE TYPE "public"."excerpt_strategy" AS ENUM('random', 'first-page', 'longest-paragraph', 'representative');--> statement-breakpoint
CREATE TABLE "book_excerpts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"strategy" "excerpt_strategy" NOT NULL,
	"excerpt" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "book_excerpts" ADD CONSTRAINT "book_excerpts_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "book_excerpts_book_strategy_idx" ON "book_excerpts" USING btree ("book_id","strategy");