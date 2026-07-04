"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SEEN_KEY = "inklings-tour-v2";
const TOUR_EVENT = "inklings:start-tour";
const MASCOT = 128;

// Routes where the tour auto-starts on a first visit. The landing page is
// excluded on purpose — it explains itself; the guide belongs in the app.
const TOURABLE = ["/inkwell", "/blots", "/quill", "/game", "/authors"];

// Where the mascot stands relative to a spotlit anchor: "below" suits the nav
// tabs, "beside" the Quill's side panels, "inside" full-bleed surfaces like
// the Inkwell canvas (the mascot steps into the spotlight with you).
type Placement = "below" | "beside" | "inside";

type Step = {
  id: string;
  /** Page this step lives on; the guide navigates there if needed. */
  route?: string;
  /** data-tour value of the element to spotlight. */
  anchor?: string;
  placement?: Placement;
  title: string;
  body: string;
  /** Where the mascot stands (viewport fractions) when no anchor is visible. */
  fallback: { fx: number; fy: number };
};

const STEPS = [
  {
    id: "hello",
    title: "Oh! Hello there.",
    body: "I'm your inkling — a well-read drop of ink. Around here we believe every writer bleeds a color: their rhythm, their vocabulary, their mood, all mixed into one hue. Come along, I'll take you through the place myself.",
    fallback: { fx: 0.5, fy: 0.38 },
  },
  {
    id: "inkwell-canvas",
    route: "/inkwell",
    anchor: "inkwell-canvas",
    placement: "inside",
    title: "The Inkwell",
    body: "Welcome to the heart of it all. Every blot around us is a whole book — its hue is the tone of the prose, its silhouette the author's fingerprint, and books that read alike drift close together. Click any blot and its story opens beside the canvas.",
    fallback: { fx: 0.5, fy: 0.4 },
  },
  {
    id: "inkwell-controls",
    route: "/inkwell",
    anchor: "inkwell-controls",
    title: "Change the light",
    body: "These switches re-hang the whole gallery. Lay the blots out by classical stylometry or modern embeddings, and choose whose colour-reading you trust — the algorithm, the machine mind, the crowd, or a blend of all three.",
    fallback: { fx: 0.62, fy: 0.32 },
  },
  {
    id: "blots-grid",
    route: "/blots",
    anchor: "blots-grid",
    placement: "inside",
    title: "The Blots",
    body: "Every book keeps a portrait card in here, and each one wears its colour four ways — algorithm, machine mind, crowd, and blend. When the four readings disagree, that's where the good questions start.",
    fallback: { fx: 0.5, fy: 0.42 },
  },
  {
    id: "blots-search",
    route: "/blots",
    anchor: "blots-search",
    title: "Find your book",
    body: "Search by title or author — or flip to Vibe and describe a mood instead. And when two fingerprints intrigue you, Compare holds them side by side.",
    fallback: { fx: 0.4, fy: 0.35 },
  },
  {
    id: "quill-editor",
    route: "/quill",
    anchor: "quill-editor",
    placement: "beside",
    title: "The Quill",
    body: "My favourite room — where ink meets page. Write a paragraph or two here; the more you give me, the truer your colour reads.",
    fallback: { fx: 0.5, fy: 0.38 },
  },
  {
    id: "quill-hue",
    route: "/quill",
    anchor: "quill-hue",
    placement: "beside",
    title: "Your hue, live",
    body: "While you write, your prose distills into a single hue over here — paragraph by paragraph, with the why behind it. Watch it drift as your sentences change their mind.",
    fallback: { fx: 0.32, fy: 0.4 },
  },
  {
    id: "quill-target",
    route: "/quill",
    anchor: "quill-target",
    placement: "beside",
    title: "Chase a colour",
    body: "Fancy writing in another author's ink? Mix a target colour, set how hard to push, and I'll nudge your words toward it — you choose which suggestions stick.",
    fallback: { fx: 0.68, fy: 0.4 },
  },
  {
    id: "finale",
    title: "The rest is yours",
    body: "That's the tour — anything I skipped is yours to discover, and you can fetch me again from the bottom of any page. Now go make some ink of your own.",
    fallback: { fx: 0.5, fy: 0.38 },
  },
] as const satisfies readonly Step[];

