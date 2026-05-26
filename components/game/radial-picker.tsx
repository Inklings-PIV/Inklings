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
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Radial ink-splash picker for Swatch mode.
 *
 * Uses the hand-drawn `public/splash_tile.svg` path: a single splash
 * anchored at (400, 400) in an 800×800 viewBox. Six instances rotated
 * by 60° around that anchor tile the circular space perfectly — see
 * `public/splash_hexagon.svg` for the reference arrangement. We scale
 * each tile slightly around its own visual centroid to introduce a
 * ~2px gap between neighbours, like ink dropped just close enough to
 * almost merge.
 *
 * Three animation layers sit on top of the existing game logic:
 *
 *   1. Pointer-push: each splash translates radially-outward when the
 *      cursor approaches its centroid. Applied via CSS transform on a
 *      wrapping <motion.g>, in pixel units (the SVG transform attribute
 *      didn't reliably re-bind a MotionValue, hence two layers — static
 *      SVG transform for rotation/gap, CSS transform for the push).
 *   2. Pick scale + ring: the tapped splash scales to 1.06× and the
 *      result colour traces its outline.
 *   3. Ripple: a 600ms expanding ring fades out from the splash
 *      centroid.
 *
 * Game integrity is preserved: the parent (`SwatchRound`) still receives
 * the same `(swatchId, sourceEl, colour)` tuple via `onPick` and submits
 * the same guess.
 */

type Swatch = { swatchId: string; css: string };

type RadialPickerProps = {
  swatches: Swatch[];
  pickedId?: string | null;
  correctId?: string | null;
  disabled?: boolean;
  onPick: (swatchId: string, sourceEl: HTMLElement, colour: string) => void;
};

// --- The hand-drawn splash shape, inlined from public/splash_tile.svg.
// One blob anchored at (400, 400) of the 800-unit viewBox, extending
// outward into one 60° slice of the hexagon.
const SPLASH_PATH =
  "M 400.00 400.00 C 406.30 400.00 405.20 399.04 418.00 408.00 C 430.80 416.96 425.92 424.80 440.00 428.00 C 454.08 431.20 448.56 428.88 462.00 418.00 C 475.44 407.12 469.20 406.16 482.00 394.00 C 494.80 381.84 489.20 381.28 502.00 380.00 C 514.80 378.72 509.84 377.84 522.00 390.00 C 534.16 402.16 528.48 402.64 540.00 418.00 C 551.52 433.36 545.84 434.80 558.00 438.00 C 570.16 441.20 565.84 438.88 578.00 428.00 C 590.16 417.12 585.12 416.16 596.00 404.00 C 606.88 391.84 601.76 391.92 612.00 390.00 C 622.24 388.08 619.04 394.80 628.00 398.00 C 636.96 401.20 640.00 403.89 640.00 400.00 C 640.00 393.30 641.84 397.65 651.39 382.42 C 660.93 367.20 675.00 369.81 669.84 352.42 C 664.67 335.03 645.01 345.36 635.25 328.08 C 625.49 310.79 636.46 320.51 639.33 298.41 C 642.20 276.31 657.43 274.25 644.22 259.00 C 631.01 243.75 614.98 264.76 598.06 250.75 C 581.14 236.74 602.48 229.72 591.34 215.22 C 580.21 200.72 578.33 214.74 563.27 205.42 C 548.20 196.11 558.12 190.35 544.27 186.11 C 530.43 181.86 513.07 188.15 520.00 192.15 C 523.37 194.10 519.52 195.39 512.27 201.55 C 505.02 207.71 500.80 201.57 497.34 211.40 C 493.88 221.23 496.37 216.76 501.46 232.26 C 506.55 247.76 509.91 243.88 513.25 259.85 C 516.59 275.82 520.76 273.24 511.91 282.17 C 503.06 291.10 504.65 285.46 485.59 287.76 C 466.53 290.05 468.95 284.89 452.34 289.34 C 435.73 293.80 438.97 289.94 433.68 301.67 C 428.39 313.39 431.67 308.82 435.80 325.99 C 439.93 343.15 443.89 338.23 446.59 355.31 C 449.29 372.39 454.06 368.77 444.25 379.36 C 434.44 389.95 430.09 381.81 415.93 388.41 C 401.77 395.02 403.15 394.54 400.00 400.00 Z";

// --- Geometry constants, all in the 800×800 viewBox.
const VIEW_SIZE = 800;
const CENTER = VIEW_SIZE / 2; // (400, 400) — the splash anchor + picker centre
// Approximate visual centroid of one splash blob (eyeballed from the
// path bounding box, ~540, 310). Used for the pointer-push origin and
// for scaling each tile to create the inter-splash gap.
const CENTROID_X = 530;
const CENTROID_Y = 315;
// Shrink each tile around its own centroid to introduce the inter-splash
// gap. 0.955 ⇒ ~4.5% shrink ⇒ roughly 6px gap between neighbours at a
// 300-ish px picker. Tunable by feel.
const GAP_SCALE = 0.955;
// Rotation offset (degrees) applied to every tile. The raw path points
// upper-right; we shift so the first tile's centroid sits at the top.
const ROTATION_OFFSET = -57;

