// @vitest-environment node

import { getIronSession, sealData } from "iron-session";
import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

vi.mock("@/lib/env", () => ({
  env: { SESSION_SECRET: "offline-test-only-32-characters-long", NODE_ENV: "test" },
}));
vi.mock("@/lib/db", () => ({
  getDb: () => {
    throw new Error("Proxy must not access the database");
  },
  schema: {},
}));

const options = {
  password: "offline-test-only-32-characters-long",
  cookieName: "inklings_scribe",
};
const url = "http://localhost:3108/quill";

describe("anonymous scribe proxy with iron-session", () => {
  it.each([undefined, "inklings_scribe=stale-or-invalid"])(
    "mints a cookie for missing or stale session %s and accepts the next request",
    async (cookie) => {
      const request = new NextRequest(url, { headers: cookie ? { cookie } : {} });
      const response = await proxy(request);
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(url);
      const mintedCookie = response.headers.get("set-cookie")?.split(";")[0];
      expect(mintedCookie).toMatch(/^inklings_scribe=.+/);

      const followup = new NextRequest(url, { headers: { cookie: mintedCookie ?? "" } });
      const session = await getIronSession<{ token: string }>(
        followup,
        NextResponse.next(),
        options,
      );
      expect(session.token).toMatch(/^[0-9a-f-]{36}$/);
      const accepted = await proxy(followup);
      expect(accepted.status).toBe(200);
      expect(accepted.headers.get("location")).toBeNull();
      expect(accepted.headers.get("set-cookie")).toBeNull();
    },
  );

  it("retains an existing valid scribe rather than reminting it", async () => {
    const sealed = await sealData({ token: "offline-existing-scribe" }, options);
    const response = await proxy(
      new NextRequest(url, { headers: { cookie: `inklings_scribe=${sealed}` } }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("accepts a cookie sealed by iron-session 8 without signing the scribe out", async () => {
    // Sealed once with iron-session 8.0.4, ttl: 0, using only the offline
    // password above. No real identity or credential is stored here.
    const legacyCookie =
      "Fe26.2*1*54c7a70230962c1bb7bf377580ffa180f47fa8968b0288b4bff81b963e74c924*QCIYuLScjpTMzpsSv4DyeQ*mYkzkTAXNlSn-sgn_7IRI-uJT185R3rW86kzy-a2R9NdX5cjEjpgPbVFBMveGadD**5c45a5e6612a63a16bba256e454ecd3f93fa1df97587ec7b1ffc3200caf1985d*a2YzlMJ_Dag9Ik2d5VljDRREHMnaOIXxgYuWbc9818I~2";
    const request = new NextRequest(url, {
      headers: { cookie: `inklings_scribe=${legacyCookie}` },
    });
    const session = await getIronSession<{ token: string }>(request, NextResponse.next(), options);
    expect(session.token).toBe("offline-legacy-scribe");
    const response = await proxy(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("bypasses metadata routes even when the visitor has no cookie", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3108/blots/book/opengraph-image"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
