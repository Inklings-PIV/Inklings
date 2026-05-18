// Side-effect import. Must be imported BEFORE any module that reads `process.env`
// (most importantly `@/lib/env`). Loads `.env.local` then `.env`; first wins per key.
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

// When `DRIZZLE_ENV=prod`, swap DATABASE_URL with DATABASE_URL_PROD so scripts
// that read `env.DATABASE_URL` (e.g. seed:tracer:prod) hit the prod DB.
if (process.env.DRIZZLE_ENV === "prod" && process.env.DATABASE_URL_PROD) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_PROD;
}
