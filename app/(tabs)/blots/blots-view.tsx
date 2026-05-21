"use client";

import { Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { hueFor } from "@/lib/colour/placeholder";
import type { ClassicalFeatures } from "@/lib/stylometry/classical";

type SortKey = "recent" | "alpha" | "consensus";

export type Blot = {
  bookId: string;
  title: string;
  authorName: string;
  ingestedAt: Date;
  classical: ClassicalFeatures | null;
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

function BlotCard({ blot }: { blot: Blot }) {
  const hues = {
    algorithmic: hueFor(blot.bookId, "algorithmic").css,
    llm: hueFor(blot.bookId, "llm").css,
    crowd: hueFor(blot.bookId, "crowd").css,
    blended: hueFor(blot.bookId, "blended").css,
  };

  return (
    <Card className="h-full bg-card/60 transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div
          role="img"
          aria-label="Blended hue"
          className="size-10 rounded-full border border-border shadow-inner"
          style={{ backgroundColor: hues.blended }}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-2">
        <div>
          <h3 className="font-serif text-base leading-tight text-ink-deep">{blot.title}</h3>
          <p className="text-xs text-muted-foreground">{blot.authorName}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <HueChip label="Algo" color={hues.algorithmic} />
          <HueChip label="LLM" color={hues.llm} />
          <HueChip label="Crowd" color={hues.crowd} />
          <HueChip label="Blend" color={hues.blended} ring />
        </div>

        <FingerprintBars features={blot.classical} />
      </CardContent>
    </Card>
  );
}

function HueChip({ label, color, ring = false }: { label: string; color: string; ring?: boolean }) {
  return (
    <div
      className="flex items-center gap-1 rounded-full border border-border bg-background/70 px-1.5 py-0.5"
      title={label}
    >
      <span
        className="size-3 rounded-full border border-border/60"
        style={{
          backgroundColor: color,
          boxShadow: ring ? "0 0 0 1px var(--ring)" : undefined,
        }}
      />
      <span className="text-[10px] tracking-wider text-muted-foreground uppercase">{label}</span>
    </div>
  );
}

// 28 of the most common English function words — every book's bar over these
// gives a visible per-book fingerprint shape that's stable across reads.
const FINGERPRINT_WORDS = [
  "the",
  "of",
  "and",
  "to",
  "in",
  "a",
  "he",
  "she",
  "it",
  "is",
  "was",
  "but",
  "his",
  "her",
  "for",
  "as",
  "with",
  "they",
  "be",
  "not",
  "this",
  "that",
  "from",
  "you",
  "by",
  "have",
  "had",
  "are",
];

function FingerprintBars({ features }: { features: ClassicalFeatures | null }) {
  // Map function-word freq (0..~0.05 typically) into 0..1 bar height. The ×20
  // factor stretches the common range so bars are distinctive without saturating.
  const heights = FINGERPRINT_WORDS.map((w) => {
    const freq = features?.functionWords?.[w] ?? 0;
    return Math.min(1, freq * 20);
  });

  return (
    <div
      aria-hidden="true"
      className="flex h-6 items-end gap-px"
      title="Stylometric fingerprint — function-word frequencies"
    >
      {heights.map((h, i) => (
        <span
          key={FINGERPRINT_WORDS[i]}
          className="w-1 rounded-sm bg-ink-faded/60"
          style={{ height: `${Math.max(6, h * 100)}%` }}
        />
      ))}
    </div>
  );
}