type Point = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };
type Print = { id: string; x: number; y: number; rot: number; delay: number };

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function onRoute(route: string | undefined) {
  if (!route) return true;
  const p = window.location.pathname;
  return p === route || p.startsWith(`${route}/`);
}

/** Poll until the step's page and anchor exist (or the timeout passes). */
async function waitForStepReady(step: Step, timeoutMs: number) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    const anchorReady = !step.anchor || !!document.querySelector(`[data-tour="${step.anchor}"]`);
    if (onRoute(step.route) && anchorReady) return;
    await sleep(140);
  }
}

/** Resolve where the mascot stands (top-left) and what to spotlight for a step. */
function measure(step: Step, vw: number, vh: number): { x: number; y: number; box: Box | null } {
  if (step.anchor) {
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
    const r = el?.getBoundingClientRect();
    if (r && r.width > 0 && r.bottom > 90 && r.top < vh - 150) {
      // Clamp tall/wide anchors (canvas, card grid) to the visible viewport.
      const bx = Math.max(r.left, 8);
      const by = Math.max(r.top, 60);
      const bw = Math.min(r.right, vw - 8) - bx;
      const bh = Math.min(r.bottom, vh - 10) - by;
      if (bw > 24 && bh > 24) {
        const box = { x: bx, y: by, w: bw, h: bh };
        const placement = step.placement ?? "below";
        if (placement === "inside") {
          const cx = clamp(bx + bw / 2, MASCOT / 2 + 16, vw - MASCOT / 2 - 16);
          return { x: cx - MASCOT / 2, y: clamp(by + bh * 0.2, 60, vh - 440), box };
        }
        if (placement === "beside") {
          const y = clamp(by + bh / 2 - MASCOT / 2, 12, vh - 430);
          if (vw - (bx + bw) >= MASCOT + 36) return { x: bx + bw + 18, y, box };
          if (bx >= MASCOT + 36) return { x: bx - MASCOT - 18, y, box };
        }
        const cx = clamp(bx + bw / 2, MASCOT / 2 + 16, vw - MASCOT / 2 - 16);
        return { x: cx - MASCOT / 2, y: Math.min(by + bh + 20, vh - 430), box };
      }
    }
  }
  const cx = clamp(vw * step.fallback.fx, MASCOT / 2 + 16, vw - MASCOT / 2 - 16);
  const cy = vh * step.fallback.fy;
  return { x: cx - MASCOT / 2, y: clamp(cy - MASCOT / 2, 12, Math.max(vh - 400, 80)), box: null };
}

/** Sneaker-sized ink splats along the walking path, alternating left/right foot. */
function makePrints(from: Point, to: Point, duration: number): Print[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 48 || duration === 0) return [];
  const n = clamp(Math.round(dist / 90), 2, 8);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const px = -dy / dist;
  const py = dx / dist;
  return Array.from({ length: n }, (_, i) => {
    const t = (i + 0.5) / n;
    const side = i % 2 === 0 ? 1 : -1;
    return {
      id: `${Math.round(to.x)}:${Math.round(to.y)}:${i}`,
      x: from.x + dx * t + MASCOT / 2 + px * side * 10 - 5,
      y: from.y + dy * t + MASCOT - 12 + py * side * 10,
      rot: angle + 90 + side * 12,
      delay: t * duration,
    };
  });
}

