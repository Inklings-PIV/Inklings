// Next 16 Proxy (formerly Middleware) — sets the anonymous `inklings_scribe`
// cookie on first visit to any tab route. Server components / layouts can't
// modify cookies in Next 16, so the cookie write has to live here.
//
// First-visit dance: cookies set on the *response* aren't visible to the
// same request's server components (they're on the outgoing Set-Cookie
// header, not the incoming Cookie header). So when the cookie's missing
// we set it AND redirect back to the same URL — the browser then resends
// with the cookie present, and the layout's `ensureScribe()` finds it.

import { getIronSession } from "iron-session";
import { type NextRequest, NextResponse } from "next/server";
import { type ScribeSession, scribeSessionOptions } from "@/lib/auth/scribe";

// Next metadata routes (file conventions: opengraph-image, twitter-image,
// icon, apple-icon, sitemap, robots) are hit by share-preview crawlers
// that don't carry cookies. Looping them through the set-cookie redirect
// would 307 forever, so they bypass the scribe check entirely.
const METADATA_SUFFIXES = [
  "/opengraph-image",
  "/twitter-image",
  "/icon",
  "/apple-icon",
  "/sitemap.xml",
  "/robots.txt",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (METADATA_SUFFIXES.some((s) => pathname === s || pathname.endsWith(s))) {
    return NextResponse.next();
  }

  // Decrypt the incoming cookie rather than just checking it exists: a cookie
  // signed with an old SESSION_SECRET (e.g. after rotating .env) is present but
  // won't decrypt, leaving an empty session that would 500 ensureScribe. Treat
  // "no valid token" the same as "no cookie" and re-mint.
  const probe = NextResponse.next();
  const current = await getIronSession<ScribeSession>(request, probe, scribeSessionOptions());
  if (current.token) {
    return NextResponse.next();
  }

  // First visit (or stale/undecryptable cookie) — set a fresh cookie via
  // iron-session and redirect so the browser carries it on the next hop.
  const response = NextResponse.redirect(request.url, 307);
  const session = await getIronSession<ScribeSession>(request, response, scribeSessionOptions());
  session.token = crypto.randomUUID();
  await session.save();
  return response;
}

export const config = {
  // Matches every tab surface and its sub-routes plus /admin (which needs a
  // scribe cookie to look up moderator status). / and other top-level pages
  // don't need a scribe cookie.
  matcher: ["/inkwell/:path*", "/blots/:path*", "/game/:path*", "/quill/:path*", "/admin/:path*"],
};
