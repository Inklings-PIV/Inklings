// Shared constants for the dark-mode cookie. The actual value is written by
// the `setTheme` server action and read both server-side (in app/layout.tsx)
// and inline-script side (the FOUC-prevention shim in <head>).

export const THEME_COOKIE = "inklings_theme";

export type Theme = "light" | "dark";

// One year — long enough that the user's preference survives. We re-set on
// every toggle anyway, so a returning user keeps refreshing the expiry.
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
