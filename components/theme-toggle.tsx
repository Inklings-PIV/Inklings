"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * Sun/moon toggle in the site nav. Two visible states: explicit light or
 * explicit dark. The library handles the "follow system" default before
 * the user clicks, plus tab-sync via the storage event.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // `useTheme` returns undefined on the server and on the very first
  // client render — render a stable placeholder icon until mount to avoid
  // a hydration mismatch. The flip happens within one frame after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
