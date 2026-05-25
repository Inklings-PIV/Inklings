DROP INDEX "books_gutenberg_id_idx";--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "translation_of" uuid;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_translation_of_books_id_fk" FOREIGN KEY ("translation_of") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "books_gutenberg_id_lang_idx" ON "books" USING btree ("gutenberg_id","lang");--> statement-breakpoint
CREATE INDEX "books_translation_of_idx" ON "books" USING btree ("translation_of");