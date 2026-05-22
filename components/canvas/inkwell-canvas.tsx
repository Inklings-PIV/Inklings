"use client";

import { DeckGL, OrthographicView, type OrthographicViewState, ScatterplotLayer } from "deck.gl";
import { useState } from "react";
import type { CanvasDot } from "./canvas-shell";

// Tracer-era layouts live in [-1, 1]; scale to deck.gl pixel-ish units.
const SCALE = 200;

// Default colour for dots without an explicit hue.
const DEFAULT_RGB: [number, number, number] = [40, 50, 80];
const STROKE_RGBA: [number, number, number, number] = [248, 245, 235, 180];

// Alpha layers for the ink-bleed effect — outer faint halo, mid-density
// inner halo, sharp opaque core. Halos blend on overlap, simulating ink
// running into itself on paper.
const OUTER_ALPHA = 35; // ~0.14
const INNER_ALPHA = 80; // ~0.31

const INITIAL_VIEW_STATE: OrthographicViewState = {
  target: [0, 0, 0],
  zoom: 1,
  minZoom: -3,
  maxZoom: 8,
};

type Props = {
  dots: CanvasDot[];
};

export function InkwellCanvas({ dots }: Props) {
  const [viewState, setViewState] = useState<OrthographicViewState>(INITIAL_VIEW_STATE);

  const fillFor = (alpha: number) => (d: CanvasDot) => {
    const [r, g, b] = d.color ?? DEFAULT_RGB;
    return [r, g, b, alpha] as [number, number, number, number];
  };

  const colorTrigger = dots.map((d) => d.color);

  // Outermost halo — the bleed.
  const outerHalo = new ScatterplotLayer<CanvasDot>({
    id: "blot-outer-halo",
    data: dots,
    pickable: true,
    filled: true,
    stroked: false,
    radiusUnits: "pixels",
    radiusMinPixels: 16,
    radiusMaxPixels: 56,
    getPosition: (d) => [d.x * SCALE, d.y * SCALE, 0],
    getRadius: 22,
    getFillColor: fillFor(OUTER_ALPHA),
    updateTriggers: { getFillColor: colorTrigger },
  });

  // Mid-density halo.
  const innerHalo = new ScatterplotLayer<CanvasDot>({
    id: "blot-inner-halo",
    data: dots,
    pickable: true,
    filled: true,
    stroked: false,
    radiusUnits: "pixels",
    radiusMinPixels: 10,
    radiusMaxPixels: 28,
    getPosition: (d) => [d.x * SCALE, d.y * SCALE, 0],
    getRadius: 11,
    getFillColor: fillFor(INNER_ALPHA),
    updateTriggers: { getFillColor: colorTrigger },
  });

  // Opaque core — the nib drop.
  const core = new ScatterplotLayer<CanvasDot>({
    id: "blot-core",
    data: dots,
    pickable: true,
    filled: true,
    stroked: true,
    radiusUnits: "pixels",
    radiusMinPixels: 4,
    radiusMaxPixels: 12,
    lineWidthMinPixels: 0.75,
    getPosition: (d) => [d.x * SCALE, d.y * SCALE, 0],
    getRadius: 5,
    getFillColor: (d) => d.color ?? DEFAULT_RGB,
    getLineColor: STROKE_RGBA,
    updateTriggers: { getFillColor: colorTrigger },
  });

  return (
    <DeckGL
      views={new OrthographicView({ id: "ortho" })}
      viewState={viewState}
      onViewStateChange={({ viewState: next }) => setViewState(next as OrthographicViewState)}
      controller={true}
      layers={[outerHalo, innerHalo, core]}
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
