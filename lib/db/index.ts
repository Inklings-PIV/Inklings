import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import { env } from "@/lib/env";

function createDb() {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }
  return drizzle(neon(env.DATABASE_URL), { schema });
}

export const db = createDb();
export { schema };
