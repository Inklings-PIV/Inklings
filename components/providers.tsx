"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: ReactNode }) {
  return (
    // attribute="class" matches the `.dark` selector already in globals.css.
    // defaultTheme="system" + enableSystem honour the OS preference until
    // the user explicitly toggles, then the choice is persisted in
    // localStorage. The library injects a synchronous head script to set
    // the class pre-paint, so there's no FOUC.
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
    </ThemeProvider>
  );
}
