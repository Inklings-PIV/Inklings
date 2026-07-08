"use client";

import { useEffect, useMemo, useState } from "react";
import { deriveDraftStylometry } from "@/app/(tabs)/quill/actions";
import { type CanvasDot, CanvasShell } from "@/components/canvas/canvas-shell";
import { BlotDetail, type NeighbourBlot } from "@/components/inkwell/blot-detail";
import { MethodologyDialog } from "@/components/inkwell/methodology-dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type HSLOverride, type HueSource, hueFor } from "@/lib/colour/placeholder";
import { softnessBucket, sourceDisagreement } from "@/lib/colour/uncertainty";
import { layoutGuide } from "@/lib/inkwell/layout-guide";
import { weightedCentroid } from "@/lib/layout/centroid";
import { fingerprintDistance } from "@/lib/quill/fingerprint";
import type { ClassicalFeatures } from "@/lib/stylometry/classical";

// Mirrors the Quill's localStorage draft key — the Inkwell reads it to place the
// writer's own draft as a blot (#10). Kept in sync by hand; both are user-local.
const QUILL_DRAFT_KEY = "inklings-quill-draft";
const DRAFT_NEIGHBOURS = 5;

type Layout = "classical" | "modern" | "by-hue";

const layoutBlurb: Record<Layout, string> = {
  classical: "shape via classical stylometry",
  modern: "shape via modern embeddings",
  "by-hue": "clustered by hue",
};

export type Blot = {
  bookId: string;
  title: string;
  authorName: string;
  authorSlug: string;
  classical: ClassicalFeatures | null;
  /** Real algorithmic HSL from book_colours when present; null falls back to placeholder. */
  algorithmic: HSLOverride | null;
  /** Real LLM HSL from book_colours when present; null falls back to placeholder. */
  llm: HSLOverride | null;
  /** Aggregated crowd guesses from book_colours; null until ≥ 3 votes exist. */
  crowd: HSLOverride | null;
  /** Weighted blend of the real per-source rows; null if no sources are derived. */
  blended: HSLOverride | null;
  layouts: {
    classical: { x: number; y: number } | null;
    modern: { x: number; y: number } | null;
    "by-hue": { x: number; y: number } | null;
  };
};

