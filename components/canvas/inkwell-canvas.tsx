"use client";

import {
  DeckGL,
  IconLayer,
  OrthographicView,
  type OrthographicViewState,
  TextLayer,
} from "deck.gl";
import { BLOT_SHAPES, shapeForId } from "@/lib/canvas/blot-shapes";
import type { CanvasDot } from "./canvas-shell";

// Tracer-era layouts live in [-1, 1]; scale to deck.gl pixel-ish units.
const SCALE = 200;

const DEFAULT_RGB: [number, number, number] = [40, 50, 80];

// The draft marker (#10) — a warm amber so "you" reads instantly against the
// corpus's mostly cool blots, independent of the hue-source toggle.
const MARKER_RGB: [number, number, number] = [198, 134, 40];

export const MIN_ZOOM = -3;
export const MAX_ZOOM = 8;

export const INITIAL_VIEW_STATE: OrthographicViewState = {
  target: [0, 0, 0],
  zoom: 1,
  minZoom: MIN_ZOOM,
  maxZoom: MAX_ZOOM,
};

/** Unwraps OrthographicView's `zoom` (number | legacy 2-tuple) to a scalar. */
export function scalarZoom(zoom: OrthographicViewState["zoom"]): number {
  if (zoom == null) return 1;
  return Array.isArray(zoom) ? (zoom[0] ?? 1) : zoom;
}

