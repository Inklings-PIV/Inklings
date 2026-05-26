"use client";

import { ArrowLeft, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { HandCard } from "@/components/authors/hand-card";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type SortKey = "recent" | "alpha" | "most";

export type Hand = {
  authorName: string;
  authorSlug: string;
  birthYear: number | null;
  deathYear: number | null;
  blotCount: number;
  lastIngestedAt: Date | null;
  blendedHues: { hue: number; saturation: number; lightness: number }[];
};

export function HandsView({ hands }: { hands: Hand[] }) {
  const [sort, setSort] = useState<SortKey>("alpha");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? hands.filter((h) => h.authorName.toLowerCase().includes(q))
      : hands.slice();

    switch (sort) {
      case "alpha":
        filtered.sort((a, b) => a.authorName.localeCompare(b.authorName));
        break;
      case "most":
        filtered.sort(
          (a, b) => b.blotCount - a.blotCount || a.authorName.localeCompare(b.authorName),
        );
        break;
      case "recent":
        filtered.sort((a, b) => {
          const at = a.lastIngestedAt?.getTime() ?? 0;
          const bt = b.lastIngestedAt?.getTime() ?? 0;
          return bt - at;
        });
        break;
    }
    return filtered;
  }, [hands, query, sort]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Link
        href="/blots"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-ink-deep"
      >
        <ArrowLeft className="size-3" /> All blots
      </Link>

      <header className="mt-3">
        <h1 className="font-display text-3xl tracking-tight text-ink-deep">The Hands</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Every writer in the corpus. Their <em>hand</em> is the mark they leave across all their
          blots — a signature in shape and in hue.
        </p>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-card pl-9 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40 focus:outline-none"
          />
        </div>
        <ToggleGroup
          type="single"
          value={sort}
          onValueChange={(v) => v && setSort(v as SortKey)}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="alpha">A–Z</ToggleGroupItem>
          <ToggleGroupItem value="most" title="Most blots in the corpus">
            <span className="hidden sm:inline">Most blots</span>
            <span className="sm:hidden">Most</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="recent" title="Most recently ingested">
            Recent
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <Separator className="my-6" />

      {visible.length === 0 ? (
        <EmptyState hasHands={hands.length > 0} query={query} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((hand) => (
            <li key={hand.authorSlug}>
              <HandCard hand={hand} />
            </li>
          ))}
        </ul>
      )}

      {hands.length > 0 && (
        <p className="mt-6 text-xs text-muted-foreground">
          {visible.length} of {hands.length} {hands.length === 1 ? "hand" : "hands"}
        </p>
      )}
    </div>
  );
}

function EmptyState({ hasHands, query }: { hasHands: boolean; query: string }) {
  if (hasHands && query) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
        No hands match &ldquo;{query}&rdquo;.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-dashed border-border bg-card/40 p-8 text-center">
      <p className="text-sm text-muted-foreground">No authors in the corpus yet.</p>
      <code className="mt-3 inline-block rounded bg-muted px-2 py-1 text-xs">pnpm seed:all</code>
    </div>
  );
}
