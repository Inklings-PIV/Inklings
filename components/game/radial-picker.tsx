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
 * Radial 6-dot picker for Swatch mode. Replaces the prior 3-col grid with
 * dots arranged in a hexagon. Three "fun layers" stack:
 *
 *   1. Pointer-push: each dot gently translates away from the cursor when
 *      it gets close, springing back when the cursor leaves. Desktop only —
 *      `pointermove` on touch only fires while a finger is pressed, so
 *      finger-tap UX is unaffected.
 *   2. Pick scale + halo: the tapped dot scales to 1.15× and grows a soft
 *      ring in its own colour.
 *   3. Ripple: a single ring expands from the picked dot over ~600 ms,
 *      fading out. Feels like ink spreading.
 *
 * Game integrity is preserved: the parent (`SwatchRound`) still receives
 * the same `(swatchId, sourceEl, colour)` tuple via `onPick`, fires its
 * existing drip animation, and submits the same guess.
 */

type Swatch = { swatchId: string; css: string };

type RadialPickerProps = {
  // Caller is expected to pass 6 swatches — the existing server contract.
  // If fewer arrive we render what's there; if more, extras are dropped.
  swatches: Swatch[];
  pickedId?: string | null;
  // When non-null, the picker is in "revealed" state — rings appear on
  // the picked + correct dots, others dim.
  correctId?: string | null;
  disabled?: boolean;
  onPick: (swatchId: string, sourceEl: HTMLElement, colour: string) => void;
};

// 6 dots arranged in a hexagon starting at the top (-90°), clockwise.
// Position is expressed as a fraction of the container's half-extent so
// the picker scales with available width.
const HEX_RADIUS_FRACTION = 0.36;
const HEX_ANGLES = Array.from({ length: 6 }, (_, i) => (i / 6) * 2 * Math.PI - Math.PI / 2);

// Pointer-push tuning. Field range = how far the cursor's influence reaches
// (in px from the dot's natural centre). Strength = max displacement.
const PUSH_FIELD_PX = 110;
const PUSH_STRENGTH_PX = 16;

export function RadialPicker({
  swatches,
  pickedId,
  correctId,
  disabled,
  onPick,
}: RadialPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState(0);
  const reducedMotion = useReducedMotion();

  // Pointer offset relative to container centre, in pixels. Stays at (0,0)
  // until the user moves the cursor — so on first paint and on mobile
  // (where pointermove rarely fires without a press) all dots sit at rest.
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);

  // Track container size for the push math. ResizeObserver keeps it in
  // sync across orientation changes / dev-tools resizes.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize(rect.width);
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
      pointerX.set(e.clientX - rect.left - rect.width / 2);
      pointerY.set(e.clientY - rect.top - rect.height / 2);
    };
    window.addEventListener("pointermove", handler);
    return () => window.removeEventListener("pointermove", handler);
  }, [pointerX, pointerY, reducedMotion]);

  const isRevealed = correctId != null;
  const dots = swatches.slice(0, 6);

  return (
    <div ref={containerRef} className="relative mx-auto aspect-square w-full max-w-72">
      {dots.map((swatch, i) => (
        <Dot
          key={swatch.swatchId}
          swatch={swatch}
          angleRad={HEX_ANGLES[i] ?? 0}
          index={i}
          total={dots.length}
          containerSize={containerSize}
          pointerX={pointerX}
          pointerY={pointerY}
          isPicked={pickedId === swatch.swatchId}
          isCorrect={correctId === swatch.swatchId}
          isRevealed={isRevealed}
          disabled={disabled ?? false}
          reducedMotion={reducedMotion ?? false}
          onPick={(el) => onPick(swatch.swatchId, el, swatch.css)}
        />
      ))}
    </div>
  );
}

type DotProps = {
  swatch: Swatch;
  angleRad: number;
  index: number;
  total: number;
  containerSize: number;
  pointerX: MotionValue<number>;
  pointerY: MotionValue<number>;
  isPicked: boolean;
  isCorrect: boolean;
  isRevealed: boolean;
  disabled: boolean;
  reducedMotion: boolean;
  onPick: (el: HTMLElement) => void;
};

