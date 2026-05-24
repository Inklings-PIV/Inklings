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

const COOKIE_NAME = "inklings_scribe";

export async function proxy(request: NextRequest) {
  if (request.cookies.has(COOKIE_NAME)) {
    return NextResponse.next();
  }

  // First visit — set the cookie via iron-session and redirect so the
  // browser carries it on the next hop.
  const response = NextResponse.redirect(request.url, 307);
  const session = await getIronSession<ScribeSession>(request, response, scribeSessionOptions());
  session.token = crypto.randomUUID();
  await session.save();
  return response;
}

export const config = {
  // Matches every tab surface and its sub-routes; / and other top-level
  // pages don't need a scribe cookie.
  matcher: ["/inkwell/:path*", "/blots/:path*", "/game/:path*", "/quill/:path*"],
};
