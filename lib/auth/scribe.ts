// Anonymous-first identity. Every visitor to a tabbed surface gets a signed
// `inklings_scribe` cookie (set by `proxy.ts` — only Proxy and route handlers
// can write cookies in Next 16). The matching `scribes` row is upserted here
// from the layout so votes, game sessions, and quill samples can FK to a
// real DB id without trusting client-supplied data.

import { eq } from "drizzle-orm";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { getDb, schema } from "@/lib/db";
import { env } from "@/lib/env";

export type ScribeSession = {
  token: string;
  email?: string;
};

export type Scribe = {
  /** Stable cookie value — also a column on the `scribes` row. */
  token: string;
  /** DB primary key — the FK target for votes, sessions, samples. */
  id: string;
  /** Optional email if the scribe upgraded via magic link (#40). */
  email?: string;
};

/** Shared by the server-side reader (this file) and proxy.ts at the edge. */
export function scribeSessionOptions(): SessionOptions {
  return {
    password: env.SESSION_SECRET,
    cookieName: "inklings_scribe",
    cookieOptions: {
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      httpOnly: true,
    },
  };
}

export async function getScribeSession() {
  const jar = await cookies();
  return getIronSession<ScribeSession>(jar, scribeSessionOptions());
}

/**
 * Reads the cookie set by proxy.ts and upserts the matching `scribes` row,
 * returning both the token and the DB id. Read-only on the cookie — never
 * writes from here (server components / layouts can't modify cookies in
 * Next 16; that's proxy.ts's job).
 *
 * Safe to call on every request: the DB upsert uses ON CONFLICT, so steady
 * state is a single indexed query.
 */
export async function ensureScribe(): Promise<Scribe> {
  const session = await getScribeSession();
  if (!session.token) {
    throw new Error(
      "No scribe cookie found. Is proxy.ts matching this route? Tab routes (/inkwell, /blots, /game, /quill) should be covered.",
    );
  }

  const db = getDb();
  const [row] = await db
    .insert(schema.scribes)
    .values({ token: session.token, email: session.email })
    .onConflictDoNothing({ target: schema.scribes.token })
    .returning({ id: schema.scribes.id });

  // ON CONFLICT DO NOTHING returns no row when the scribe already exists,
  // so fall back to a SELECT in that case.
  if (row) {
    return { token: session.token, id: row.id, email: session.email };
  }
  const [existing] = await db
    .select({ id: schema.scribes.id })
    .from(schema.scribes)
    .where(eq(schema.scribes.token, session.token))
    .limit(1);
  if (!existing) {
    throw new Error("Scribe insert returned no row and lookup found nothing — race?");
  }
  return { token: session.token, id: existing.id, email: session.email };
}