export function StartingGuide() {
  const pathname = usePathname();
  const router = useRouter();
  const reduced = useReducedMotion() ?? false;

  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<"walking" | "talking">("walking");
  const [pos, setPos] = useState<Point>({ x: 0, y: 0 });
  const [walk, setWalk] = useState({ duration: 0, facing: 1 });
  const [anchorBox, setAnchorBox] = useState<Box | null>(null);
  const [prints, setPrints] = useState<Print[]>([]);
  const [vp, setVp] = useState({ w: 0, h: 0 });

  const posRef = useRef<Point>({ x: 0, y: 0 });
  const enterRef = useRef<Point>({ x: 0, y: 0 });
  const bubbleRef = useRef<HTMLDivElement>(null);
  // Monotonic sequence: any newer walk/close invalidates in-flight ones.
  const seqRef = useRef(0);

  const moveMascot = useCallback(
    (target: Point, opts?: { instant?: boolean }) => {
      const from = posRef.current;
      const dist = Math.hypot(target.x - from.x, target.y - from.y);
      const duration = reduced || opts?.instant ? 0 : clamp(dist / 340, 0.6, 1.7);
      setWalk({ duration, facing: target.x >= from.x - 1 ? 1 : -1 });
      setPos({ x: target.x, y: target.y });
      setPrints(makePrints(from, target, duration));
      posRef.current = { x: target.x, y: target.y };
      return duration;
    },
    [reduced],
  );

  const walkTo = useCallback(
    async (index: number, opts?: { instant?: boolean }) => {
      const seq = ++seqRef.current;
      const step: Step = STEPS[index] ?? STEPS[0];
      setVp({ w: window.innerWidth, h: window.innerHeight });
      setStepIndex(index);
      setPhase("walking");

      if (step.route && !onRoute(step.route)) {
        // Lead the way: stroll to that page's nav tab while the page loads
        // underneath, then continue down to the feature itself.
        setAnchorBox(null);
        router.push(step.route);
        const tab = document.querySelector<HTMLElement>(`[data-tour="tab-${step.route.slice(1)}"]`);
        const tr = tab?.getBoundingClientRect();
        if (tr && tr.width > 0 && !reduced && !opts?.instant) {
          const vw = window.innerWidth;
          const cx = clamp(tr.left + tr.width / 2, MASCOT / 2 + 16, vw - MASCOT / 2 - 16);
          const leg = moveMascot({ x: cx - MASCOT / 2, y: tr.bottom + 20 });
          await sleep(leg * 1000 + 60);
          if (seq !== seqRef.current) return;
        }
        await waitForStepReady(step, 8000);
        await sleep(90); // let the new page paint before measuring
        if (seq !== seqRef.current) return;
      }

      const target = measure(step, window.innerWidth, window.innerHeight);
      setAnchorBox(target.box);
      const duration = moveMascot(target, opts);
      window.setTimeout(
        () => {
          if (seq === seqRef.current) setPhase("talking");
        },
        duration * 1000 + 60,
      );
    },
    [moveMascot, router, reduced],
  );

  const start = useCallback(() => {
    if (open) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const firstStop = measure(STEPS[0], vw, vh);
    // Enter walking in from beyond the left edge, at the same height.
    const entry = { x: -MASCOT * 1.4, y: firstStop.y };
    enterRef.current = entry;
    posRef.current = entry;
    setVp({ w: vw, h: vh });
    setOpen(true);
    void walkTo(0);
  }, [open, walkTo]);

  const close = useCallback(() => {
    seqRef.current += 1; // invalidate any in-flight walk
    try {
      localStorage.setItem(SEEN_KEY, new Date().toISOString());
    } catch {
      // Private mode — the tour will simply offer itself again next visit.
    }
    setOpen(false);
  }, []);

  // Auto-start once, on the first visit to any app surface.
  useEffect(() => {
    if (open) return;
    if (!TOURABLE.some((r) => pathname === r || pathname.startsWith(`${r}/`))) return;
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(SEEN_KEY);
    } catch {
      return;
    }
    if (seen) return;
    const t = setTimeout(start, 900);
    return () => clearTimeout(t);
  }, [pathname, open, start]);

  // Replay on demand (footer button, or anything that dispatches the event).
  useEffect(() => {
    const onEvent = () => start();
    window.addEventListener(TOUR_EVENT, onEvent);
    return () => window.removeEventListener(TOUR_EVENT, onEvent);
  }, [start]);

  // Keep the page still underneath, and the mascot in step with the viewport.
  useEffect(() => {
    if (!open) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => void walkTo(stepIndex, { instant: true });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, stepIndex, walkTo]);

  useEffect(() => {
    if (open && phase === "talking") bubbleRef.current?.focus({ preventScroll: true });
  }, [open, phase]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (phase !== "talking") return;
      if (e.key === "ArrowRight" && stepIndex < STEPS.length - 1) {
        e.preventDefault();
        void walkTo(stepIndex + 1);
      } else if (e.key === "ArrowLeft" && stepIndex > 0) {
        e.preventDefault();
        void walkTo(stepIndex - 1);
      } else if (e.key === "Tab") {
        // Minimal focus trap: cycle within the speech bubble.
        const root = bubbleRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!first || !last) return;
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || !root.contains(active)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, phase, stepIndex, close, walkTo]);

  const step: Step = STEPS[stepIndex] ?? STEPS[0];
  const isLast = stepIndex === STEPS.length - 1;

  // Speech bubble geometry: centered under the mascot, clamped to the viewport.
  const bubbleW = Math.min(392, Math.max(vp.w - 32, 260));
  const bubbleX = clamp(pos.x + MASCOT / 2 - bubbleW / 2, 16, Math.max(vp.w - bubbleW - 16, 16));
  const bubbleY = pos.y + MASCOT + 18;
  const tailX = clamp(pos.x + MASCOT / 2 - bubbleX - 8, 20, bubbleW - 36);

  // Spotlight hole. Without an anchor it flies off the top edge, closed,
  // so the scrim smoothly swallows the previous highlight.
  const pad = 7;
  const hole = anchorBox
    ? {
        x: anchorBox.x - pad,
        y: anchorBox.y - pad,
        w: anchorBox.w + pad * 2,
        h: anchorBox.h + pad * 2,
      }
    : { x: vp.w / 2, y: -240, w: 0, h: 0 };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="starting-guide"
          className="fixed inset-0 z-[100] overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
        >
          {/* Ink scrim with a spotlight cutout that morphs between anchors. */}
          <motion.div
            aria-hidden="true"
            className="absolute top-0 left-0"
            initial={false}
            animate={{ x: hole.x, y: hole.y, width: hole.w, height: hole.h }}
            transition={{
              duration: Math.max(walk.duration * 0.85, 0.35),
              ease: [0.4, 0.08, 0.6, 0.92],
            }}
            style={{
              borderRadius: 12,
              boxShadow: `0 0 0 1.5px oklch(0.98 0.01 90 / ${anchorBox ? 0.7 : 0}), 0 0 26px 7px oklch(0.62 0.2 295 / ${anchorBox ? 0.45 : 0}), 0 0 0 200vmax oklch(0.14 0.03 292 / 0.62)`,
            }}
          />

          {/* Ink footprints left behind while walking. */}
          {prints.map((p) => (
            <motion.div
              key={p.id}
              aria-hidden="true"
              className="pointer-events-none absolute top-0 left-0"
              initial={{ opacity: 0, scale: 0.3 }}
              animate={{ opacity: [0, 0.75, 0.55, 0], scale: [0.3, 1, 1, 1] }}
              transition={{ delay: p.delay, duration: 2.4, times: [0, 0.12, 0.55, 1] }}
              style={{ x: p.x, y: p.y, rotate: p.rot }}
            >
              <div
                className="h-3.5 w-2.5"
                style={{
                  background: "oklch(0.5 0.22 292 / 0.85)",
                  borderRadius: "52% 48% 46% 54% / 62% 58% 42% 38%",
                }}
              />
            </motion.div>
          ))}

          {/* The guide itself: walks between stops, waddling as it goes. */}
          <motion.div
            className="absolute top-0 left-0 will-change-transform"
            initial={{ x: enterRef.current.x, y: enterRef.current.y }}
            animate={{ x: pos.x, y: pos.y }}
            transition={{ duration: walk.duration, ease: [0.4, 0.08, 0.6, 0.92] }}
            style={{ width: MASCOT, height: MASCOT }}
          >
            <div
              aria-hidden="true"
              className={cn(
                "absolute -inset-5 rounded-full bg-[oklch(0.62_0.2_295/0.35)] blur-2xl transition-opacity duration-500",
                phase === "talking" ? "opacity-80" : "opacity-30",
              )}
            />
            <motion.div
              aria-hidden="true"
              className="absolute bottom-0 left-1/2 h-3 w-20 -translate-x-1/2 rounded-full bg-black/25 blur-[6px] dark:bg-black/45"
              animate={
                phase === "walking" && !reduced
                  ? { scaleX: [1, 0.68, 1, 0.68, 1], opacity: [0.5, 0.28, 0.5, 0.28, 0.5] }
                  : { scaleX: 1, opacity: 0.45 }
              }
              transition={
                phase === "walking" && !reduced
                  ? { duration: 0.55, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.3 }
              }
            />
            <motion.div
              className="relative"
              animate={phase === "walking" && !reduced ? "walk" : "idle"}
              variants={{
                walk: {
                  rotate: [0, -9, 0, 9, 0],
                  y: [0, -11, -1, -11, 0],
                  scaleY: 1,
                  transition: { duration: 0.55, repeat: Infinity, ease: "easeInOut" },
                },
                idle: reduced
                  ? { rotate: 0, y: 0, scaleY: 1 }
                  : {
                      rotate: 0,
                      // Land with a little squash, then settle into a slow bob.
                      y: [0, -6, 0],
                      scaleY: [0.88, 1.06, 1],
                      transition: {
                        rotate: { duration: 0.2 },
                        scaleY: { duration: 0.5, ease: "easeOut" },
                        y: { duration: 3.4, repeat: Infinity, ease: "easeInOut", delay: 0.5 },
                      },
                    },
              }}
              style={{ transformOrigin: "50% 100%" }}
            >
              <motion.div animate={{ scaleX: walk.facing }} transition={{ duration: 0.25 }}>
                <Image
                  src="/inkling-mascot-no-background.png"
                  alt=""
                  width={MASCOT}
                  height={MASCOT}
                  priority
                  draggable={false}
                  className="pointer-events-none select-none drop-shadow-[0_18px_28px_rgba(70,30,160,0.35)]"
                />
              </motion.div>
            </motion.div>
          </motion.div>

          {/* Speech bubble — appears once the mascot has arrived. */}
          <AnimatePresence mode="wait">
            {phase === "talking" && (
              <motion.div
                key={step.id}
                ref={bubbleRef}
                role="dialog"
                aria-modal="true"
                aria-label={`${step.title} — tour step ${stepIndex + 1} of ${STEPS.length}`}
                tabIndex={-1}
                initial={{ opacity: 0, y: 14, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97, transition: { duration: 0.18 } }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                className="absolute rounded-2xl border border-border bg-card/95 shadow-2xl outline-none backdrop-blur-md"
                style={{
                  left: bubbleX,
                  top: bubbleY,
                  width: bubbleW,
                  maxHeight: Math.max(vp.h - bubbleY - 12, 140),
                  overflowY: "auto",
                  transformOrigin: `${tailX + 8}px -12px`,
                }}
              >
                <div
                  aria-hidden="true"
                  className="absolute -top-2 size-4 rotate-45 rounded-[3px] border-t border-l border-border bg-card"
                  style={{ left: tailX }}
                />
                <div className="relative p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                      Your inkling · {stepIndex + 1} of {STEPS.length}
                    </p>
                    <button
                      type="button"
                      onClick={close}
                      className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      Skip tour
                    </button>
                  </div>
                  <h2 className="mt-1.5 font-display text-xl tracking-tight text-ink-deep">
                    {step.title}
                  </h2>
                  {reduced ? (
                    <p className="mt-2 font-serif text-[15px] leading-relaxed text-muted-foreground">
                      {step.body}
                    </p>
                  ) : (
                    <>
                      <p
                        aria-hidden="true"
                        className="mt-2 font-serif text-[15px] leading-relaxed text-muted-foreground"
                      >
                        {step.body.split(" ").map((word, i) => (
                          <motion.span
                            // Words never reorder within a step; index is stable.
                            // biome-ignore lint/suspicious/noArrayIndexKey: static text
                            key={`${step.id}-${i}`}
                            className="inline-block"
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 + i * 0.016, duration: 0.22, ease: "easeOut" }}
                          >
                            {word}&nbsp;
                          </motion.span>
                        ))}
                      </p>
                      <p className="sr-only">{step.body}</p>
                    </>
                  )}
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5" aria-hidden="true">
                      {STEPS.map((s, i) => (
                        <button
                          key={s.id}
                          type="button"
                          tabIndex={-1}
                          onClick={() => void walkTo(i)}
                          className={cn(
                            "size-2 rounded-full transition-all",
                            i === stepIndex
                              ? "scale-125 bg-ink-bleed"
                              : "bg-muted-foreground/25 hover:bg-muted-foreground/50",
                          )}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {stepIndex > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void walkTo(stepIndex - 1)}
                        >
                          Back
                        </Button>
                      )}
                      {isLast ? (
                        <Button size="sm" onClick={close}>
                          Start exploring
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => void walkTo(stepIndex + 1)}>
                          Next
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Footer affordance to re-run the guide after it has been dismissed. */
export function ReplayTourButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}
    >
      Replay the tour
    </button>
  );
}
