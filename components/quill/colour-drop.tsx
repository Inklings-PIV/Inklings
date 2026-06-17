"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { COLOUR_DROP_MIME } from "@/components/quill/editor";
import { Card, CardContent } from "@/components/ui/card";
import { hueFromHSL } from "@/lib/colour/placeholder";
import { cn } from "@/lib/utils";

/**
 * The colour-drop palette. Each swatch is a fixed mood: drag one onto a word in
 * the editor and the prose around it is rewritten toward that mood. The colour
 * carries the intent — dropping ink on the page and watching it bleed.
 */
export type ColourDrop = {
  key: string;
  label: string;
  /** The rewrite target this colour stands for. */
  target: string;
  hsl: { hue: number; saturation: number; lightness: number };
};

export const COLOUR_DROPS: ColourDrop[] = [
  {
    key: "crimson",
    label: "Crimson",
    target: "passionate, urgent",
    hsl: { hue: 350, saturation: 75, lightness: 50 },
  },
  {
    key: "blue",
    label: "Blue",
    target: "calm, melancholy",
    hsl: { hue: 215, saturation: 70, lightness: 52 },
  },
  {
    key: "gold",
    label: "Gold",
    target: "warm, nostalgic",
    hsl: { hue: 42, saturation: 85, lightness: 55 },
  },
  {
    key: "violet",
    label: "Violet",
    target: "dreamlike, lyrical",
    hsl: { hue: 275, saturation: 60, lightness: 58 },
  },
  {
    key: "green",
    label: "Green",
    target: "fresh, vivid",
    hsl: { hue: 140, saturation: 55, lightness: 45 },
  },
  {
    key: "grey",
    label: "Grey",
    target: "restrained, plain",
    hsl: { hue: 220, saturation: 8, lightness: 55 },
  },
];

export function colourDropByKey(key: string): ColourDrop | undefined {
  return COLOUR_DROPS.find((c) => c.key === key);
}

export function ColourPalette() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2.5 p-5">
        <h2 className="text-[10px] tracking-widest text-muted-foreground uppercase">Colour drop</h2>
        <div className="flex flex-wrap gap-2">
          {COLOUR_DROPS.map((c) => {
            const css = hueFromHSL(c.hsl.hue, c.hsl.saturation, c.hsl.lightness).css;
            return (
              <button
                key={c.key}
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(COLOUR_DROP_MIME, c.key);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                title={`${c.label} — ${c.target}`}
                aria-label={`${c.label}: ${c.target}. Drag onto a word to rewrite around it.`}
                className={cn(
                  "size-7 shrink-0 cursor-grab rounded-full border border-border shadow-inner transition-transform",
                  "hover:scale-110 active:cursor-grabbing",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                )}
                style={{ backgroundColor: css }}
              />
            );
          })}
        </div>
        <p className="text-[11px] italic leading-snug text-muted-foreground">
          Drag a colour onto a word — the splash marks what gets rewritten toward that mood.
        </p>
      </CardContent>
    </Card>
  );
}

export type SplashState = {
  /** CSS colour of the dropped swatch. */
  colourCss: string;
  /** Targeted word, in viewport px. */
  origin: { x: number; y: number };
  /** Sampled points across the affected span, in viewport px. */
  ripples: { x: number; y: number }[];
  /** "landing" while the rewrite is in flight, "splash" once it has arrived. */
  phase: "landing" | "splash";
};

/**
 * The splash overlay, painted over the editor card. Step one (`landing`) is a
 * single ripple at the drop point — the stone hitting the water — held while
 * Claude rewrites. Step two (`splash`) blooms the main splash on the word, then
 * radiates secondary splashes across the words about to change. Pure visual;
 * the page owns the timing and clears it.
 */
export function ColourSplash({ splash }: { splash: SplashState }) {
  const ref = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Splash coords arrive in viewport px; convert to this overlay's local space.
  useLayoutEffect(() => {
    if (ref.current) setRect(ref.current.getBoundingClientRect());
  }, []);

  const local = (p: { x: number; y: number }) =>
    rect ? { x: p.x - rect.left, y: p.y - rect.top } : null;
  const origin = local(splash.origin);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
    >
      {origin && splash.phase === "landing" && (
        <Drop
          x={origin.x}
          y={origin.y}
          colour={splash.colourCss}
          className="inklings-splash-land"
        />
      )}
      {origin && splash.phase === "splash" && (
        <>
          <Drop
            x={origin.x}
            y={origin.y}
            colour={splash.colourCss}
            className="inklings-splash-main"
          />
          {splash.ripples.map((p, i) => {
            const l = local(p);
            if (!l) return null;
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: sampled points have no stable id
                key={i}
                className="inklings-splash-ripple absolute rounded-full"
                style={{
                  left: l.x,
                  top: l.y,
                  borderColor: splash.colourCss,
                  animationDelay: `${80 + i * 70}ms`,
                }}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

function Drop({
  x,
  y,
  colour,
  className,
}: {
  x: number;
  y: number;
  colour: string;
  className: string;
}) {
  return (
    <span
      className={cn("absolute rounded-full", className)}
      style={{ left: x, top: y, backgroundColor: colour }}
    />
  );
}