// Pointer-push tuning. Both values are *fractions of the picker width*
// so the effect feels consistent at any size: a fingertip needs to be
// within 35% of the picker width to influence a splash, and the splash
// can move up to 5% of the picker width away from the cursor.
const PUSH_FIELD_FRAC = 0.35;
const PUSH_STRENGTH_FRAC = 0.05;

export function RadialPicker({
  swatches,
  pickedId,
  correctId,
  disabled,
  onPick,
}: RadialPickerProps) {
  const reducedMotion = useReducedMotion();
  const isRevealed = correctId != null;
  const splashes = swatches.slice(0, 6);

  const containerRef = useRef<HTMLDivElement>(null);
  // Track container width in CSS pixels — splash centroids and the
  // pointer-push field/strength are derived from it. Default to a
  // reasonable value before ResizeObserver fires so first paint is sane.
  const [containerSize, setContainerSize] = useState(300);

  // Pointer position in container-relative CSS pixels. -1000 keeps every
  // splash at rest before the first pointermove (and on touch devices
  // where pointermove rarely fires without a press).
  const pointerPxX = useMotionValue(-1000);
  const pointerPxY = useMotionValue(-1000);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) setContainerSize(rect.width);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const handler = (e: PointerEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      pointerPxX.set(e.clientX - rect.left);
      pointerPxY.set(e.clientY - rect.top);
    };
    window.addEventListener("pointermove", handler);
    return () => window.removeEventListener("pointermove", handler);
  }, [reducedMotion, pointerPxX, pointerPxY]);

  const pushField = containerSize * PUSH_FIELD_FRAC;
  const pushStrength = containerSize * PUSH_STRENGTH_FRAC;

  return (
    <div ref={containerRef} className="relative mx-auto aspect-square w-full max-w-sm sm:max-w-72">
      <svg
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        className="absolute inset-0 size-full"
        aria-hidden="true"
      >
        {splashes.map((swatch, i) => (
          <Splash
            key={swatch.swatchId}
            swatch={swatch}
            sectorIndex={i}
            isPicked={pickedId === swatch.swatchId}
            isCorrect={correctId === swatch.swatchId}
            isRevealed={isRevealed}
            disabled={disabled ?? false}
            reducedMotion={reducedMotion ?? false}
            label={`Swatch ${i + 1} of ${splashes.length}`}
            containerSize={containerSize}
            pointerPxX={pointerPxX}
            pointerPxY={pointerPxY}
            pushField={pushField}
            pushStrength={pushStrength}
            onPick={(el) => onPick(swatch.swatchId, el, swatch.css)}
          />
        ))}
      </svg>
    </div>
  );
}

type SplashProps = {
  swatch: Swatch;
  sectorIndex: number;
  isPicked: boolean;
  isCorrect: boolean;
  isRevealed: boolean;
  disabled: boolean;
  reducedMotion: boolean;
  label: string;
  containerSize: number;
  pointerPxX: MotionValue<number>;
  pointerPxY: MotionValue<number>;
  pushField: number;
  pushStrength: number;
  onPick: (el: HTMLElement) => void;
};

