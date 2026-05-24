"use client";

import { ArrowRight, X } from "lucide-react";
import Link from "next/link";
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
  llm: HSLOverride | null;
  crowd: HSLOverride | null;
  blended: HSLOverride | null;
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
  /** Click a neighbour to pivot the panel to it. */
  onSelectNeighbour?: (bookId: string) => void;
};

const SOURCE_LABEL: Record<HueSource, string> = {
  algorithmic: "Algo",
  llm: "LLM",
  crowd: "Crowd",
  blended: "Blend",
};

export function BlotDetail({ blot, neighbours, source, onClose, onSelectNeighbour }: Props) {
  // The big swatch + the neighbour dots track the blended hue, which is now real.
  const blendedCss = hueFor(blot.bookId, "blended", blot.blended).css;
  // All four sources have real justifications now (Crowd surfaces once 3+ game
  // votes for this book have accumulated; below that we fall back to placeholder).
  const justification =
    source === "algorithmic"
      ? blot.algorithmic?.justification
      : source === "llm"
        ? blot.llm?.justification
        : source === "crowd"
          ? blot.crowd?.justification
          : source === "blended"
            ? blot.blended?.justification
            : null;

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
          <SourceHues
            bookId={blot.bookId}
            algorithmic={blot.algorithmic}
            llm={blot.llm}
            crowd={blot.crowd}
            blended={blot.blended}
          />
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
              <li key={n.bookId}>
                <button
                  type="button"
                  onClick={() => onSelectNeighbour?.(n.bookId)}
                  disabled={!onSelectNeighbour}
                  className="flex w-full items-center justify-between gap-2 rounded-sm px-1 py-0.5 text-left text-xs transition-colors enabled:hover:bg-muted/60 enabled:hover:text-ink-deep disabled:cursor-default"
                >
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
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link
        href={`/blots/${blot.bookId}`}
        className="mt-auto inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-ink-deep"
      >
        Open in Blots <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}
