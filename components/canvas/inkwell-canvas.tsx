"use client";

import { DeckGL, IconLayer, OrthographicView, type OrthographicViewState } from "deck.gl";
import { useState } from "react";
import { BLOT_SHAPES, shapeForId } from "@/lib/canvas/blot-shapes";
import type { CanvasDot } from "./canvas-shell";

// Tracer-era layouts live in [-1, 1]; scale to deck.gl pixel-ish units.
const SCALE = 200;

const DEFAULT_RGB: [number, number, number] = [40, 50, 80];

const INITIAL_VIEW_STATE: OrthographicViewState = {
  target: [0, 0, 0],
  zoom: 1,
  minZoom: -3,
  maxZoom: 8,
};

// ---------------------------------------------------------------------------
// Icon atlas — pre-built SVG data URLs per shape (both a crisp "core" and a
// blurred "bleed" variant). Returned objects are reused by reference so
// deck.gl only loads 8 textures regardless of how many books we render.
// ---------------------------------------------------------------------------

type DeckIcon = {
  url: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  mask: true;
};

function buildIcon(path: string, blurStdDev: number): DeckIcon {
  // Bleed needs room for the gaussian blur to spread; expand viewBox so the
  // rasterised texture has space for the soft edge.
  const pad = blurStdDev > 0 ? 20 : 0;
  const dim = 120 + 2 * pad;
  const svg = [
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${-pad} ${-pad} ${dim} ${dim}'>`,
    blurStdDev > 0
      ? `<defs><filter id='b' x='-25%' y='-25%' width='150%' height='150%'><feGaussianBlur stdDeviation='${blurStdDev}'/></filter></defs>`
      : "",
    `<path d='${path}' fill='white'${blurStdDev > 0 ? " filter='url(#b)'" : ""}/>`,
    `</svg>`,
  ].join("");
  return {
    url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    width: dim,
    height: dim,
    anchorX: dim / 2,
    anchorY: dim / 2,
    mask: true, // recolourable via getColor
  };
}

const CORE_ICONS: DeckIcon[] = BLOT_SHAPES.map((p) => buildIcon(p, 0));
const BLEED_ICONS: DeckIcon[] = BLOT_SHAPES.map((p) => buildIcon(p, 8));
// BLOT_SHAPES is non-empty, so these are always defined. Explicit to satisfy TS.
const FALLBACK_CORE: DeckIcon = buildIcon(BLOT_SHAPES[0] ?? "M0,0 Z", 0);
const FALLBACK_BLEED: DeckIcon = buildIcon(BLOT_SHAPES[0] ?? "M0,0 Z", 8);

// ---------------------------------------------------------------------------

type Props = {
  dots: CanvasDot[];
};

export function InkwellCanvas({ dots }: Props) {
  const [viewState, setViewState] = useState<OrthographicViewState>(INITIAL_VIEW_STATE);

  const colorTrigger = dots.map((d) => d.color);
  const idTrigger = dots.map((d) => d.id);

  // Bleed: bigger, softer, blurred silhouette behind each book.
  const bleed = new IconLayer<CanvasDot>({
    id: "blot-bleed",
    data: dots,
    pickable: true,
    sizeUnits: "pixels",
    getPosition: (d) => [d.x * SCALE, d.y * SCALE, 0],
    getIcon: (d) => BLEED_ICONS[shapeForId(d.id)] ?? FALLBACK_BLEED,
    getSize: 64,
    sizeMinPixels: 36,
    sizeMaxPixels: 160,
    getColor: (d) => {
      const [r, g, b] = d.color ?? DEFAULT_RGB;
      return [r, g, b, 105];
    },
    updateTriggers: { getIcon: idTrigger, getColor: colorTrigger },
  });

  // Core: crisp opaque silhouette on top.
  const core = new IconLayer<CanvasDot>({
    id: "blot-core",
    data: dots,
    pickable: true,
    sizeUnits: "pixels",
    getPosition: (d) => [d.x * SCALE, d.y * SCALE, 0],
    getIcon: (d) => CORE_ICONS[shapeForId(d.id)] ?? FALLBACK_CORE,
    getSize: 28,
    sizeMinPixels: 14,
    sizeMaxPixels: 72,
    getColor: (d) => {
      const [r, g, b] = d.color ?? DEFAULT_RGB;
      return [r, g, b, 255];
    },
    updateTriggers: { getIcon: idTrigger, getColor: colorTrigger },
  });

  return (
    <DeckGL
      views={new OrthographicView({ id: "ortho" })}
      viewState={viewState}
      onViewStateChange={({ viewState: next }) => setViewState(next as OrthographicViewState)}
      controller={true}
      layers={[bleed, core]}
      style={{ background: "transparent" }}
      getCursor={({ isHovering, isDragging }) =>
        isDragging ? "grabbing" : isHovering ? "pointer" : "grab"
      }
      getTooltip={({ object }) => {
        if (!object) return null;
        const d = object as CanvasDot;
        // d.title/subtitle come from our DB join, not user input — safe to inline.
        return {
          html: `<strong>${d.title}</strong><br/><span style="opacity:0.7">${d.subtitle}</span>`,
          style: {
            background: "var(--popover)",
            color: "var(--popover-foreground)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            padding: "6px 10px",
            fontSize: "12px",
            fontFamily: "var(--font-serif, serif)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          },
        };
      }}
    />
  );
}
