"use client";

import { useMemo, useState } from "react";
import { type CanvasDot, CanvasShell } from "@/components/canvas/canvas-shell";
import { BlotDetail, type NeighbourBlot } from "@/components/inkwell/blot-detail";
import { MethodologyDialog } from "@/components/inkwell/methodology-dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type HSLOverride, type HueSource, hueFor } from "@/lib/colour/placeholder";
import type { ClassicalFeatures } from "@/lib/stylometry/classical";

type Layout = "classical" | "modern" | "by-hue";

const layoutBlurb: Record<Layout, string> = {
  classical: "shape via classical stylometry",
  modern: "shape via modern embeddings",
  "by-hue": "clustered by hue",
};

export type Blot = {
  bookId: string;
  title: string;
  authorName: string;
  classical: ClassicalFeatures | null;
  /** Real algorithmic HSL from book_colours when present; null falls back to placeholder. */
  algorithmic: HSLOverride | null;
  layouts: {
    classical: { x: number; y: number } | null;
    modern: { x: number; y: number } | null;
    "by-hue": { x: number; y: number } | null;
  };
};

export function InkwellView({ blots }: { blots: Blot[] }) {
  const [layout, setLayout] = useState<Layout>("classical");
  const [source, setSource] = useState<HueSource>("blended");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const dots: CanvasDot[] = blots.flatMap((b) => {
    const coord = b.layouts[layout];
    if (!coord) return [];
    return [
      {
        id: b.bookId,
        x: coord.x,
        y: coord.y,
        title: b.title,
        subtitle: b.authorName,
        // Real HSL when this source has a derived value; otherwise placeholder.
        color: hueFor(b.bookId, source, source === "algorithmic" ? b.algorithmic : null).rgb,
      },
    ];
  });

  const selectedBlot = useMemo(
    () => (selectedId ? (blots.find((b) => b.bookId === selectedId) ?? null) : null),
    [blots, selectedId],
  );

  // Top-5 nearest neighbours on the current layout, by Euclidean distance.
  // Neighbours are layout-specific so the panel re-ranks when you change view.
  const neighbours = useMemo<NeighbourBlot[]>(() => {
    if (!selectedBlot) return [];
    const me = selectedBlot.layouts[layout];
    if (!me) return [];
    return blots
      .flatMap((b) => {
        if (b.bookId === selectedBlot.bookId) return [];
        const coord = b.layouts[layout];
        if (!coord) return [];
        const dx = coord.x - me.x;
        const dy = coord.y - me.y;
        return [
          {
            bookId: b.bookId,
            title: b.title,
            authorName: b.authorName,
            distance: Math.sqrt(dx * dx + dy * dy),
          },
        ];
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);
  }, [blots, layout, selectedBlot]);

  const caption =
    "The Inkwell awaits — once books are ingested, blots will appear here. Pan, zoom, and hover to read.";

  return (
    <CanvasShell
      caption={caption}
      dots={dots}
      onSelectDot={setSelectedId}
      toolbar={
        <>
          <div className="flex flex-col">
            <span className="font-serif text-lg tracking-tight text-ink-deep">The Inkwell</span>
            <span className="text-xs text-muted-foreground">
              {layoutBlurb[layout]} · {blots.length} {blots.length === 1 ? "blot" : "blots"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                layout
              </span>
              <ToggleGroup
                type="single"
                value={layout}
                onValueChange={(v) => v && setLayout(v as Layout)}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="classical">Classical</ToggleGroupItem>
                <ToggleGroupItem value="modern">Modern</ToggleGroupItem>
                <ToggleGroupItem value="by-hue">By Hue</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                source
              </span>
              <ToggleGroup
                type="single"
                value={source}
                onValueChange={(v) => v && setSource(v as HueSource)}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="algorithmic">Algo</ToggleGroupItem>
                <ToggleGroupItem value="llm">LLM</ToggleGroupItem>
                <ToggleGroupItem value="crowd">Crowd</ToggleGroupItem>
                <ToggleGroupItem value="blended">Blended</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <MethodologyDialog />
          </div>
        </>
      }
      detail={
        selectedBlot ? (
          <BlotDetail
            blot={{
              bookId: selectedBlot.bookId,
              title: selectedBlot.title,
              authorName: selectedBlot.authorName,
              classical: selectedBlot.classical,
              algorithmic: selectedBlot.algorithmic,
            }}
            neighbours={neighbours}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex h-full flex-col gap-4">
            <div>
              <h2 className="font-serif text-sm uppercase tracking-wider text-muted-foreground">
                Selected blot
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Click a blot on the canvas to read its hand.
              </p>
            </div>
            <div className="mt-auto rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
              Neighbours · stylometric features · open in Quill / Blots — will appear here.
            </div>
          </div>
        )
      }
    />
  );
}
