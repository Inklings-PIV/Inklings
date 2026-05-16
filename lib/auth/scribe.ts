import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export type ScribeSession = {
  token: string;
  email?: string;
};

function sessionOptions(): SessionOptions {
  if (!env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set (min 32 chars).");
  }
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
  return getIronSession<ScribeSession>(jar, sessionOptions());
}

export async function ensureScribe(): Promise<ScribeSession> {
  const session = await getScribeSession();
  if (!session.token) {
    session.token = crypto.randomUUID();
    await session.save();
  }
  return { token: session.token, email: session.email };
}
