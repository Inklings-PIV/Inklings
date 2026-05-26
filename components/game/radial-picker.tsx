"use client";

import {
  AnimatePresence,
  type MotionValue,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Radial 6-wedge ink-splatter picker for Swatch mode. Six rounded
 * pie-slice shapes nearly tile the circular space — a small central
 * gap + thin angular channels keep them "barely touching", like ink
 * drops spreading on paper until they meet.
 *
 * Three "fun layers" stack on the existing game logic:
 *
 *   1. Pointer-push: each wedge translates radially-outward when the
 *      cursor approaches its centroid, opening a gap between it and
 *      its neighbours. Disabled on `prefers-reduced-motion` and during
 *      the reveal state (no movement under the result rings).
 *   2. Pick scale + halo: the tapped wedge scales to 1.06× and grows
 *      a soft outline.
 *   3. Ripple: a 600ms expanding ring fades out from the wedge centroid.
 *
 * Game integrity is preserved: the parent (`SwatchRound`) still receives
 * the same `(swatchId, sourceEl, colour)` tuple via `onPick` and submits
 * the same guess. `sourceEl` is the wedge's `<g>` element — its bounding
 * rect is a close approximation of the wedge centroid for the drip start.
 */

type Swatch = { swatchId: string; css: string };

type RadialPickerProps = {
  // Caller is expected to pass 6 swatches — the existing server contract.
  // If fewer arrive we render what's there; if more, extras are dropped.
  swatches: Swatch[];
  pickedId?: string | null;
  // When non-null, the picker is in "revealed" state — rings appear on
  // the picked + correct wedges, others dim.
  correctId?: string | null;
  disabled?: boolean;
  onPick: (swatchId: string, sourceEl: HTMLElement, colour: string) => void;
};

// --- Geometry constants. SVG viewBox is -50,-50,100,100, so the centre
// sits at (0,0) and the rim at radius ≈ 50.
// Small inner hole so the six splashes barely touch in the middle, and a
// thin angular gap so they barely touch each other along their sides.
const INNER_R = 6;
const OUTER_R = 46;
const SECTOR_DEG = 60;
const GAP_DEG = 8; // wider angular channel so the bigger bulges don't merge
const SECTOR_HALF_SPAN = (SECTOR_DEG - GAP_DEG) / 2;
// Shoulder = the off-axis fat point of each splash. Pushed outward so the
// blob is pear-shaped — narrow at the centre, big puffy splash-head at the rim.
const SHOULDER_FRACTION = 0.62;
// Tangent length scalars for the cubic Beziers — bigger = more outward
// bulge. Cranked high enough that the side curves bow generously past the
// chord between shoulders and the outer rim balloons.
const INNER_BULGE = 0.95;
const OUTER_BULGE = 1.25;

// --- Pointer-push tuning, in viewBox units (where the picker spans 100).
const PUSH_FIELD = 32;
const PUSH_STRENGTH = 4.5;

export function RadialPicker({
  swatches,
  pickedId,
  correctId,
  disabled,
  onPick,
}: RadialPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  // Pointer offset relative to container centre, in viewBox units
  // (-50..50 range). Stays at (0,0) until the user moves the cursor —
  // so on first paint and on mobile (where pointermove rarely fires
  // without a press) all wedges sit at rest.
  const pointerVbX = useMotionValue(0);
  const pointerVbY = useMotionValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    const handler = (e: PointerEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return;
      // Convert client coords → viewBox coords.
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      pointerVbX.set(((e.clientX - cx) * 100) / rect.width);
      pointerVbY.set(((e.clientY - cy) * 100) / rect.width);
    };
    window.addEventListener("pointermove", handler);
    return () => window.removeEventListener("pointermove", handler);
  }, [pointerVbX, pointerVbY, reducedMotion]);

  const isRevealed = correctId != null;
  const wedges = swatches.slice(0, 6);

  return (
    <div ref={containerRef} className="relative mx-auto aspect-square w-full max-w-72">
      <svg
        viewBox="-50 -50 100 100"
        className="absolute inset-0 size-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          {/* Ink-warp filter: low-frequency fractal turbulence displaces
              the otherwise-smooth Bezier shape to give each splash an
              organic, hand-drawn irregularity. baseFrequency low ⇒ large
              wobble features (not jagged noise); scale ⇒ how much push. */}
          <filter id="ink-warp" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.025"
              numOctaves="2"
              seed="7"
              result="noise"
            />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.5" />
          </filter>
        </defs>
        {wedges.map((swatch, i) => (
          <Wedge
            key={swatch.swatchId}
            swatch={swatch}
            sectorIndex={i}
            pointerVbX={pointerVbX}
            pointerVbY={pointerVbY}
            isPicked={pickedId === swatch.swatchId}
            isCorrect={correctId === swatch.swatchId}
            isRevealed={isRevealed}
            disabled={disabled ?? false}
            reducedMotion={reducedMotion ?? false}
            label={`Swatch ${i + 1} of ${wedges.length}`}
            onPick={(el) => onPick(swatch.swatchId, el, swatch.css)}
          />
        ))}
      </svg>
    </div>
  );
}

