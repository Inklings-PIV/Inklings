import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import { env } from "@/lib/env";

type Db = NeonHttpDatabase<typeof schema>;

let _db: Db | null = null;

export function getDb(): Db {
  if (_db) return _db;
  _db = drizzle(neon(env.DATABASE_URL), { schema });
  return _db;
}

export { schema };
