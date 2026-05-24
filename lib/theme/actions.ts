"use server";

import { cookies } from "next/headers";
import { THEME_COOKIE, THEME_COOKIE_MAX_AGE, type Theme } from "./cookie";

/**
 * Persists the user's theme choice. The cookie is read by the root layout
 * on every request, which adds the `dark` class to `<html>` server-side
 * before any markup hits the wire — so the next navigation paints with
 * the correct palette from frame zero.
 */
export async function setTheme(theme: Theme): Promise<void> {
  const jar = await cookies();
  jar.set({
    name: THEME_COOKIE,
    value: theme,
    path: "/",
    maxAge: THEME_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
}
