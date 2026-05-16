"use client";

import { useState } from "react";
import { CanvasShell } from "@/components/canvas/canvas-shell";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type CanvasMode = "classical" | "modern" | "colour";
type ColourLayout = "over-classical" | "over-modern" | "by-hue";
type HueSource = "algorithmic" | "llm" | "crowd" | "blended";

const modeBlurb: Record<CanvasMode, string> = {
  classical: "shape view · classical stylometry",
  modern: "shape view · modern embeddings",
  colour: "hue view · ink on the canvas",
};

const layoutLabel: Record<ColourLayout, string> = {
  "over-classical": "over Classical",
  "over-modern": "over Modern",
  "by-hue": "by Hue",
};

const sourceLabel: Record<HueSource, string> = {
  algorithmic: "Algorithmic",
  llm: "LLM",
  crowd: "Crowd",
  blended: "Blended",
};

export default function InkwellPage() {
  const [mode, setMode] = useState<CanvasMode>("classical");
  const [layout, setLayout] = useState<ColourLayout>("over-classical");
  const [source, setSource] = useState<HueSource>("blended");

  const isColour = mode === "colour";

  const caption = isColour
    ? `Every blot wears its hue — ${sourceLabel[source].toLowerCase()} ink, laid out ${layoutLabel[layout]}.`
    : "The Inkwell will hold every blot here — authors arranged by the shape of their writing. Pan and zoom to read names; click a blot to open it.";

  return (
    <CanvasShell
      colourMode={isColour}
      caption={caption}
      toolbar={
        <>
          <div className="flex flex-col">
            <span className="font-serif text-lg tracking-tight text-ink-deep">The Inkwell</span>
            <span className="text-xs text-muted-foreground">{modeBlurb[mode]}</span>
          </div>
          <div className="flex flex-col items-end gap-2">
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(v) => v && setMode(v as CanvasMode)}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="classical">Classical</ToggleGroupItem>
              <ToggleGroupItem value="modern">Modern</ToggleGroupItem>
              <ToggleGroupItem value="colour">Colour</ToggleGroupItem>
            </ToggleGroup>
            {isColour && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  layout
                </span>
                <ToggleGroup
                  type="single"
                  value={layout}
                  onValueChange={(v) => v && setLayout(v as ColourLayout)}
                  variant="outline"
                  size="sm"
                >
                  <ToggleGroupItem value="over-classical">Over Classical</ToggleGroupItem>
                  <ToggleGroupItem value="over-modern">Over Modern</ToggleGroupItem>
                  <ToggleGroupItem value="by-hue">By Hue</ToggleGroupItem>
                </ToggleGroup>
                <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
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
            )}
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
          {isColour && (
            <div className="grid grid-cols-2 gap-2">
              {(["algorithmic", "llm", "crowd", "blended"] as const).map((s) => (
                <div
                  key={s}
                  className="flex items-center gap-2 rounded-md border border-border bg-card p-2"
                >
                  <div className="size-6 rounded-full border border-border bg-muted" />
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">{sourceLabel[s]}</span>
                    <span className="text-[10px] text-muted-foreground">—</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-auto rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
            Neighbours · stylometric features · open in Quill / Blots — will appear here.
          </div>
        </div>
      }
    />
  );
}
