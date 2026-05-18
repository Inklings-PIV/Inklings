"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CanvasDot = {
  id: string;
  /** Normalised X in [-1, 1]; rendered as a percentage of canvas width. */
  x: number;
  /** Normalised Y in [-1, 1]; rendered as a percentage of canvas height. */
  y: number;
  title: string;
  subtitle: string;
  /** Optional CSS colour. If omitted, dot uses neutral ink. */
  color?: string;
};

type CanvasShellProps = {
  toolbar: ReactNode;
  detail: ReactNode;
  caption: string;
  dots?: CanvasDot[];
  colourMode?: boolean;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function CanvasShell({
  toolbar,
  detail,
  caption,
  dots = [],
  colourMode = false,
}: CanvasShellProps) {
  const hasDots = dots.length > 0;
  return (
    <div className="flex h-[calc(100dvh-57px)] flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-border bg-background/60 px-6 py-3 backdrop-blur">
        {toolbar}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <section className="relative flex-1">
          <div
            className={cn(
              "absolute inset-0 m-6 overflow-hidden rounded-lg border border-dashed border-border",
              "bg-card/40",
            )}
          >
            <div
              aria-hidden="true"
              className={cn(
                "absolute inset-0 opacity-60",
                colourMode
                  ? "bg-[radial-gradient(circle_at_30%_40%,oklch(0.78_0.15_60/.45),transparent_40%),radial-gradient(circle_at_70%_60%,oklch(0.68_0.18_240/.4),transparent_45%),radial-gradient(circle_at_50%_75%,oklch(0.7_0.18_140/.35),transparent_40%)]"
                  : "bg-[radial-gradient(circle_at_25%_30%,oklch(0.55_0.04_240/.25),transparent_45%),radial-gradient(circle_at_75%_70%,oklch(0.4_0.04_260/.2),transparent_40%)]",
              )}
            />

            {hasDots ? (
              <div className="relative h-full">
                {dots.map((dot) => {
                  const left = clamp((dot.x + 1) * 50, 2, 98);
                  const top = clamp((dot.y + 1) * 50, 2, 98);
                  return (
                    <div
                      key={dot.id}
                      className="group absolute -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${left}%`, top: `${top}%` }}
                    >
                      <div
                        className="size-3 rounded-full shadow-md ring-1 ring-background transition-transform duration-200 group-hover:scale-150"
                        style={{ backgroundColor: dot.color ?? "var(--ink-deep)" }}
                        title={`${dot.title} — ${dot.subtitle}`}
                      />
                      <div
                        className={cn(
                          "pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap",
                          "rounded-sm border border-border bg-background/95 px-2 py-1 text-[11px]",
                          "opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100",
                        )}
                      >
                        <span className="font-serif text-ink-deep">{dot.title}</span>
                        <span className="ml-1 text-muted-foreground">· {dot.subtitle}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="relative flex h-full items-center justify-center">
                <p className="max-w-md text-center font-serif text-base italic text-muted-foreground">
                  {caption}
                </p>
              </div>
            )}
          </div>

          <div className="absolute bottom-8 left-8 flex flex-col gap-1 rounded-md border border-border bg-card/80 p-1 shadow-sm backdrop-blur">
            <Button size="icon-sm" variant="ghost" aria-label="Zoom in" disabled>
              <Plus />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Zoom out" disabled>
              <Minus />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Reset view" disabled>
              <RotateCcw />
            </Button>
          </div>
        </section>

        <aside className="hidden w-80 border-l border-border bg-card/40 p-6 lg:block">
          {detail}
        </aside>
      </div>
    </div>
  );
}
