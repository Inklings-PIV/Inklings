"use client";

import { Loader2, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { BlotCard } from "@/components/blots/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { HSLOverride } from "@/lib/colour/placeholder";
import type { ClassicalFeatures } from "@/lib/stylometry/classical";
import { searchByVibe } from "./actions";

type SortKey = "recent" | "alpha" | "consensus";
type SearchMode = "text" | "vibe";

export type Blot = {
  bookId: string;
  title: string;
  authorName: string;
  authorSlug: string;
  ingestedAt: Date;
  classical: ClassicalFeatures | null;
  algorithmic: HSLOverride | null;
  llm: HSLOverride | null;
  crowd: HSLOverride | null;
  blended: HSLOverride | null;
};

export function BlotsView({ blots }: { blots: Blot[] }) {
  const [sort, setSort] = useState<SortKey>("recent");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("text");
  const [vibeOrder, setVibeOrder] = useState<string[] | null>(null);
  const [vibePending, startVibe] = useTransition();

  // Debounced vibe search — 500ms idle before we burn an OpenAI embedding call.
  useEffect(() => {
    if (mode !== "vibe") {
      setVibeOrder(null);
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setVibeOrder(null);
      return;
    }
    const handle = setTimeout(() => {
      startVibe(async () => {
        const matches = await searchByVibe(trimmed);
        setVibeOrder(matches.map((m) => m.bookId));
      });
    }, 500);
    return () => clearTimeout(handle);
  }, [mode, query]);

  const visible = useMemo(() => {
    // Vibe mode: filter + order by the server-supplied ranking.
    if (mode === "vibe" && vibeOrder) {
      const rank = new Map(vibeOrder.map((id, i) => [id, i]));
      return blots
        .filter((b) => rank.has(b.bookId))
        .sort((a, b) => (rank.get(a.bookId) ?? 0) - (rank.get(b.bookId) ?? 0));
    }

    // Text mode: ILIKE-ish client-side filter on title/author, then sort.
    const q = query.trim().toLowerCase();
    const filtered =
      mode === "text" && q
        ? blots.filter(
            (b) => b.title.toLowerCase().includes(q) || b.authorName.toLowerCase().includes(q),
          )
        : blots.slice();

    switch (sort) {
      case "recent":
        filtered.sort((a, b) => b.ingestedAt.getTime() - a.ingestedAt.getTime());
        break;
      case "alpha":
        filtered.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "consensus":
        // No vote data yet (lands with #26). Fall back to most recent.
        filtered.sort((a, b) => b.ingestedAt.getTime() - a.ingestedAt.getTime());
        break;
    }
    return filtered;
  }, [blots, query, sort, mode, vibeOrder]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl tracking-tight text-ink-deep">The Blots</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every book, examined one at a time. Its shape, its four hues, its hand.
          </p>
        </div>
        <Button size="sm" variant="outline" disabled>
          <Sparkles /> Submit a Gutenberg ID
        </Button>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder={
              mode === "vibe"
                ? "Describe a vibe — e.g. lonely man at sea…"
                : "Search by title or author…"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-card pr-9 pl-9 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40 focus:outline-none"
          />
          {vibePending && (
            <Loader2
              aria-label="Searching"
              className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            />
          )}
        </div>
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => v && setMode(v as SearchMode)}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="text" title="Title or author">
            <span className="hidden sm:inline">Title/Author</span>
            <span className="sm:hidden">Text</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="vibe">Vibe</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup
          type="single"
          value={sort}
          onValueChange={(v) => v && setSort(v as SortKey)}
          variant="outline"
          size="sm"
          // Vibe mode imposes its own ordering — disable sort to avoid confusion.
          disabled={mode === "vibe"}
        >
          <ToggleGroupItem value="recent">Recent</ToggleGroupItem>
          <ToggleGroupItem value="alpha">A–Z</ToggleGroupItem>
          <ToggleGroupItem value="consensus" title="Crowd-loved">
            <span className="hidden sm:inline">Crowd-loved</span>
            <span className="sm:hidden">Loved</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <Separator className="my-6" />

      {visible.length === 0 ? (
        <EmptyState hasBlots={blots.length > 0} query={query} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((blot) => (
            <li key={blot.bookId}>
              <BlotCard blot={blot} />
            </li>
          ))}
        </ul>
      )}

      {blots.length > 0 && (
        <p className="mt-6 text-xs text-muted-foreground">
          {visible.length} of {blots.length} {blots.length === 1 ? "book" : "books"}
        </p>
      )}
    </div>
  );
}

function EmptyState({ hasBlots, query }: { hasBlots: boolean; query: string }) {
  if (hasBlots && query) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
        No books match &ldquo;{query}&rdquo;.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-dashed border-border bg-card/40 p-8 text-center">
      <p className="text-sm text-muted-foreground">No blots ingested yet.</p>
      <code className="mt-3 inline-block rounded bg-muted px-2 py-1 text-xs">pnpm seed:all</code>
    </div>
  );
}
