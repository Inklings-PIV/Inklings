"use client";

import { useState } from "react";
import { type CanvasDot, CanvasShell } from "@/components/canvas/canvas-shell";
import { MethodologyDialog } from "@/components/inkwell/methodology-dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type HueSource, hueFor } from "@/lib/colour/placeholder";

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
  layouts: {
    classical: { x: number; y: number } | null;
    modern: { x: number; y: number } | null;
    "by-hue": { x: number; y: number } | null;
  };
};

export function InkwellView({ blots }: { blots: Blot[] }) {
  const [layout, setLayout] = useState<Layout>("classical");
  const [source, setSource] = useState<HueSource>("blended");

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
        color: hueFor(b.bookId, source).rgb,
      },
    ];
  });

  const caption =
    "The Inkwell awaits — once books are ingested, blots will appear here. Pan, zoom, and hover to read.";

  return (
    <CanvasShell
      caption={caption}
      dots={dots}
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
      }
    />
  );
}
