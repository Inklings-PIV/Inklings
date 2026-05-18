import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config({ path: ".env" });

// Pick prod URL when `DRIZZLE_ENV=prod` is set (used by `pnpm db:migrate:prod` etc).
const url =
  process.env.DRIZZLE_ENV === "prod" ? process.env.DATABASE_URL_PROD : process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    process.env.DRIZZLE_ENV === "prod"
      ? "DATABASE_URL_PROD is not set in .env / .env.local"
      : "DATABASE_URL is not set in .env / .env.local",
  );
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