function Splash({
  swatch,
  sectorIndex,
  isPicked,
  isCorrect,
  isRevealed,
  disabled,
  reducedMotion,
  label,
  containerSize,
  pointerPxX,
  pointerPxY,
  pushField,
  pushStrength,
  onPick,
}: SplashProps) {
  const rotationDeg = sectorIndex * 60 + ROTATION_OFFSET;
  const rotationRad = (rotationDeg * Math.PI) / 180;
  const cosR = Math.cos(rotationRad);
  const sinR = Math.sin(rotationRad);

  // Where the splash's visual centroid lands after rotation, expressed
  // in viewBox coords (relative to (0,0), not the picker centre). Used
  // to position the ripple and to anchor the pointer-push field.
  const centroidVecX = CENTROID_X - CENTER;
  const centroidVecY = CENTROID_Y - CENTER;
  const rippleCx = CENTER + centroidVecX * cosR - centroidVecY * sinR;
  const rippleCy = CENTER + centroidVecX * sinR + centroidVecY * cosR;

  // Same centroid, in CSS pixels relative to the container's top-left,
  // so we can compare with the pointer position which is tracked in the
  // same space.
  const centroidPxX = (rippleCx / VIEW_SIZE) * containerSize;
  const centroidPxY = (rippleCy / VIEW_SIZE) * containerSize;

  // Pointer-push: project (centroid - cursor) onto a push vector, capped
  // at `pushStrength` CSS px, zeroed beyond `pushField`. Silenced once
  // the round is revealed so result rings stay rooted.
  const pushSilenced = reducedMotion || disabled || isRevealed;
  const pushX = useTransform([pointerPxX, pointerPxY], (values) => {
    if (pushSilenced) return 0;
    const [px, py] = values as number[];
    const dx = centroidPxX - (px ?? 0);
    const dy = centroidPxY - (py ?? 0);
    const dist = Math.hypot(dx, dy);
    if (dist === 0 || dist > pushField) return 0;
    const t = 1 - dist / pushField;
    return (dx / dist) * pushStrength * t;
  });
  const pushY = useTransform([pointerPxX, pointerPxY], (values) => {
    if (pushSilenced) return 0;
    const [px, py] = values as number[];
    const dx = centroidPxX - (px ?? 0);
    const dy = centroidPxY - (py ?? 0);
    const dist = Math.hypot(dx, dy);
    if (dist === 0 || dist > pushField) return 0;
    const t = 1 - dist / pushField;
    return (dy / dist) * pushStrength * t;
  });
  const springX = useSpring(pushX, { damping: 18, stiffness: 220, mass: 0.6 });
  const springY = useSpring(pushY, { damping: 18, stiffness: 220, mass: 0.6 });

  // Static SVG transform — rotation + gap-scale. Applied right-to-left:
  //   1. translate(-CENTROID): centroid → origin
  //   2. scale(GAP): shrink around centroid for the gap
  //   3. translate(CENTROID): centroid back
  //   4. rotate(angle, CENTER, CENTER): rotate around picker centre
  const baseTransform = `rotate(${rotationDeg} ${CENTER} ${CENTER}) translate(${CENTROID_X} ${CENTROID_Y}) scale(${GAP_SCALE}) translate(${-CENTROID_X} ${-CENTROID_Y})`;

  // Result-state stroke. We outline the picked / correct splash in the
  // result colour because filling its outline is more legible than a
  // box ring on an irregular shape.
  const stroke = (() => {
    if (isPicked && isCorrect) return "rgb(16, 185, 129)"; // emerald-500
    if (isPicked && isRevealed && !isCorrect) return "rgb(239, 68, 68)"; // red-500
    if (isPicked && !isRevealed) return "rgba(255, 255, 255, 0.85)";
    if (isRevealed && !isPicked && isCorrect) return "rgba(16, 185, 129, 0.65)";
    return "transparent";
  })();
  const strokeWidth = isPicked ? 14 : isRevealed && isCorrect ? 10 : 0;

  const dimmed = isRevealed && !isPicked && !isCorrect;

  const handleClick = (e: React.MouseEvent<SVGGElement>) => {
    if (disabled) return;
    onPick(e.currentTarget as unknown as HTMLElement);
  };

  return (
    <>
      {/* Outer motion.g handles the pointer-push via CSS transform
          (in pixels), inner g handles the static rotation + gap
          via SVG transform attribute. */}
      <motion.g style={{ x: springX, y: springY }}>
        {/* biome-ignore lint/a11y/useSemanticElements: <button> isn't a valid SVG child */}
        <g
          role="button"
          aria-label={label}
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          transform={baseTransform}
          onClick={handleClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (!disabled) onPick(e.currentTarget as unknown as HTMLElement);
            }
          }}
          style={{ cursor: disabled ? "default" : "pointer" }}
        >
          <motion.path
            d={SPLASH_PATH}
            fill={swatch.css}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            strokeLinecap="round"
            animate={{
              scale: isPicked ? 1.06 : 1,
              opacity: dimmed ? 0.45 : 1,
            }}
            whileTap={reducedMotion || disabled ? undefined : { scale: 0.97 }}
            style={{
              transformBox: "fill-box",
              transformOrigin: "center",
            }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          />
        </g>
      </motion.g>
      <AnimatePresence>
        {isPicked && !reducedMotion && (
          <Ripple key={`ripple-${sectorIndex}`} cx={rippleCx} cy={rippleCy} colour={swatch.css} />
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Single 600ms ring that expands from the splash centroid and fades.
 * Lives at the SVG root so its transform isn't fighting the splash's.
 */
function Ripple({ cx, cy, colour }: { cx: number; cy: number; colour: string }) {
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={40}
      fill="none"
      stroke={colour}
      strokeWidth={10}
      initial={{ scale: 1, opacity: 0.55 }}
      animate={{ scale: 3, opacity: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      style={{ transformBox: "fill-box", transformOrigin: "center" }}
      pointerEvents="none"
    />
  );
}

/**
 * Loading skeleton: six splash silhouettes in the same arrangement,
 * muted and pulsing. Used while the first round is being fetched.
 */
export function RadialPickerSkeleton() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-72">
      <svg
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        className={cn("absolute inset-0 size-full animate-pulse")}
        aria-hidden="true"
      >
        {Array.from({ length: 6 }, (_, i) => {
          const rotationDeg = i * 60 + ROTATION_OFFSET;
          const transform = `rotate(${rotationDeg} ${CENTER} ${CENTER}) translate(${CENTROID_X} ${CENTROID_Y}) scale(${GAP_SCALE}) translate(${-CENTROID_X} ${-CENTROID_Y})`;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton placeholders
            <g key={i} transform={transform}>
              <path d={SPLASH_PATH} className="fill-muted/40" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
