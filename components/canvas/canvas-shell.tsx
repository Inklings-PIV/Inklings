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
  /** RGB tuple in 0–255. If omitted, dot uses the default ink colour. */
  color?: [number, number, number];
};

type CanvasShellProps = {
  toolbar: ReactNode;
  detail: ReactNode;
  caption: string;
  dots?: CanvasDot[];
  onSelectDot?: (id: string | null) => void;
};

export function CanvasShell({
  toolbar,
  detail,
  caption,
  dots = [],
  onSelectDot,
}: CanvasShellProps) {
  const hasDots = dots.length > 0;
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-background/60 px-4 py-3 backdrop-blur sm:gap-4 sm:px-6">
        {toolbar}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <section className="relative flex-1">
          <div
            className={cn(
              "absolute inset-0 m-3 overflow-hidden rounded-lg border border-dashed border-border sm:m-6",
              "bg-card/40",
            )}
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(circle_at_25%_30%,oklch(0.55_0.04_240/.25),transparent_45%),radial-gradient(circle_at_75%_70%,oklch(0.4_0.04_260/.2),transparent_40%)] opacity-60"
            />

            {hasDots ? (
              <div className="absolute inset-0">
                <InkwellCanvas dots={dots} onSelect={onSelectDot} />
              </div>
            ) : (
              <div className="relative flex h-full items-center justify-center px-4">
                <p className="max-w-md text-center font-serif text-base italic text-muted-foreground">
                  {caption}
                </p>
              </div>
            )}
          </div>

          <div className="absolute bottom-6 left-6 flex flex-col gap-1 rounded-md border border-border bg-card/80 p-1 shadow-sm backdrop-blur sm:bottom-8 sm:left-8">
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