type WedgeProps = {
  swatch: Swatch;
  sectorIndex: number;
  pointerVbX: MotionValue<number>;
  pointerVbY: MotionValue<number>;
  isPicked: boolean;
  isCorrect: boolean;
  isRevealed: boolean;
  disabled: boolean;
  reducedMotion: boolean;
  label: string;
  onPick: (el: HTMLElement) => void;
};

function Wedge({
  swatch,
  sectorIndex,
  pointerVbX,
  pointerVbY,
  isPicked,
  isCorrect,
  isRevealed,
  disabled,
  reducedMotion,
  label,
  onPick,
}: WedgeProps) {
  const centerAngleDeg = sectorIndex * SECTOR_DEG - 90; // top first, then clockwise
  const centerAngleRad = (centerAngleDeg * Math.PI) / 180;

  // Centroid in viewBox units — used for pointer-push origin and
  // ripple positioning.
  const centroidR = (INNER_R + OUTER_R) / 2;
  const centroidX = centroidR * Math.cos(centerAngleRad);
  const centroidY = centroidR * Math.sin(centerAngleRad);

  const d = useMemo(
    () => buildSplashPath(centerAngleDeg, INNER_R, OUTER_R, SECTOR_HALF_SPAN),
    [centerAngleDeg],
  );

  // Pointer-push: project (centroid - cursor) into a push vector,
  // capped at PUSH_STRENGTH viewBox units, zeroed beyond PUSH_FIELD.
  // Suppressed once the round is revealed so the result ring stays put.
  const pushSilenced = reducedMotion || disabled || isRevealed;
  const pushX = useTransform([pointerVbX, pointerVbY], (values) => {
    if (pushSilenced) return 0;
    const [px, py] = values as number[];
    const dx = centroidX - (px ?? 0);
    const dy = centroidY - (py ?? 0);
    const dist = Math.hypot(dx, dy);
    if (dist === 0 || dist > PUSH_FIELD) return 0;
    const t = 1 - dist / PUSH_FIELD;
    return (dx / dist) * PUSH_STRENGTH * t;
  });
  const pushY = useTransform([pointerVbX, pointerVbY], (values) => {
    if (pushSilenced) return 0;
    const [px, py] = values as number[];
    const dx = centroidX - (px ?? 0);
    const dy = centroidY - (py ?? 0);
    const dist = Math.hypot(dx, dy);
    if (dist === 0 || dist > PUSH_FIELD) return 0;
    const t = 1 - dist / PUSH_FIELD;
    return (dy / dist) * PUSH_STRENGTH * t;
  });

  // Smooth the push with springs — gives the ink-in-water feel.
  const springX = useSpring(pushX, { damping: 18, stiffness: 220, mass: 0.6 });
  const springY = useSpring(pushY, { damping: 18, stiffness: 220, mass: 0.6 });

  // Result-state styling. SVG strokes work nicer than Tailwind ring
  // utilities for non-rectangular shapes — we just thicken the path
  // outline in the relevant colour.
  const stroke = (() => {
    if (isPicked && isCorrect) return "rgb(16, 185, 129)"; // emerald-500
    if (isPicked && isRevealed && !isCorrect) return "rgb(239, 68, 68)"; // red-500
    if (isPicked && !isRevealed) return "rgba(255, 255, 255, 0.85)";
    if (isRevealed && !isPicked && isCorrect) return "rgba(16, 185, 129, 0.65)";
    return "transparent";
  })();
  const strokeWidth = isPicked ? 2 : isRevealed && isCorrect ? 1.5 : 0;

  const dimmed = isRevealed && !isPicked && !isCorrect;

  // Handle click: we attach onClick to the <g> wrapper so the entire
  // wedge is clickable; the inner <path> would also work but is harder
  // to hit on the angular gaps.
  const handleClick = (e: React.MouseEvent<SVGGElement>) => {
    if (disabled) return;
    onPick(e.currentTarget as unknown as HTMLElement);
  };

  return (
    <motion.g
      role="button"
      aria-label={label}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!disabled) onPick(e.currentTarget as unknown as HTMLElement);
        }
      }}
      style={{
        // Motion translates these to a CSS `transform: translate3d(...)`
        // which composes with SVG transforms cleanly in all modern
        // browsers. `transform-origin: center` keeps scale centred.
        x: springX,
        y: springY,
        cursor: disabled ? "default" : "pointer",
        transformOrigin: "0 0",
      }}
      animate={{
        scale: isPicked ? 1.06 : 1,
        opacity: dimmed ? 0.45 : 1,
      }}
      whileTap={reducedMotion || disabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <motion.path
        d={d}
        fill={swatch.css}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        // Apply the ink-warp filter so the smooth Bezier shape gets
        // displaced into something asymmetric and splattery. Without
        // this, even fat petals look too geometric to read as "ink".
        filter="url(#ink-warp)"
      />
      <AnimatePresence>
        {isPicked && !reducedMotion && (
          <Ripple key="ripple" cx={centroidX} cy={centroidY} colour={swatch.css} />
        )}
      </AnimatePresence>
    </motion.g>
  );
}

