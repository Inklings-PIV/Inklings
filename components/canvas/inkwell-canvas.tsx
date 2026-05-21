"use client";

import { DeckGL, OrthographicView, type OrthographicViewState, ScatterplotLayer } from "deck.gl";
import { useState } from "react";
import type { CanvasDot } from "./canvas-shell";

// Tracer-era layouts live in [-1, 1]; scale to deck.gl pixel-ish units.
const SCALE = 200;

// Default ink-deep colour as RGB (deck.gl can't read CSS variables).
const INK_DEEP_RGB: [number, number, number] = [40, 50, 80];
const PAPER_RGB: [number, number, number] = [248, 245, 235];

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

  const layer = new ScatterplotLayer<CanvasDot>({
    id: "blots",
    data: dots,
    pickable: true,
    stroked: true,
    filled: true,
    radiusUnits: "pixels",
    radiusMinPixels: 5,
    radiusMaxPixels: 20,
    lineWidthMinPixels: 1,
    getPosition: (d) => [d.x * SCALE, d.y * SCALE, 0],
    getRadius: 8,
    getFillColor: INK_DEEP_RGB,
    getLineColor: PAPER_RGB,
  });

  return (
    <DeckGL
      views={new OrthographicView({ id: "ortho" })}
      viewState={viewState}
      onViewStateChange={({ viewState: next }) => setViewState(next as OrthographicViewState)}
      controller={true}
      layers={[layer]}
      style={{ background: "transparent" }}
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
