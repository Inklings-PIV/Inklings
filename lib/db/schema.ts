import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const scribes = pgTable("scribes", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export type Scribe = typeof scribes.$inferSelect;
export type NewScribe = typeof scribes.$inferInsert;
