"use client";

import { Card, CardContent } from "@/components/ui/card";
import { hueFromHSL } from "@/lib/colour/placeholder";
import type { Hsl } from "@/lib/quill/colour-distance";
import type { HueSegment } from "@/lib/quill/explain";

/**
 * Read-only counterfactual overlay (#2) — renders the analysed prose with the
 * phrases that drive its hue washed in that hue, and the phrases that pull
 * against it dotted-underlined. Amin's XAI line made visible: not just *what*
 * colour, but *which words* make it. It's a snapshot of what the model read, so
 * it never has to stay in sync with the live editor — the editor stays the
 * source of truth, this just explains its colour.
 */
export function HueExplainer({
  segments,
  tint,
  isPending,
}: {
  segments: HueSegment[] | null;
  /** The draft's current hue — the colour the positive phrases build toward. */
  tint: Hsl | null;
  isPending: boolean;
}) {
  const tintCss = tint
    ? hueFromHSL(tint.hue, tint.saturation, tint.lightness).css
    : "var(--ink-bleed)";
  const hasSpans = !!segments && segments.some((s) => s.weight !== 0);

  // Key each span by its character offset (strictly increasing → unique), not
  // the array index, so React keeps identity straight as the tiling shifts.
  let charOffset = 0;
  const keyed = (segments ?? []).map((seg) => {
    const key = `${charOffset}:${seg.weight}`;
    charOffset += seg.text.length;
    return { seg, key };
  });

  return (
    <Card className="bg-card/60">
      <CardContent className="flex flex-col gap-2.5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[10px] tracking-widest text-muted-foreground uppercase">
            Why this colour
          </h2>
          <span className="text-[10px] text-muted-foreground">
            tinted drives it · dotted pulls against
          </span>
        </div>
        {hasSpans && segments ? (
          <p className="font-serif text-base leading-relaxed text-ink-deep">
            {keyed.map(({ seg, key }) => (
              <Span key={key} seg={seg} tintCss={tintCss} />
            ))}
          </p>
        ) : (
          <p className="text-xs italic leading-snug text-muted-foreground">
            {isPending
              ? "Reading which words carry the colour…"
              : "Write a little more and the influential words will surface."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Span({ seg, tintCss }: { seg: HueSegment; tintCss: string }) {
  // Neutral connective tissue renders as plain prose.
  if (seg.weight === 0 || !seg.reason) return <>{seg.text}</>;

  const magnitude = Math.abs(seg.weight);
  if (seg.weight > 0) {
    // Drives the hue → washed in that hue, deeper as the weight rises.
    return (
      <mark
        title={seg.reason}
        className="rounded-[3px] px-0.5 text-ink-deep"
        style={{
          backgroundColor: `color-mix(in oklch, ${tintCss} ${Math.round(magnitude * 70)}%, transparent)`,
        }}
      >
        {seg.text}
      </mark>
    );
  }
  // Pulls against the hue → dotted underline, faded toward the connective tone.
  return (
    <span
      title={seg.reason}
      className="underline decoration-muted-foreground/70 decoration-dotted underline-offset-2"
      style={{ opacity: 1 - magnitude * 0.35 }}
    >
      {seg.text}
    </span>
  );
}
