"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { InkwellCanvas } from "./inkwell-canvas";

export type CanvasDot = {
  id: string;
  /** Normalised X in [-1, 1]; the canvas maps this to pixel space. */
  x: number;
  /** Normalised Y in [-1, 1]; the canvas maps this to pixel space. */
  y: number;
  title: string;
  subtitle: string;
  /** Optional CSS colour for Colour mode. Unused by the WebGL renderer until #20. */
  color?: string;
};

type CanvasShellProps = {
  toolbar: ReactNode;
  detail: ReactNode;
  caption: string;
  dots?: CanvasDot[];
  colourMode?: boolean;
};

export function CanvasShell({
  toolbar,
  detail,
  caption,
  dots = [],
  colourMode = false,
}: CanvasShellProps) {
  const hasDots = dots.length > 0;
  return (
    <div className="flex flex-1 flex-col">
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
              <div className="absolute inset-0">
                <InkwellCanvas dots={dots} />
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
