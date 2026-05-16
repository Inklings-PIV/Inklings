"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/inkwell", label: "Inkwell", sub: "canvas" },
  { href: "/blots", label: "Blots", sub: "browse" },
  { href: "/game", label: "Blotting Game", sub: "play" },
  { href: "/quill", label: "Quill", sub: "write" },
];

export function TabsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "group relative rounded-md px-3 py-1.5 text-sm transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="font-medium">The {tab.label}</span>
            {active && (
              <span
                aria-hidden="true"
                className="absolute -bottom-px left-3 right-3 h-px bg-ink-bleed"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
