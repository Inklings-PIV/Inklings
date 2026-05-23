"use client";

import { Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FingerprintBars, SourceHues } from "@/components/blots/widgets";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type HSLOverride, hueFor } from "@/lib/colour/placeholder";
import type { ClassicalFeatures } from "@/lib/stylometry/classical";

type SortKey = "recent" | "alpha" | "consensus";

export type Blot = {
  bookId: string;
  title: string;
  authorName: string;
  ingestedAt: Date;
  classical: ClassicalFeatures | null;
  algorithmic: HSLOverride | null;
};

export function BlotsView({ blots }: { blots: Blot[] }) {
  const [sort, setSort] = useState<SortKey>("recent");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
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
  }, [blots, query, sort]);

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
            placeholder="Search by title or author…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-card pr-3 pl-9 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40 focus:outline-none"
          />
        </div>
        <ToggleGroup
          type="single"
          value={sort}
          onValueChange={(v) => v && setSort(v as SortKey)}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="recent">Recent</ToggleGroupItem>
          <ToggleGroupItem value="alpha">A–Z</ToggleGroupItem>
          <ToggleGroupItem value="consensus">Crowd-loved</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <Separator className="my-6" />

      {visible.length === 0 ? (
        <EmptyState hasBlots={blots.length > 0} query={query} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((blot) => (
            <li key={blot.bookId}>
              <Link
                href={`/blots/${blot.bookId}`}
                className="block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <BlotCard blot={blot} />
              </Link>
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

function BlotCard({ blot }: { blot: Blot }) {
  const blendedCss = hueFor(blot.bookId, "blended").css;

  return (
    <Card className="h-full bg-card/60 transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div
          role="img"
          aria-label="Blended hue"
          className="size-10 rounded-full border border-border shadow-inner"
          style={{ backgroundColor: blendedCss }}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-2">
        <div>
          <h3 className="font-serif text-base leading-tight text-ink-deep">{blot.title}</h3>
          <p className="text-xs text-muted-foreground">{blot.authorName}</p>
        </div>

        <SourceHues bookId={blot.bookId} algorithmic={blot.algorithmic} />

        <FingerprintBars features={blot.classical} />
      </CardContent>
    </Card>
  );
}
