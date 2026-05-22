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
// Icon atlas — one SVG per shape, rendered as a mask icon. The radial
// gradient inside the path is what gives each book its "ink dropped on paper"
// look: opaque centre, gentle mid, fully transparent silhouette edge. A small
// Gaussian blur softens the polygonal silhouette without turning it round.
// ---------------------------------------------------------------------------

type DeckIcon = {
  url: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  mask: true;
};

function buildIcon(path: string): DeckIcon {
  // Expand viewBox a bit so the blur tail has room.
  const pad = 12;
  const dim = 120 + 2 * pad;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${-pad} ${-pad} ${dim} ${dim}'>` +
    `<defs>` +
    `<radialGradient id='g' cx='50%' cy='50%' r='55%'>` +
    `<stop offset='0%' stop-color='white' stop-opacity='1'/>` +
    `<stop offset='45%' stop-color='white' stop-opacity='1'/>` +
    `<stop offset='75%' stop-color='white' stop-opacity='0.55'/>` +
    `<stop offset='100%' stop-color='white' stop-opacity='0'/>` +
    `</radialGradient>` +
    `<filter id='b' x='-20%' y='-20%' width='140%' height='140%'>` +
    `<feGaussianBlur stdDeviation='2.5'/>` +
    `</filter>` +
    `</defs>` +
    `<path d='${path}' fill='url(#g)' filter='url(#b)'/>` +
    `</svg>`;
  return {
    url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    width: dim,
    height: dim,
    anchorX: dim / 2,
    anchorY: dim / 2,
    mask: true,
  };
}

const ICONS: DeckIcon[] = BLOT_SHAPES.map((p) => buildIcon(p));
// BLOT_SHAPES is non-empty; this guarantees a non-undefined fallback for TS.
const FALLBACK_ICON: DeckIcon = buildIcon(BLOT_SHAPES[0] ?? "M0,0 Z");

// ---------------------------------------------------------------------------

type Props = {
  dots: CanvasDot[];
  /** Called with a blot's id on click, or null when the background is clicked. */
  onSelect?: (id: string | null) => void;
};

export function InkwellCanvas({ dots, onSelect }: Props) {
  const [viewState, setViewState] = useState<OrthographicViewState>(INITIAL_VIEW_STATE);

  const layer = new IconLayer<CanvasDot>({
    id: "blots",
    data: dots,
    pickable: true,
    sizeUnits: "pixels",
    getPosition: (d) => [d.x * SCALE, d.y * SCALE, 0],
    getIcon: (d) => ICONS[shapeForId(d.id)] ?? FALLBACK_ICON,
    getSize: 52,
    sizeMinPixels: 22,
    sizeMaxPixels: 160,
    getColor: (d) => {
      const [r, g, b] = d.color ?? DEFAULT_RGB;
      return [r, g, b, 255];
    },
    updateTriggers: {
      getIcon: dots.map((d) => d.id),
      getColor: dots.map((d) => d.color),
    },
  });

  return (
    <DeckGL
      views={new OrthographicView({ id: "ortho" })}
      viewState={viewState}
      onViewStateChange={({ viewState: next }) => setViewState(next as OrthographicViewState)}
      controller={true}
      layers={[layer]}
      style={{ background: "transparent" }}
      onClick={(info) => {
        const picked = (info.object as CanvasDot | undefined)?.id ?? null;
        onSelect?.(picked);
      }}
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
