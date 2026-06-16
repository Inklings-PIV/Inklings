"use client";

import { useId, useRef, useState } from "react";
import type { DraftArc } from "@/app/(tabs)/quill/actions";
import { Card, CardContent } from "@/components/ui/card";
import { templateOverlay } from "@/lib/quill/arc";

// Chart geometry — viewBox units; the SVG scales to the card width.
const W = 240;
const H = 64;
const PAD = 4;

/**
 * The draft's emotional arc as a sparkline (research idea C / EmoArc): the
 * smoothed per-sentence valence line, with the nearest of Reagan et al.'s six
 * canonical story shapes ghosted behind it. Hovering the line reports the
 * sentence's paragraph so the page can highlight it in the editor — the same
 * plumbing the EmoArc hue band uses.
 */
export function ArcChart({
  arc,
  onHover,
}: {
  arc: DraftArc;
  onHover?: (paragraphIndex: number | null) => void;
}) {
  const titleId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const values = arc.points.map((p) => p.v);
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (values.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - 2 * PAD);
  const line = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");

  const ghost = arc.match ? templateOverlay(arc.match.key, values.length, { min, max }) : null;
  const ghostLine = ghost
    ? ghost.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
    : null;

  // Neutral-mood baseline, only when it falls inside the drawn range.
  const zeroY = min <= 0 && max >= 0 ? y(0) : null;

  const pointFromEvent = (clientX: number): number | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const frac = (clientX - rect.left) / rect.width;
    const i = Math.round(frac * (values.length - 1));
    return Math.max(0, Math.min(values.length - 1, i));
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-2.5 p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[10px] tracking-widest text-muted-foreground uppercase">
            Story shape
          </h2>
          {arc.match && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              r {arc.match.r.toFixed(2)}
            </span>
          )}
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-16 w-full text-ink-deep"
          role="img"
          aria-labelledby={titleId}
          onMouseMove={(e) => {
            const i = pointFromEvent(e.clientX);
            setHovered(i);
            if (i != null) onHover?.(arc.points[i]?.paragraphIndex ?? null);
          }}
          onMouseLeave={() => {
            setHovered(null);
            onHover?.(null);
          }}
        >
          <title id={titleId}>
            {arc.match
              ? `Emotional arc of the draft — closest shape: ${arc.match.label}`
              : "Emotional arc of the draft"}
          </title>
          {zeroY != null && (
            <line
              x1={PAD}
              x2={W - PAD}
              y1={zeroY}
              y2={zeroY}
              className="stroke-border"
              strokeWidth="1"
              strokeDasharray="1 3"
            />
          )}
          {ghostLine && (
            <path
              d={ghostLine}
              fill="none"
              className="stroke-muted-foreground/40"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              strokeLinecap="round"
            />
          )}
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {hovered != null && (
            <circle
              cx={x(hovered)}
              cy={y(values[hovered] ?? 0)}
              r="3"
              fill="currentColor"
              className="pointer-events-none"
            />
          )}
        </svg>

        <p className="text-[11px] leading-snug text-muted-foreground">
          {arc.match ? (
            <>
              Closest of the six Gutenberg story shapes:{" "}
              <span className="font-medium text-ink-deep">{arc.match.label}</span>.
            </>
          ) : (
            "No clear shape yet — the mood line is too ambiguous to name."
          )}{" "}
          <span className="italic">Mood as a lexicon reads it, not truth.</span>
        </p>
      </CardContent>
    </Card>
  );
}
