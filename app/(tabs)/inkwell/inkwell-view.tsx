"use client";

import { useState } from "react";
import { type CanvasDot, CanvasShell } from "@/components/canvas/canvas-shell";
import { MethodologyDialog } from "@/components/inkwell/methodology-dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Layout = "classical" | "modern" | "by-hue";
type HueSource = "algorithmic" | "llm" | "crowd" | "blended";

const layoutBlurb: Record<Layout, string> = {
  classical: "shape via classical stylometry",
  modern: "shape via modern embeddings",
  "by-hue": "clustered by hue",
};

// Small visible nudge per source so toggling the source toggle visibly
// changes dot hues until real colour data (#24-#27) lands.
const sourceHueOffset: Record<HueSource, number> = {
  algorithmic: 0,
  llm: 35,
  crowd: 70,
  blended: 15,
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
        color: hueFor(b.bookId, source),
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

// ---------------------------------------------------------------------------
// Placeholder colouring until real hue data lands (#24 algorithmic, #25 LLM,
// #26 crowd, #27 blended). Hashes the bookId to a stable hue and shifts by
// the selected source so toggling the source toggle is visibly meaningful.
// ---------------------------------------------------------------------------

function hueFor(bookId: string, source: HueSource): [number, number, number] {
  let h = 0;
  for (let i = 0; i < bookId.length; i++) {
    h = (h * 31 + bookId.charCodeAt(i)) | 0;
  }
  const baseHue = ((h % 360) + 360) % 360;
  const hue = (baseHue + sourceHueOffset[source]) % 360;
  return hslToRgb(hue, 60, 55);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100;
  const lit = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lit, 1 - lit);
  const f = (n: number) => lit - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}
