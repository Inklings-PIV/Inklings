import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// Each var is required at validation time once its consumer ships; the rest
// stay optional until they do. `SKIP_ENV_VALIDATION=true` is the escape hatch
// for environments that don't need the consumer (CI, transient scripts).
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // Required: every page reads from the DB.
    DATABASE_URL: z.string().min(1),
    // Required: ingestion writes embeddings (#14) and /blots vibe search (#29)
    // both call OpenAI.
    OPENAI_API_KEY: z.string().min(1),
    // Required: #25 LLM colour deriver and the ingest pipeline both call
    // Claude. #38 Quill rewrites will use the same key.
    ANTHROPIC_API_KEY: z.string().min(1),
    // Optional until #39 (iron-session scribe cookie) ships.
    SESSION_SECRET: z.string().min(32).optional(),
    // Optional in dev (uses the local Inngest dev server); required in prod
    // for the deployed Inngest function to send/receive events. Enforced by
    // the seed-all script's pre-flight check, not here.
    INNGEST_EVENT_KEY: z.string().optional(),
    INNGEST_SIGNING_KEY: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().min(1).default("http://localhost:3000"),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    SESSION_SECRET: process.env.SESSION_SECRET,
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
