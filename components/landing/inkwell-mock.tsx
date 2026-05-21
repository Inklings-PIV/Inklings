"use client";

import { useMemo, useState } from "react";
import { Blot } from "./blot";

type Mode = "classical" | "modern" | "colour";
type Source = "algo" | "llm" | "crowd" | "blend";

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

type Dot = {
  classicalX: number;
  classicalY: number;
  modernX: number;
  modernY: number;
  hueX: number;
  hueY: number;
  size: number;
  hueAlgo: number;
  hueLLM: number;
  hueCrowd: number;
  shape: number;
  rotate: number;
  opacity: number;
};

const q = (n: number, p = 3) => Number(n.toFixed(p));

function generate(count: number, seed = 17): Dot[] {
  const rand = seeded(seed);
  const dots: Dot[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const angle = t * Math.PI * 2;
    const rx = 42 + rand() * 8;
    const ry = 22 + rand() * 6;
    const jx = (rand() - 0.5) * 18;
    const jy = (rand() - 0.5) * 16;
    const cx = 50 + Math.cos(angle) * rx * rand() + jx;
    const cy = 50 + Math.sin(angle) * ry * rand() + jy;
    const modernX = cy + (rand() - 0.5) * 30;
    const modernY = cx * 0.6 + 25 + (rand() - 0.5) * 20;
    const hue = (cx / 100) * 280 + 10;
    dots.push({
      classicalX: q(Math.max(4, Math.min(96, cx))),
      classicalY: q(Math.max(8, Math.min(92, cy))),
      modernX: q(Math.max(4, Math.min(96, modernX))),
      modernY: q(Math.max(8, Math.min(92, modernY))),
      hueX: q(6 + ((hue - 10) / 280) * 88),
      hueY: q(20 + rand() * 60),
      size: q(18 + rand() * 28),
      hueAlgo: q(hue, 2),
      hueLLM: q(hue + (rand() - 0.5) * 60, 2),
      hueCrowd: q(hue + (rand() - 0.5) * 80, 2),
      shape: Math.floor(rand() * 4),
      rotate: q(rand() * 360, 2),
      opacity: q(0.6 + rand() * 0.35, 3),
    });
  }
  return dots;
}

const NAMED = [
  { name: "Jane Austen", cIdx: 0 },
  { name: "George Eliot", cIdx: 8 },
  { name: "Charlotte Brontë", cIdx: 14 },
  { name: "Mark Twain", cIdx: 22 },
  { name: "Leo Tolstoy", cIdx: 28 },
  { name: "F. Scott Fitzgerald", cIdx: 40 },
  { name: "Ernest Hemingway", cIdx: 48 },
  { name: "Franz Kafka", cIdx: 60 },
  { name: "Virginia Woolf", cIdx: 70 },
  { name: "James Joyce", cIdx: 82 },
  { name: "Samuel Beckett", cIdx: 96 },
];

export function InkwellMock() {
  const dots = useMemo(() => generate(110), []);
  const [mode, setMode] = useState<Mode>("classical");
  const [source, setSource] = useState<Source>("blend");

  const colourMode = mode === "colour";

  const pickHue = (d: Dot) => {
    if (source === "algo") return d.hueAlgo;
    if (source === "llm") return d.hueLLM;
    if (source === "crowd") return d.hueCrowd;
    return (d.hueAlgo + d.hueLLM + d.hueCrowd) / 3;
  };

  const positionOf = (d: Dot) => {
    if (mode === "classical") return { x: d.classicalX, y: d.classicalY };
    if (mode === "modern") return { x: d.modernX, y: d.modernY };
    return { x: d.hueX, y: d.hueY };
  };

  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-border bg-card/60 shadow-[0_1px_0_rgba(0,0,0,0.02),0_24px_60px_-30px_rgba(40,30,80,0.25)]">
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, color-mix(in oklch, var(--ink-faded) 14%, transparent) 1px, transparent 0)",
          backgroundSize: "20px 20px",
        }}
      />

      <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-background/70 px-5 py-3 backdrop-blur">
        <div>
          <div className="font-serif text-sm text-ink-deep">The Inkwell</div>
          <div className="text-[10px] tracking-wide text-muted-foreground uppercase">
            {mode === "classical" && "shape view · classical stylometry"}
            {mode === "modern" && "shape view · modern embeddings"}
            {mode === "colour" && `hue view · ${source} ink on canvas`}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {(["classical", "modern", "colour"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-md px-2 py-1 text-[10px] capitalize transition-colors ${
                mode === m
                  ? "bg-ink-deep text-ink-paper"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {m}
            </button>
          ))}
          {colourMode && (
            <>
              <span className="ml-2 text-[9px] tracking-widest text-muted-foreground uppercase">
                source
              </span>
              {(["algo", "llm", "crowd", "blend"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSource(s)}
                  className={`rounded-md px-2 py-1 text-[10px] capitalize transition-colors ${
                    source === s
                      ? "bg-ink-bleed text-ink-paper"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="absolute inset-0 pt-14">
        {dots.map((d) => {
          const pos = positionOf(d);
          const hue = pickHue(d).toFixed(2);
          return (
            <div
              key={`${d.classicalX.toFixed(3)}-${d.classicalY.toFixed(3)}-${d.shape}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-700 ease-out"
              style={{ left: `${pos.x.toFixed(3)}%`, top: `${pos.y.toFixed(3)}%` }}
            >
              <Blot
                color={colourMode ? `oklch(0.7 0.18 ${hue})` : `oklch(0.5 0.04 260)`}
                size={d.size}
                shape={d.shape}
                rotate={d.rotate}
                opacity={d.opacity}
                splatter={d.size > 28}
              />
            </div>
          );
        })}
        {NAMED.map((a) => {
          const d = dots[a.cIdx];
          if (!d) return null;
          const pos = positionOf(d);
          return (
            <div
              key={a.name}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-[9px] tracking-wide text-ink-deep/70 transition-all duration-700"
              style={{ left: `${pos.x.toFixed(3)}%`, top: `${(pos.y + 8).toFixed(3)}%` }}
            >
              {a.name}
            </div>
          );
        })}
      </div>

      <div className="absolute bottom-4 left-4 flex flex-col gap-1">
        <button
          className="size-7 rounded-md border border-border bg-background/80 text-sm text-muted-foreground backdrop-blur"
          type="button"
          aria-label="zoom in"
        >
          +
        </button>
        <button
          className="size-7 rounded-md border border-border bg-background/80 text-sm text-muted-foreground backdrop-blur"
          type="button"
          aria-label="zoom out"
        >
          −
        </button>
      </div>
      <div className="absolute inset-x-0 bottom-3 text-center text-[10px] italic text-muted-foreground">
        Toggle Classical · Modern · Colour to reshape the canvas.
      </div>
    </div>
  );
}
