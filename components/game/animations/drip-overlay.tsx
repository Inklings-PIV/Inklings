"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from "react";

/**
 * Falling-drop overlay for the game's submit feedback.
 *
 * Caller passes the source element (the clicked swatch / wheel marker),
 * the target element (the smudge card), and the chosen colour. The
 * provider portals a small disc of that colour at the source position,
 * animates it falling toward the target with a scale + opacity fade, and
 * unmounts on done. Multiple drips can be in flight at once.
 *
 * The provider lives at the app root (components/providers.tsx) so any
 * page can call useDripTrigger() without wiring a local provider.
 */

type Drip = {
  id: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  colour: string;
};

type Trigger = (source: HTMLElement, target: HTMLElement, colour: string) => void;

const DripContext = createContext<Trigger>(() => {
  // Noop default — components calling useDripTrigger render fine without
  // the provider; the drip just doesn't fire.
});

const DRIP_SIZE = 14;

export function DripProvider({ children }: { children: ReactNode }) {
  const [drips, setDrips] = useState<Drip[]>([]);
  const idRef = useRef(0);

  const trigger = useCallback<Trigger>((source, target, colour) => {
    const s = source.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    const id = ++idRef.current;
    setDrips((prev) => [
      ...prev,
      {
        id,
        fromX: s.left + s.width / 2,
        fromY: s.top + s.height / 2,
        toX: t.left + t.width / 2,
        toY: t.top + t.height / 2,
        colour,
      },
    ]);
  }, []);

  const remove = useCallback(
    (id: number) => setDrips((prev) => prev.filter((d) => d.id !== id)),
    [],
  );

  return (
    <DripContext.Provider value={trigger}>
      {children}
      <DripOverlay drips={drips} onDone={remove} />
    </DripContext.Provider>
  );
}

function DripOverlay({ drips, onDone }: { drips: Drip[]; onDone: (id: number) => void }) {
  const reducedMotion = useReducedMotion();
  return (
    <AnimatePresence>
      {drips.map((d) => (
        <motion.div
          key={d.id}
          aria-hidden="true"
          initial={{
            x: d.fromX - DRIP_SIZE / 2,
            y: d.fromY - DRIP_SIZE / 2,
            opacity: 1,
            scale: 1,
          }}
          animate={
            reducedMotion
              ? { opacity: 0 }
              : {
                  x: d.toX - DRIP_SIZE / 2,
                  y: d.toY - DRIP_SIZE / 2,
                  opacity: 0,
                  scale: 0.35,
                }
          }
          transition={{ duration: reducedMotion ? 0.01 : 0.4, ease: "easeIn" }}
          onAnimationComplete={() => onDone(d.id)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: DRIP_SIZE,
            height: DRIP_SIZE,
            borderRadius: "50%",
            backgroundColor: d.colour,
            pointerEvents: "none",
            zIndex: 60,
            boxShadow: "0 0 8px rgba(0, 0, 0, 0.25)",
          }}
        />
      ))}
    </AnimatePresence>
  );
}

export function useDripTrigger(): Trigger {
  return useContext(DripContext);
}