/**
 * Single 600ms ring that expands from a wedge centroid and fades out.
 * Mounted via AnimatePresence; unmounts cleanly on round transition.
 */
function Ripple({ cx, cy, colour }: { cx: number; cy: number; colour: string }) {
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={8}
      fill="none"
      stroke={colour}
      strokeWidth={2}
      initial={{ scale: 1, opacity: 0.6 }}
      animate={{ scale: 4, opacity: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      style={{ transformOrigin: `${cx}px ${cy}px` }}
      pointerEvents="none"
    />
  );
}

/**
 * Loading skeleton: six dashed wedges in the same layout, dimmed and
 * pulsing. Used while the first round is being fetched.
 */
export function RadialPickerSkeleton() {
  const paths = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) =>
        buildSplashPath(i * SECTOR_DEG - 90, INNER_R, OUTER_R, SECTOR_HALF_SPAN),
      ),
    [],
  );

  return (
    <div className="relative mx-auto aspect-square w-full max-w-72">
      <svg
        viewBox="-50 -50 100 100"
        className="absolute inset-0 size-full animate-pulse"
        aria-hidden="true"
      >
        {paths.map((d, i) => (
          <path
            // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton placeholders
            key={i}
            d={d}
            className={cn("fill-muted/40 stroke-border/60")}
            strokeWidth={0.5}
            strokeDasharray="2 2"
          />
        ))}
      </svg>
    </div>
  );
}

/**
 * Build a cubic-Bezier ink-splash blob for one sector.
 *
 * Four anchor points trace the petal clockwise (in SVG y-down coords):
 *   A0 = inner tip (small, near the centre)
 *   A1 = right shoulder (off-axis, the fat side bulge)
 *   A2 = outer tip (rounded splash head at the rim)
 *   A3 = left shoulder (mirror of A1)
 *
 * Between every pair of anchors sits a cubic Bezier whose tangent
 * vectors at start/end are *aligned with the boundary direction* (perp
 * to radial at the on-axis anchors, radial at the shoulder anchors).
 * This produces a smooth blob with no visible corners — the rim bulges
 * outward, the inner end stays small, and the sides curve fluidly.
 *
 * Tangent magnitudes (INNER_BULGE, OUTER_BULGE) control how *fat* each
 * curve gets. Bigger → more dramatic splash; smaller → tighter wedge.
 */
