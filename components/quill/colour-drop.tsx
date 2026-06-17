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

// Short radial spray of droplets flung from the impact point — angle (deg),
// distance (px) and size factor. Deterministic so it doesn't reshuffle on
// re-render, but irregular enough to read as spatter, not a tidy ring.
const SPRAY = [
  { angle: 18, dist: 32, size: 0.5, spin: 40 },
  { angle: 96, dist: 48, size: 0.34, spin: 210 },
  { angle: 168, dist: 38, size: 0.62, spin: 120 },
  { angle: 232, dist: 54, size: 0.42, spin: 300 },
  { angle: 304, dist: 30, size: 0.55, spin: 70 },
] as const;

/**
 * The splash overlay, painted over the editor card. Step one (`landing`) is an
 * ink drop quivering at the impact point with an expanding ring — the stone
 * hitting the water — held while Claude rewrites. Step two (`splash`) blooms a
 * big organic ink blot on the word, throws a radial spray, then spatters along
 * the words about to change. Edges are irregular (turbulence-displaced circles),
 * so it reads as ink, not a disc. Pure visual; the page owns the timing.
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
  const colour = splash.colourCss;

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
    >
      <InkFilters />
      {origin && splash.phase === "landing" && (
        <>
          <InkBlob
            x={origin.x}
            y={origin.y}
            colour={colour}
            size={64}
            className="inklings-ink-land"
          />
          <InkRing x={origin.x} y={origin.y} colour={colour} size={120} />
        </>
      )}
      {origin && splash.phase === "splash" && (
        <>
          <InkBlob
            x={origin.x}
            y={origin.y}
            colour={colour}
            size={240}
            className="inklings-ink-bloom"
          />
          {SPRAY.map((s) => {
            const rad = (s.angle * Math.PI) / 180;
            return (
              <InkBlob
                key={s.angle}
                x={origin.x + Math.cos(rad) * s.dist}
                y={origin.y + Math.sin(rad) * s.dist}
                colour={colour}
                size={110 * s.size}
                spatter
                spin={s.spin}
                delay={120 + s.size * 120}
              />
            );
          })}
          {splash.ripples.map((p, i) => {
            const l = local(p);
            if (!l) return null;
            return (
              <InkBlob
                // biome-ignore lint/suspicious/noArrayIndexKey: sampled points have no stable id
                key={i}
                x={l.x}
                y={l.y}
                colour={colour}
                size={70 + ((i * 13) % 26)}
                spatter
                spin={(i * 67) % 360}
                delay={180 + i * 80}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

/** Turbulence-displaced circle → an organic ink blot. `spatter` uses a rougher,
 *  smaller-feature filter for the flung droplets; otherwise it blooms. */
function InkBlob({
  x,
  y,
  colour,
  size,
  className,
  spatter = false,
  spin = 0,
  delay = 0,
}: {
  x: number;
  y: number;
  colour: string;
  size: number;
  className?: string;
  spatter?: boolean;
  spin?: number;
  delay?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={cn("absolute origin-center", className, spatter && "inklings-ink-spatter")}
      style={{
        left: x,
        top: y,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        color: colour,
        ...(spatter ? { ["--spin" as string]: `${spin}deg`, animationDelay: `${delay}ms` } : {}),
      }}
    >
      <circle
        cx="50"
        cy="50"
        r="30"
        fill="currentColor"
        filter={`url(#${spatter ? "inklings-ink-rough" : "inklings-ink-soft"})`}
      />
    </svg>
  );
}

/** The impact ring for the landing phase — a distorted stroked circle. */
function InkRing({ x, y, colour, size }: { x: number; y: number; colour: string; size: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className="inklings-ink-ring absolute origin-center"
      style={{ left: x, top: y, marginLeft: -size / 2, marginTop: -size / 2, color: colour }}
    >
      <circle
        cx="50"
        cy="50"
        r="30"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        filter="url(#inklings-ink-rough)"
      />
    </svg>
  );
}

/** Two turbulence filters shared by every blot: soft (the bloom) and rough (the
 *  smaller, spikier spatter). Rendered once, referenced by id. */
function InkFilters() {
  return (
    <svg aria-hidden="true" className="absolute size-0" focusable="false">
      <defs>
        <filter id="inklings-ink-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.028"
            numOctaves="2"
            seed="7"
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="20"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <filter id="inklings-ink-rough" x="-60%" y="-60%" width="220%" height="220%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.06"
            numOctaves="2"
            seed="3"
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="17"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