export function InkwellView({
  blots,
  initialSelectedId = null,
}: {
  blots: Blot[];
  /** Seeded from `?selected=<bookId>` so /blots/[id] can deep-link back. */
  initialSelectedId?: string | null;
}) {
  const [layout, setLayout] = useState<Layout>("classical");
  const [source, setSource] = useState<HueSource>("blended");
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  // The writer's own draft, read from the Quill's localStorage and reduced to a
  // stylometric fingerprint (#10). Re-read on cross-tab edits so the marker
  // tracks the draft live while both tabs are open.
  const [draftFeatures, setDraftFeatures] = useState<ClassicalFeatures | null>(null);

  useEffect(() => {
    let cancelled = false;
    const read = () => {
      let draft = "";
      try {
        draft = window.localStorage.getItem(QUILL_DRAFT_KEY) ?? "";
      } catch {
        return; // private mode / blocked storage — just no draft marker.
      }
      deriveDraftStylometry(draft)
        .then((features) => {
          if (!cancelled) setDraftFeatures(features);
        })
        .catch(() => {
          // Transient failure — leave the last marker rather than drop it.
        });
    };
    read();
    window.addEventListener("storage", read);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", read);
    };
  }, []);

  const dots: CanvasDot[] = blots.flatMap((b) => {
    const coord = b.layouts[layout];
    if (!coord) return [];
    return [
      {
        id: b.bookId,
        x: coord.x,
        y: coord.y,
        title: b.title,
        subtitle: b.authorName,
        // Real HSL when this source has a derived value; otherwise placeholder.
        color: hueFor(b.bookId, source, overrideFor(b, source)).rgb,
        // Independent derivations only — blended is their average and would
        // dilute the disagreement signal it encodes.
        softness: softnessBucket(
          sourceDisagreement([b.algorithmic, b.llm, b.crowd].filter((c) => c != null)),
        ),
      },
    ];
  });

  const selectedBlot = useMemo(
    () => (selectedId ? (blots.find((b) => b.bookId === selectedId) ?? null) : null),
    [blots, selectedId],
  );

  // Place the draft among the corpus blots it reads most like: rank by classical
  // fingerprint distance, then sit it at the inverse-distance centroid of its
  // nearest neighbours in the current layout. UMAP can't project one new point,
  // so this is an honest "you write nearest these" rather than a fake coordinate.
  const draftDot = useMemo<CanvasDot | null>(() => {
    if (!draftFeatures) return null;
    const neighbours = blots
      .flatMap((b) => {
        const coord = b.layouts[layout];
        if (!coord || !b.classical) return [];
        return [
          { x: coord.x, y: coord.y, distance: fingerprintDistance(draftFeatures, b.classical) },
        ];
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, DRAFT_NEIGHBOURS);
    const centroid = weightedCentroid(neighbours);
    if (!centroid) return null;
    return { id: "__draft__", x: centroid.x, y: centroid.y, title: "You", subtitle: "your draft" };
  }, [draftFeatures, blots, layout]);

  // Top-5 nearest neighbours on the current layout, by Euclidean distance.
  // Neighbours are layout-specific so the panel re-ranks when you change view.
  const neighbours = useMemo<NeighbourBlot[]>(() => {
    if (!selectedBlot) return [];
    const me = selectedBlot.layouts[layout];
    if (!me) return [];
    return blots
      .flatMap((b) => {
        if (b.bookId === selectedBlot.bookId) return [];
        const coord = b.layouts[layout];
        if (!coord) return [];
        const dx = coord.x - me.x;
        const dy = coord.y - me.y;
        return [
          {
            bookId: b.bookId,
            title: b.title,
            authorName: b.authorName,
            distance: Math.sqrt(dx * dx + dy * dy),
          },
        ];
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);
  }, [blots, layout, selectedBlot]);

  const caption =
    "The Inkwell awaits — once books are ingested, blots will appear here. Pan, zoom, and hover to read.";

  return (
    <CanvasShell
      caption={caption}
      dots={dots}
      marker={draftDot}
      onSelectDot={setSelectedId}
      toolbar={
        <>
          <div className="flex max-w-md flex-col">
            <span className="font-serif text-lg tracking-tight text-ink-deep">The Inkwell</span>
            <span className="text-xs text-muted-foreground">
              {layoutBlurb[layout]} · {blots.length} {blots.length === 1 ? "blot" : "blots"}
            </span>
            <LayoutLegend layout={layout} />
          </div>
          <div data-tour="inkwell-controls" className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex items-center gap-1.5">
              <span className="hidden text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
                layout
              </span>
              <ToggleGroup
                type="single"
                value={layout}
                onValueChange={(v) => v && setLayout(v as Layout)}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="classical">Classical</ToggleGroupItem>
                <ToggleGroupItem value="modern">Modern</ToggleGroupItem>
                <ToggleGroupItem value="by-hue">By Hue</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="hidden text-[10px] uppercase tracking-wider text-muted-foreground sm:inline">
                source
              </span>
              <ToggleGroup
                type="single"
                value={source}
                onValueChange={(v) => v && setSource(v as HueSource)}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="algorithmic">Algo</ToggleGroupItem>
                <ToggleGroupItem value="llm">LLM</ToggleGroupItem>
                <ToggleGroupItem value="blended">Blend</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <MethodologyDialog />
          </div>
        </>
      }
      detail={
        selectedBlot ? (
          <BlotDetail
            blot={{
              bookId: selectedBlot.bookId,
              title: selectedBlot.title,
              authorName: selectedBlot.authorName,
              authorSlug: selectedBlot.authorSlug,
              classical: selectedBlot.classical,
              algorithmic: selectedBlot.algorithmic,
              llm: selectedBlot.llm,
              // Crowd is hidden in the Inkwell — null drops it from the Hues
              // chips and Agreement bar without touching the shared widgets.
              crowd: null,
              blended: selectedBlot.blended,
            }}
            neighbours={neighbours}
            source={source}
            onClose={() => setSelectedId(null)}
            onSelectNeighbour={setSelectedId}
          />
        ) : (
          <div className="flex h-full flex-col gap-4">
            <div>
              <h2 className="font-serif text-sm uppercase tracking-wider text-muted-foreground">
                Selected blot
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Click a blot on the canvas to read its hand.
              </p>
            </div>
            <div className="mt-auto rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
              Neighbours · stylometric features · open in Quill / Blots — will appear here.
            </div>
          </div>
        )
      }
    />
  );
}

/**
 * An honest, per-layout reading hint. UMAP axes aren't semantic, so the legend
 * tells the viewer to read proximity, not position — and what the current
 * layout is actually derived from. Crossfades on layout change (keyed) so the
 * text re-settles rather than snapping, since only the wording changes.
 */
function LayoutLegend({ layout }: { layout: Layout }) {
  const guide = layoutGuide(layout);
  return (
    <span
      key={layout}
      className="mt-1 animate-in text-[11px] leading-snug text-muted-foreground/80 fade-in duration-300"
    >
      {guide.distance}
    </span>
  );
}

/** Returns the real HSL row for the current source if it exists, else null. */
function overrideFor(blot: Blot, source: HueSource): HSLOverride | null {
  switch (source) {
    case "algorithmic":
      return blot.algorithmic;
    case "llm":
      return blot.llm;
    case "crowd":
      return blot.crowd;
    case "blended":
      return blot.blended;
    default:
      return null;
  }
}
