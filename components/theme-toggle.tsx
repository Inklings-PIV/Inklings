"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { setTheme } from "@/lib/theme/actions";

/**
 * Sun/moon toggle in the site nav. Two states only: explicit light or
 * explicit dark. Before any click, the cookie is absent and the inline
 * head-script picks a class from `prefers-color-scheme` — so "match my
 * system" is the implicit default.
 *
 * Once the user clicks, the cookie locks the choice. There's no way back
 * to "match system" without clearing it — fine for v1; #51 only asks for
 * a toggle.
 */
export function ThemeToggle() {
  const [_, startTransition] = useTransition();
  // The icon depends on the *current* class on <html>, which the inline
  // head script may have set before hydration. We can't read that during
  // SSR — render a neutral default and sync once mounted to avoid a
  // hydration mismatch. The icon flip happens within one frame.
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: "light" | "dark" = isDark ? "light" : "dark";
    // Flip the class immediately so the user doesn't wait for the server
    // round-trip. The server action then persists the cookie so the next
    // navigation paints in the new palette from frame zero.
    document.documentElement.classList.toggle("dark", next === "dark");
    setIsDark(next === "dark");
    startTransition(() => {
      void setTheme(next);
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {/* Pre-mount we don't know the state — render moon as a stable default
          (matches the SSR <html> class, which only carries `dark` when the
          cookie said so). */}
      {mounted && isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
