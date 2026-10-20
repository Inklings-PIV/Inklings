// @vitest-environment node

import { getIronSession } from "iron-session";
import { describe, expect, it } from "vitest";

describe("iron-session cookie compatibility", () => {
  it("creates, saves, and reopens the anonymous scribe cookie", async () => {
    const values = new Map<string, string>();
    const jar = {
      get: (name: string) => {
        const value = values.get(name);
        return value === undefined ? undefined : { name, value };
      },
      set: (name: string, value: string) => {
        values.set(name, value);
      },
    };
    const options = {
      password: "offline-test-only-32-characters-long",
      cookieName: "inklings_scribe",
    };
    const session = await getIronSession<{ token: string }>(jar, options);
    expect(session.token).toBeUndefined();
    session.token = "offline-scribe";
    await session.save();

    const reopened = await getIronSession<{ token: string }>(jar, options);
    expect(reopened.token).toBe("offline-scribe");
    reopened.destroy();
    const destroyed = await getIronSession<{ token: string }>(jar, options);
    expect(destroyed.token).toBeUndefined();
  });
});
