"use client";

import { useReducedMotion } from "motion/react";
import { useCallback } from "react";

/**
 * One-shot border pulse for Twin-mode submit feedback. No chosen colour
 * to drip in Twin mode (the player picks "same" or "different", not a
 * hue), so this is the affordance: the clicked button breathes once with
 * a soft outward ring.
 *
 * Implemented via the Web Animations API directly rather than Motion's
 * declarative model — a 400 ms one-shot doesn't earn the React state
 * round-trip.
 */
export function usePulseTrigger() {
  const reducedMotion = useReducedMotion();
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el || reducedMotion) return;
      // Neutral pulse colour — the Twin verdict isn't tinted by user
      // choice (same/different is binary, no hue picked).
      el.animate(
        [
          { boxShadow: "0 0 0 0 rgba(80, 80, 110, 0.45)" },
          { boxShadow: "0 0 0 14px rgba(80, 80, 110, 0)" },
        ],
        { duration: 400, easing: "ease-out" },
      );
    },
    [reducedMotion],
  );
}
