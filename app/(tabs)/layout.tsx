import type { ReactNode } from "react";
import { TabsNav } from "@/components/tabs-nav";

export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-8 px-6 py-3">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-xl tracking-tight text-ink-deep">Inklings</span>
            <span className="text-xs text-muted-foreground">authors in shape & hue</span>
          </div>
          <TabsNav />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
