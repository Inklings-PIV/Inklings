"use client";

import { Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type SortKey = "recent" | "alpha" | "consensus";

const placeholderBlots = [
  { author: "Virginia Woolf", title: "Mrs Dalloway", hues: stubHues(260, 80, 140, 200) },
  { author: "Ernest Hemingway", title: "The Sun Also Rises", hues: stubHues(230, 220, 250, 235) },
  { author: "George Orwell", title: "1984", hues: stubHues(260, 270, 240, 255) },
  { author: "Jorge Luis Borges", title: "Ficciones", hues: stubHues(80, 30, 60, 50) },
  { author: "Toni Morrison", title: "Beloved", hues: stubHues(20, 0, 350, 10) },
  { author: "Italo Calvino", title: "Invisible Cities", hues: stubHues(180, 140, 200, 170) },
  { author: "Franz Kafka", title: "The Trial", hues: stubHues(270, 290, 250, 275) },
  {
    author: "Clarice Lispector",
    title: "The Passion According to G.H.",
    hues: stubHues(330, 350, 10, 340),
  },
];

export default function BlotsPage() {
  const [sort, setSort] = useState<SortKey>("recent");

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
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
        <div className="relative flex-1 min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search by title, author, or vibe…"
            className="h-9 w-full rounded-md border border-border bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            disabled
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

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {placeholderBlots.map((blot) => (
          <li key={`${blot.author}-${blot.title}`}>
            <BlotCard {...blot} />
          </li>
        ))}
      </ul>
    </div>
  );
}

type BlotCardProps = {
  author: string;
  title: string;
  hues: { algorithmic: string; llm: string; crowd: string; blended: string };
};

function BlotCard({ author, title, hues }: BlotCardProps) {
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
          <h3 className="font-serif text-base leading-tight text-ink-deep">{title}</h3>
          <p className="text-xs text-muted-foreground">{author}</p>
        </div>

        <div className="flex items-center gap-1.5">
          <HueChip label="Algo" color={hues.algorithmic} />
          <HueChip label="LLM" color={hues.llm} />
          <HueChip label="Crowd" color={hues.crowd} />
          <HueChip label="Blend" color={hues.blended} ring />
        </div>

        <FingerprintBars />
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
        style={{ backgroundColor: color, boxShadow: ring ? "0 0 0 1px var(--ring)" : undefined }}
      />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

function FingerprintBars() {
  return (
    <div
      aria-hidden="true"
      className="flex h-6 items-end gap-px"
      title="Stylometric fingerprint (placeholder)"
    >
      {Array.from({ length: 28 }, (_, i) => i).map((i) => {
        const h = 30 + ((i * 37) % 70);
        return (
          <span key={i} className="w-1 rounded-sm bg-ink-faded/50" style={{ height: `${h}%` }} />
        );
      })}
    </div>
  );
}

function stubHues(a: number, l: number, c: number, b: number) {
  return {
    algorithmic: `oklch(0.7 0.16 ${a})`,
    llm: `oklch(0.7 0.16 ${l})`,
    crowd: `oklch(0.7 0.16 ${c})`,
    blended: `oklch(0.7 0.16 ${b})`,
  };
}
