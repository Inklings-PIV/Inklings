"use client";

import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: ReactNode }) {
  return <TooltipProvider delayDuration={150}>{children}</TooltipProvider>;
}
