"use client";

import { X } from "lucide-react";
import { FingerprintBars, SourceHues } from "@/components/blots/widgets";
import { Button } from "@/components/ui/button";
import { type HSLOverride, type HueSource, hueFor } from "@/lib/colour/placeholder";
import type { ClassicalFeatures } from "@/lib/stylometry/classical";

export type DetailBlot = {
  bookId: string;
  title: string;
  authorName: string;
  classical: ClassicalFeatures | null;
  algorithmic: HSLOverride | null;
};

export type NeighbourBlot = {
  bookId: string;
  title: string;
  authorName: string;
  distance: number;
};

type Props = {
  blot: DetailBlot;
  neighbours: NeighbourBlot[];
  /** Drives the mode-aware "why this colour" line under the Hues block. */
  source: HueSource;
  onClose: () => void;
};

const SOURCE_LABEL: Record<HueSource, string> = {
  algorithmic: "Algo",
  llm: "LLM",
  crowd: "Crowd",
  blended: "Blend",
};

export function BlotDetail({ blot, neighbours, source, onClose }: Props) {
  const blendedCss = hueFor(blot.bookId, "blended").css;
  // Today only algorithmic has a real justification; others fall back below.
  const justification = source === "algorithmic" ? blot.algorithmic?.justification : null;

  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className="size-12 shrink-0 rounded-full border border-border shadow-inner"
            style={{ backgroundColor: blendedCss }}
            role="img"
            aria-label="Blended hue"
          />
          <div className="min-w-0">
            <h2 className="font-serif text-base leading-tight text-ink-deep">{blot.title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{blot.authorName}</p>
          </div>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onClose}
          aria-label="Close detail panel"
          className="shrink-0"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div>
        <div className="text-[10px] tracking-widest text-muted-foreground uppercase">Hues</div>
        <div className="mt-2">
          <SourceHues bookId={blot.bookId} algorithmic={blot.algorithmic} />
        </div>
        <p className="mt-2 text-xs italic leading-snug text-muted-foreground">
          {justification ? (
            <>
              <span className="font-semibold not-italic text-ink-deep">
                {SOURCE_LABEL[source]}:
              </span>{" "}
              {justification}
            </>
          ) : (
            <>
              <span className="font-semibold not-italic text-ink-deep">
                {SOURCE_LABEL[source]}:
              </span>{" "}
              not derived yet — showing a placeholder colour.
            </>
          )}
        </p>
      </div>

      <div>
        <div className="text-[10px] tracking-widest text-muted-foreground uppercase">
          Fingerprint
        </div>
        <div className="mt-2">
          <FingerprintBars features={blot.classical} />
        </div>
      </div>

      {neighbours.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="text-[10px] tracking-widest text-muted-foreground uppercase">
            Nearest on this layout
          </div>
          <ul className="mt-2 space-y-1.5 overflow-y-auto">
            {neighbours.map((n) => (
              <li key={n.bookId} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: hueFor(n.bookId, "blended").css }}
                  />
                  <span className="truncate text-ink-deep">{n.title}</span>
                  <span className="hidden truncate text-muted-foreground sm:inline">
                    · {n.authorName}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {n.distance.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