function Dot({
  swatch,
  angleRad,
  index,
  total,
  containerSize,
  pointerX,
  pointerY,
  isPicked,
  isCorrect,
  isRevealed,
  disabled,
  reducedMotion,
  onPick,
}: DotProps) {
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  // Natural offset from container centre (in px). Container's half-extent
  // is containerSize/2; the dot's centre lives at HEX_RADIUS_FRACTION of
  // that, projected onto cos/sin.
  const halfExtent = containerSize / 2;
  const naturalX = HEX_RADIUS_FRACTION * halfExtent * cosA;
  const naturalY = HEX_RADIUS_FRACTION * halfExtent * sinA;

  // Pointer-push: project the cursor's offset onto the (dot - cursor)
  // vector. Closer cursor = larger push, capped at PUSH_STRENGTH_PX and
  // zero beyond PUSH_FIELD_PX.
  const pushX = useTransform([pointerX, pointerY], (values) => {
    if (reducedMotion || disabled) return 0;
    const [px, py] = values as number[];
    const dx = naturalX - (px ?? 0);
    const dy = naturalY - (py ?? 0);
    const dist = Math.hypot(dx, dy);
    if (dist === 0 || dist > PUSH_FIELD_PX) return 0;
    const t = 1 - dist / PUSH_FIELD_PX;
    return (dx / dist) * PUSH_STRENGTH_PX * t;
  });
  const pushY = useTransform([pointerX, pointerY], (values) => {
    if (reducedMotion || disabled) return 0;
    const [px, py] = values as number[];
    const dx = naturalX - (px ?? 0);
    const dy = naturalY - (py ?? 0);
    const dist = Math.hypot(dx, dy);
    if (dist === 0 || dist > PUSH_FIELD_PX) return 0;
    const t = 1 - dist / PUSH_FIELD_PX;
    return (dy / dist) * PUSH_STRENGTH_PX * t;
  });

  // Smooth the push with springs — feels like ink suspended in water.
  const springX = useSpring(pushX, { damping: 18, stiffness: 220, mass: 0.6 });
  const springY = useSpring(pushY, { damping: 18, stiffness: 220, mass: 0.6 });

  // Position via percentage so layout scales with container width.
  const leftPct = 50 + HEX_RADIUS_FRACTION * 100 * cosA;
  const topPct = 50 + HEX_RADIUS_FRACTION * 100 * sinA;

  // Visual state hierarchy: picked-correct > picked-wrong > correct-but-unpicked > default
  const dimmed = isRevealed && !isPicked && !isCorrect;
  const showHaloOnPicked = isPicked;

  return (
    <motion.button
      type="button"
      aria-label={`Swatch ${index + 1} of ${total}`}
      onClick={(e) => onPick(e.currentTarget)}
      disabled={disabled}
      whileTap={reducedMotion ? undefined : { scale: 0.94 }}
      animate={{
        scale: isPicked ? 1.15 : 1,
        opacity: dimmed ? 0.45 : 1,
      }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      style={{
        position: "absolute",
        left: `${leftPct}%`,
        top: `${topPct}%`,
        x: "-50%",
        y: "-50%",
        translateX: springX,
        translateY: springY,
        backgroundColor: swatch.css,
      }}
      className={cn(
        "size-14 rounded-full border border-border shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:size-12",
        // Halo: picked-correct green, picked-wrong red, otherwise the
        // dot's own colour (gives a subtle pop on pick).
        showHaloOnPicked &&
          isCorrect &&
          "ring-4 ring-emerald-500 ring-offset-2 ring-offset-background",
        showHaloOnPicked &&
          isRevealed &&
          !isCorrect &&
          "ring-4 ring-destructive ring-offset-2 ring-offset-background",
        showHaloOnPicked &&
          !isRevealed &&
          "ring-4 ring-white/60 ring-offset-2 ring-offset-background",
        // Pulse a faint green ring on the actual correct one if the user missed it.
        isRevealed && !isPicked && isCorrect && "ring-4 ring-emerald-500/60",
      )}
    >
      <AnimatePresence>
        {isPicked && !reducedMotion && <Ripple key="ripple" colour={swatch.css} />}
      </AnimatePresence>
    </motion.button>
  );
}

/**
 * Single 600ms ring that expands from the dot and fades. Mounted once per
 * pick via AnimatePresence; unmounts cleanly on round transition.
 */
function Ripple({ colour }: { colour: string }) {
  return (
    <motion.span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-full"
      initial={{ scale: 1, opacity: 0.55 }}
      animate={{ scale: 2.4, opacity: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      style={{ boxShadow: `0 0 0 3px ${colour}` }}
    />
  );
}

/**
 * Loading skeleton: six dashed-border circles in the same hexagonal
 * arrangement, pulsing. Used while the first round is being fetched.
 */
export function RadialPickerSkeleton() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-72">
      {HEX_ANGLES.map((angle, i) => {
        const leftPct = 50 + HEX_RADIUS_FRACTION * 100 * Math.cos(angle);
        const topPct = 50 + HEX_RADIUS_FRACTION * 100 * Math.sin(angle);
        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: stable skeleton placeholders
            key={i}
            className="absolute size-14 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full border border-dashed border-border/60 bg-muted/40 sm:size-12"
            style={{ left: `${leftPct}%`, top: `${topPct}%` }}
          />
        );
      })}
    </div>
  );
}