function buildSplashPath(
  centerDeg: number,
  innerR: number,
  outerR: number,
  halfSpan: number,
): string {
  const c = (centerDeg * Math.PI) / 180;
  const h = (halfSpan * Math.PI) / 180;
  const shoulderR = innerR + (outerR - innerR) * SHOULDER_FRACTION;

  const cosC = Math.cos(c);
  const sinC = Math.sin(c);
  const cosCH = Math.cos(c + h);
  const sinCH = Math.sin(c + h);
  const cosCmH = Math.cos(c - h);
  const sinCmH = Math.sin(c - h);

  // Anchors
  const A0 = { x: innerR * cosC, y: innerR * sinC };
  const A1 = { x: shoulderR * cosCH, y: shoulderR * sinCH };
  const A2 = { x: outerR * cosC, y: outerR * sinC };
  const A3 = { x: shoulderR * cosCmH, y: shoulderR * sinCmH };

  // Unit tangent vectors. `perp` is +90° from radial (the "clockwise"
  // boundary direction at the on-axis anchors); `radPlus` and `radMinus`
  // are the outward radials at the right and left shoulders.
  const perp = { x: -sinC, y: cosC };
  const radPlus = { x: cosCH, y: sinCH };
  const radMinus = { x: cosCmH, y: sinCmH };

  // Tangent magnitudes — these set the bulge.
  const tIn = (shoulderR - innerR) * INNER_BULGE;
  const tOut = (outerR - shoulderR) * OUTER_BULGE;

  // Cubic Bezier control points. For each segment from P0→P3, the curve
  // leaves P0 in direction +tangent_at_P0 and arrives at P3 from
  // direction +tangent_at_P3, so:
  //   C1 = P0 + tangent_at_P0 * length
  //   C2 = P3 - tangent_at_P3 * length

  // A0 → A1: leaves perpendicular (clockwise), arrives radially outward
  const C01a = { x: A0.x + perp.x * tIn, y: A0.y + perp.y * tIn };
  const C01b = { x: A1.x - radPlus.x * tIn, y: A1.y - radPlus.y * tIn };

  // A1 → A2: leaves radially outward, arrives perpendicular (still CW)
  const C12a = { x: A1.x + radPlus.x * tOut, y: A1.y + radPlus.y * tOut };
  const C12b = { x: A2.x + perp.x * tOut, y: A2.y + perp.y * tOut };

  // A2 → A3: leaves perpendicular (-CW), arrives radially inward
  const C23a = { x: A2.x - perp.x * tOut, y: A2.y - perp.y * tOut };
  const C23b = { x: A3.x + radMinus.x * tOut, y: A3.y + radMinus.y * tOut };

  // A3 → A0: leaves radially inward, arrives perpendicular (back to start)
  const C30a = { x: A3.x - radMinus.x * tIn, y: A3.y - radMinus.y * tIn };
  const C30b = { x: A0.x - perp.x * tIn, y: A0.y - perp.y * tIn };

  return [
    `M ${A0.x.toFixed(2)} ${A0.y.toFixed(2)}`,
    `C ${C01a.x.toFixed(2)} ${C01a.y.toFixed(2)} ${C01b.x.toFixed(2)} ${C01b.y.toFixed(2)} ${A1.x.toFixed(2)} ${A1.y.toFixed(2)}`,
    `C ${C12a.x.toFixed(2)} ${C12a.y.toFixed(2)} ${C12b.x.toFixed(2)} ${C12b.y.toFixed(2)} ${A2.x.toFixed(2)} ${A2.y.toFixed(2)}`,
    `C ${C23a.x.toFixed(2)} ${C23a.y.toFixed(2)} ${C23b.x.toFixed(2)} ${C23b.y.toFixed(2)} ${A3.x.toFixed(2)} ${A3.y.toFixed(2)}`,
    `C ${C30a.x.toFixed(2)} ${C30a.y.toFixed(2)} ${C30b.x.toFixed(2)} ${C30b.y.toFixed(2)} ${A0.x.toFixed(2)} ${A0.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}