// Hermite curve — drives the inky cross-fades between zoom tiers without the
// hard pop a step function would give.
function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Three zoom tiers (#21):
//   Far   (zoom ≲ -0.3) — blots swell + go translucent ⇒ they bleed into a cloud
//   Mid   (zoom ≈ 0 … 1.5) — individual blots, hover for the name
//   Close (zoom ≳ 3) — labels fade in next to each blot
function zoomDriven(zoom: number) {
  const farness = 1 - smoothstep(-1.5, -0.3, zoom);
  const closeness = smoothstep(3.5, 4.5, zoom);
  return {
    blotSize: 52 + farness * 28, // 52 → 80 px
    blotOpacity: 1 - farness * 0.45, // 1 → 0.55
    labelOpacity: closeness, // 0 → 1
  };
}

// ---------------------------------------------------------------------------
// Icon atlas — one SVG per shape × softness, rendered as a mask icon. The
// radial gradient inside the path is what gives each book its "ink dropped on
// paper" look: opaque centre, gentle mid, fully transparent silhouette edge.
// A Gaussian blur softens the polygonal silhouette without turning it round.
//
// Softness encodes source disagreement (lib/colour/uncertainty.ts): methods
// in consensus get the sharp profile, contested books bleed like ink on wet
// paper — a softer core and a longer tail.
// ---------------------------------------------------------------------------

type DeckIcon = {
  url: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  mask: true;
};

type GradientProfile = {
  /** [offset%, opacity] stops for the radial gradient. */
  stops: ReadonlyArray<readonly [number, number]>;
  blur: number;
};

// 0 sharp · 1 loose · 2 diffuse — indexed by Softness.
const GRADIENTS: readonly GradientProfile[] = [
  {
    stops: [
      [0, 1],
      [72, 1],
      [90, 0.55],
      [100, 0],
    ],
    blur: 1,
  },
  {
    stops: [
      [0, 1],
      [64, 0.95],
      [88, 0.5],
      [100, 0],
    ],
    blur: 1.5,
  },
  {
    stops: [
      [0, 1],
      [54, 0.9],
      [80, 0.42],
      [100, 0],
    ],
    blur: 2,
  },
];

function buildIcon(path: string, softness: number): DeckIcon {
  // biome-ignore lint/style/noNonNullAssertion: softness is bucketed to 0..2.
  const profile = GRADIENTS[softness] ?? GRADIENTS[0]!;
  // Expand viewBox a bit so the blur tail has room.
  const pad = 12;
  const dim = 120 + 2 * pad;
  const stops = profile.stops
    .map(
      ([offset, opacity]) =>
        `<stop offset='${offset}%' stop-color='white' stop-opacity='${opacity}'/>`,
    )
    .join("");
  // width/height are required: Chrome's createImageBitmap refuses SVG images
  // without natural dimensions, which left every blot invisible.
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${dim}' height='${dim}' viewBox='${-pad} ${-pad} ${dim} ${dim}'>` +
    `<defs>` +
    `<radialGradient id='g' cx='50%' cy='50%' r='55%'>` +
    stops +
    `</radialGradient>` +
    `<filter id='b' x='-25%' y='-25%' width='150%' height='150%'>` +
    `<feGaussianBlur stdDeviation='${profile.blur}'/>` +
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

// ICONS[softness][shapeIndex] — small atlas: shapes × 3 gradient profiles.
const ICONS: DeckIcon[][] = GRADIENTS.map((_, s) => BLOT_SHAPES.map((p) => buildIcon(p, s)));
// BLOT_SHAPES is non-empty; this guarantees a non-undefined fallback for TS.
const FALLBACK_ICON: DeckIcon = buildIcon(BLOT_SHAPES[0] ?? "M0,0 Z", 0);

// Diffuse gradients carry less visual mass; nudge their size up so a
// contested blot reads softer, not smaller.
const SIZE_BY_SOFTNESS = [1, 1.04, 1.08] as const;

// ---------------------------------------------------------------------------

type Props = {
  dots: CanvasDot[];
  /** A highlighted "you are here" dot drawn on top of the corpus (#10). */
  marker?: CanvasDot | null;
  viewState: OrthographicViewState;
  onViewStateChange: (vs: OrthographicViewState) => void;
  /** Called with a blot's id on click, or null when the background is clicked. */
  onSelect?: (id: string | null) => void;
};

export function InkwellCanvas({ dots, marker, viewState, onViewStateChange, onSelect }: Props) {
  const { blotSize, blotOpacity, labelOpacity } = zoomDriven(scalarZoom(viewState.zoom));

  const blotLayer = new IconLayer<CanvasDot>({
    id: "blots",
    data: dots,
    pickable: true,
    opacity: blotOpacity,
    sizeUnits: "pixels",
    getPosition: (d) => [d.x * SCALE, d.y * SCALE, 0],
    getIcon: (d) => ICONS[d.softness ?? 0]?.[shapeForId(d.id)] ?? FALLBACK_ICON,
    getSize: (d) => blotSize * (SIZE_BY_SOFTNESS[d.softness ?? 0] ?? 1),
    sizeMinPixels: 22,
    sizeMaxPixels: 160,
    getColor: (d) => {
      const [r, g, b] = d.color ?? DEFAULT_RGB;
      return [r, g, b, 255];
    },
    updateTriggers: {
      getIcon: dots.map((d) => `${d.id}|${d.softness ?? 0}`),
      getSize: [blotSize, dots.map((d) => d.softness ?? 0).join(",")],
      getColor: dots.map((d) => d.color),
    },
  });

  const labelLayer = new TextLayer<CanvasDot>({
    id: "labels",
    data: dots,
    visible: labelOpacity > 0.01,
    opacity: labelOpacity,
    sizeUnits: "pixels",
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontWeight: 500,
    getPosition: (d) => [d.x * SCALE, d.y * SCALE, 0],
    getText: (d) => `${d.title}\n${d.subtitle}`,
    getSize: 11,
    getColor: [40, 50, 80, 235],
    getPixelOffset: [0, 32],
    getTextAnchor: "middle",
    getAlignmentBaseline: "top",
    background: true,
    backgroundPadding: [5, 3],
    getBackgroundColor: [250, 248, 244, 220],
    getBorderColor: [40, 50, 80, 30],
    getBorderWidth: 1,
    updateTriggers: {
      getText: dots.map((d) => `${d.title}|${d.subtitle}`),
    },
  });

  // Draft marker (#10) — a soft halo, the amber dot, and an always-visible
  // label, drawn on top of the corpus so "you are here" never hides among the
  // blots at any zoom. Non-pickable: clicks fall through to the books beneath.
  const markerData = marker ? [marker] : [];
  const markerLayers = marker
    ? [
        new IconLayer<CanvasDot>({
          id: "draft-halo",
          data: markerData,
          pickable: false,
          opacity: 0.3,
          sizeUnits: "pixels",
          getPosition: (d) => [d.x * SCALE, d.y * SCALE, 0],
          getIcon: () => FALLBACK_ICON,
          getSize: blotSize * 1.85,
          sizeMinPixels: 42,
          getColor: () => [...MARKER_RGB, 255],
        }),
        new IconLayer<CanvasDot>({
          id: "draft-marker",
          data: markerData,
          pickable: false,
          sizeUnits: "pixels",
          getPosition: (d) => [d.x * SCALE, d.y * SCALE, 0],
          getIcon: () => FALLBACK_ICON,
          getSize: blotSize,
          sizeMinPixels: 24,
          getColor: () => [...MARKER_RGB, 255],
        }),
        new TextLayer<CanvasDot>({
          id: "draft-label",
          data: markerData,
          pickable: false,
          sizeUnits: "pixels",
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontWeight: 600,
          getPosition: (d) => [d.x * SCALE, d.y * SCALE, 0],
          getText: (d) => d.title,
          getSize: 12,
          getColor: [...MARKER_RGB, 255],
          getPixelOffset: [0, -Math.round(blotSize * 0.7)],
          getTextAnchor: "middle",
          getAlignmentBaseline: "bottom",
          background: true,
          backgroundPadding: [5, 3],
          getBackgroundColor: [250, 248, 244, 235],
          getBorderColor: [...MARKER_RGB, 90],
          getBorderWidth: 1,
        }),
      ]
    : [];

  return (
    <DeckGL
      views={new OrthographicView({ id: "ortho" })}
      viewState={viewState}
      onViewStateChange={({ viewState: next }) => onViewStateChange(next as OrthographicViewState)}
      controller={true}
      layers={[blotLayer, labelLayer, ...markerLayers]}
      style={{ background: "transparent" }}
      onClick={(info) => {
        const picked = (info.object as CanvasDot | undefined)?.id ?? null;
        onSelect?.(picked);
      }}
      getCursor={({ isHovering, isDragging }) =>
        isDragging ? "grabbing" : isHovering ? "pointer" : "grab"
      }
      getTooltip={({ object }) => {
        // Once labels are mostly faded in, they replace the tooltip role.
        if (!object || labelOpacity > 0.5) return null;
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
