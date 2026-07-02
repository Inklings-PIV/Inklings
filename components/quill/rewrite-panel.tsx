"use client";

import {
  BookOpen,
  Brush,
  Check,
  ChevronDown,
  Loader2,
  Palette,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import {
  ALL_PIGMENTS,
  blendHues,
  type CapturedHue,
  type CustomSwatch,
  capturedHueCss,
  colourCssOf,
  HUE_CAPTURE_MIME,
  mixPhrase,
} from "@/components/quill/colour-drop";
import { COLOUR_DROP_MIME } from "@/components/quill/editor";
import { TargetWidgets } from "@/components/quill/target-widgets";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { hueFromHSL } from "@/lib/colour/placeholder";
import type { WidgetSelection } from "@/lib/quill/widgets";
import { cn } from "@/lib/utils";

const INTENSITY_LABELS: Record<number, string> = {
  1: "Whisper",
  2: "Subtle",
  3: "Moderate",
  4: "Bold",
  5: "Full",
};

const BRUSH_LABELS: Record<number, string> = {
  1: "Sentence",
  3: "Passage",
  7: "Whole draft",
};

// Brush = how much prose a colour drop covers when there is no selected text.
// Selection always wins over this; it only governs a drop point.
const BRUSH_SIZES = [1, 3, 7] as const;

function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/**
 * The fused rewrite widget. Colour and Words are separate accordion sections
 * controlled by the page's right rail state. Colour is optional; dragging a
 * swatch onto the prose is the quick gesture, while tapping one folds it into
 * the composed target.
 */
export function RewritePanel({
  openPanel,
  onOpenPanelChange,
  selectedColour,
  onToggleColour,
  customSwatches,
  onAddHue,
  onReplaceHue,
  onRemoveSwatch,
  onCaptureText,
  brushSize,
  onBrushChange,
  selection,
  onWidgetChange,
  target,
  onTargetChange,
  composedTarget,
  intensity,
  onIntensityChange,
  wordCount,
  onRequest,
  isPending,
  hasRewrite,
  selectionText,
  onClearSelection,
  error,
}: {
  openPanel: "colour" | "words" | null;
  onOpenPanelChange: (panel: "colour" | "words" | null) => void;
  selectedColour: string | null;
  onToggleColour: (key: string) => void;
  customSwatches: CustomSwatch[];
  onAddHue: (hue: CapturedHue) => void;
  onReplaceHue: (id: string, hue: CapturedHue) => void;
  onRemoveSwatch: (id: string) => void;
  onCaptureText: (text: string, targetId?: string) => void;
  brushSize: number;
  onBrushChange: (n: number) => void;
  selection: WidgetSelection;
  onWidgetChange: (key: string, value: string | null) => void;
  target: string;
  onTargetChange: (s: string) => void;
  composedTarget: string;
  intensity: number;
  onIntensityChange: (n: number) => void;
  wordCount: number;
  onRequest: () => void;
  isPending: boolean;
  hasRewrite: boolean;
  selectionText: string | null;
  onClearSelection: () => void;
  error: string | null;
}) {
  const colourOpen = openPanel === "colour";
  const wordsOpen = openPanel === "words";

  // Mix mode: the beaker is open and grid taps add parts instead of toggling the
  // target. `recipe` is parts keyed by pigment key / custom-swatch id; `pour`
  // retriggers the falling-droplet animation (token bump) in the tapped colour.
  const [mixOpen, setMixOpen] = useState(false);
  const [recipe, setRecipe] = useState<Record<string, number>>({});
  const [pour, setPour] = useState<{ token: number; css: string }>({ token: 0, css: "" });

  // Every source you can pour a part of: the predefined pigments + your own
  // swatches. Keyed uniformly so the recipe and blend treat them the same.
  const mixSources = useMemo(
    () => [
      ...ALL_PIGMENTS.map((c) => ({
        key: c.key,
        hsl: c.hsl,
        phrase: c.target,
        css: colourCssOf(c),
      })),
      ...customSwatches.map((w) => ({
        key: w.id,
        hsl: w.hsl,
        phrase: w.phrase,
        css: capturedHueCss(w),
      })),
    ],
    [customSwatches],
  );

  const addPart = (key: string) => {
    const src = mixSources.find((s) => s.key === key);
    if (!src) return;
    setRecipe((r) => ({ ...r, [key]: (r[key] ?? 0) + 1 }));
    setPour((p) => ({ token: p.token + 1, css: src.css }));
  };
  const removePart = (key: string) =>
    setRecipe((r) => {
      const n = (r[key] ?? 0) - 1;
      const next = { ...r };
      if (n <= 0) delete next[key];
      else next[key] = n;
      setPour({ token: 0, css: "" });
      return next;
    });

  const mixEntries = mixSources.filter((s) => (recipe[s.key] ?? 0) > 0);
  const blend = blendHues(mixEntries.map((s) => ({ hsl: s.hsl, weight: recipe[s.key] ?? 0 })));
  const mixWords = mixPhrase(
    mixEntries.map((s) => ({ phrase: s.phrase, parts: recipe[s.key] ?? 0 })),
  );
  const totalParts = mixEntries.reduce((n, s) => n + (recipe[s.key] ?? 0), 0);
  const blendCss = blend ? hueFromHSL(blend.hue, blend.saturation, blend.lightness).css : undefined;

  const startMix = () => setMixOpen(true);
  const closeMix = () => {
    setRecipe({});
    setMixOpen(false);
  };
  const acceptMix = () => {
    if (blend) onAddHue({ hsl: blend, phrase: mixWords });
    closeMix();
  };
  const onTap = (key: string) => (mixOpen ? addPart(key) : onToggleColour(key));

  const effectiveWordCount = selectionText ? countWords(selectionText) : wordCount;
  const canAsk = effectiveWordCount >= 3 && composedTarget.trim().length > 0 && !isPending;
  const buttonLabel = selectionText
    ? "Nudge selection"
    : hasRewrite
      ? "Try another nudge"
      : "Suggest a nudge";
  const brushIndex = brushSize <= 1 ? 0 : brushSize <= 3 ? 1 : 2;

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-2.5 p-4">
          <SectionHeader
            label="Colour"
            description="Tap a colour to set the target. Drag it onto a sentence, passage, or selection."
            icon={<Palette className="size-4" />}
            open={colourOpen}
            onToggle={() => onOpenPanelChange(colourOpen ? null : "colour")}
          />
          {colourOpen && (
            <>
              <SwatchGrid
                customSwatches={customSwatches}
                selectedColour={selectedColour}
                mixOpen={mixOpen}
                recipe={recipe}
                onTap={onTap}
                onRemovePart={removePart}
                onStartMix={startMix}
                onRemoveSwatch={onRemoveSwatch}
                onReplaceHue={onReplaceHue}
                onAddHue={onAddHue}
                onCaptureText={onCaptureText}
              />
              {mixOpen && (
                <Beaker
                  fillCss={blendCss}
                  totalParts={totalParts}
                  phrase={mixWords}
                  pour={pour}
                  canPour={!!blend}
                  onAccept={acceptMix}
                  onCancel={closeMix}
                />
              )}
              <div className="flex flex-col gap-1.5 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <Brush className="size-3.5" />
                    Brush range
                  </span>
                  <span className="text-xs text-ink-bleed">{BRUSH_LABELS[brushSize]}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={BRUSH_SIZES.length - 1}
                  step={1}
                  value={brushIndex}
                  onChange={(e) => onBrushChange(BRUSH_SIZES[Number(e.target.value)] ?? 3)}
                  className="w-full accent-ink-bleed"
                  aria-label="Brush range"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Small</span>
                  <span>Big</span>
                </div>
              </div>
              <p className="text-[11px] italic leading-snug text-muted-foreground">
                Brush range controls how much prose is affected when no text is selected. Use{" "}
                <Plus className="inline size-3" /> to mix or capture a hue.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-2.5 p-4">
          <SectionHeader
            label="Words"
            description="Build a target in words, then nudge when ready."
            icon={<BookOpen className="size-4" />}
            open={wordsOpen}
            onToggle={() => onOpenPanelChange(wordsOpen ? null : "words")}
          />
          {wordsOpen && (
            <>
              <TargetWidgets selection={selection} onChange={onWidgetChange} />
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  In your own words (optional)
                </span>
                <input
                  type="text"
                  value={target}
                  onChange={(e) => onTargetChange(e.target.value)}
                  placeholder="warm, melancholy · Hemingway-like · lush"
                  className="h-9 rounded-md border border-border bg-card px-3 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40 focus:outline-none"
                />
              </label>
              <div className="border-t border-border/60" />
              <div className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    intensity
                  </span>
                  <span className="text-xs text-ink-bleed">{INTENSITY_LABELS[intensity]}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={intensity}
                  onChange={(e) => onIntensityChange(Number(e.target.value))}
                  className="w-full accent-ink-bleed"
                  aria-label="Rewrite intensity"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Whisper</span>
                  <span>Full</span>
                </div>
              </div>
              {selectionText && (
                <div className="flex items-center gap-1 rounded-md bg-ink-bleed/10 px-2 py-1 text-[11px] text-ink-bleed">
                  <span className="min-w-0 flex-1 truncate italic">
                    &ldquo;
                    {selectionText.length > 48 ? `${selectionText.slice(0, 48)}…` : selectionText}
                    &rdquo;
                  </span>
                  <button
                    type="button"
                    aria-label="Clear selection"
                    onClick={onClearSelection}
                    className="shrink-0 rounded p-0.5 hover:bg-ink-bleed/20 transition-colors"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              )}
              <Button
                size="sm"
                variant={canAsk ? "default" : "outline"}
                onClick={onRequest}
                disabled={!canAsk}
                className={cn(
                  "w-full",
                  canAsk && "bg-ink-bleed text-ink-paper hover:bg-ink-bleed/90",
                  canAsk && "cursor-pointer",
                )}
              >
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {buttonLabel}
              </Button>
              {isPending && (
                <p className="text-[11px] italic text-muted-foreground">Claude is rewriting…</p>
              )}
              {error && <p className="text-[11px] italic text-destructive">{error}</p>}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function SectionHeader({
  label,
  description,
  icon,
  open,
  onToggle,
}: {
  label: string;
  description: string;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 gap-2">
        <span className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-[10px] tracking-widest text-muted-foreground uppercase">{label}</h2>
          <p className="mt-1 text-[11px] italic leading-snug text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
        onClick={onToggle}
        className="shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-all hover:bg-muted/60 hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
        />
      </button>
    </div>
  );
}

/** The unified swatch grid — predefined pigments and the writer's own swatches
 *  with no separation, then a + to mix a new one. Six per row. Out of mix mode a
 *  tap folds the colour into the target; in mix mode a tap pours a part. */
function SwatchGrid({
  customSwatches,
  selectedColour,
  mixOpen,
  recipe,
  onTap,
  onRemovePart,
  onStartMix,
  onRemoveSwatch,
  onReplaceHue,
  onAddHue,
  onCaptureText,
}: {
  customSwatches: CustomSwatch[];
  selectedColour: string | null;
  mixOpen: boolean;
  recipe: Record<string, number>;
  onTap: (key: string) => void;
  onRemovePart: (key: string) => void;
  onStartMix: () => void;
  onRemoveSwatch: (id: string) => void;
  onReplaceHue: (id: string, hue: CapturedHue) => void;
  onAddHue: (hue: CapturedHue) => void;
  onCaptureText: (text: string, targetId?: string) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {ALL_PIGMENTS.map((c) => (
        <div key={c.key} className="flex items-center justify-center">
          <Swatch
            css={colourCssOf(c)}
            dragKey={c.key}
            title={`${c.label} — ${c.target}. Drag onto a word${
              mixOpen ? ", or tap to add a part" : ", or tap to add to the target"
            }.`}
            ariaLabel={`${c.label}: ${c.target}`}
            active={!mixOpen && selectedColour === c.key}
            badge={mixOpen ? recipe[c.key] : undefined}
            onToggle={() => onTap(c.key)}
            onRemovePart={mixOpen ? () => onRemovePart(c.key) : undefined}
          />
        </div>
      ))}
      {customSwatches.map((w) => (
        <CustomCell
          key={w.id}
          swatch={w}
          selectedColour={selectedColour}
          mixOpen={mixOpen}
          recipe={recipe}
          onTap={onTap}
          onRemovePart={onRemovePart}
          onRemoveSwatch={onRemoveSwatch}
          onReplaceHue={onReplaceHue}
          onCaptureText={onCaptureText}
        />
      ))}
      <PlusCell
        mixOpen={mixOpen}
        onStartMix={onStartMix}
        onAddHue={onAddHue}
        onCaptureText={onCaptureText}
      />
    </div>
  );
}

/** Shared drop handling for swatches that accept a captured hue — a precomputed
 *  hue from the Hue band (JSON) or a raw text selection to derive one from. */
function useHueDrop(onHue: (h: CapturedHue) => void, onText: (t: string) => void) {
  const [over, setOver] = useState(false);
  const onDragOver = (e: React.DragEvent) => {
    const t = e.dataTransfer.types;
    if (t.includes(HUE_CAPTURE_MIME) || t.includes("text/plain")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy"; // copy, so a dragged editor selection isn't moved out
      setOver(true);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    setOver(false);
    const raw = e.dataTransfer.getData(HUE_CAPTURE_MIME);
    if (raw) {
      e.preventDefault();
      try {
        onHue(JSON.parse(raw) as CapturedHue);
      } catch {
        // Ignore a malformed payload — nothing to capture.
      }
      return;
    }
    const text = e.dataTransfer.getData("text/plain").trim();
    if (text) {
      e.preventDefault();
      onText(text);
    }
  };
  return { over, handlers: { onDragOver, onDragLeave: () => setOver(false), onDrop } };
}

/** A custom swatch cell — a swatch with a remove button, that also accepts a hue
 *  or text drop to replace its hue (the same capture gesture, per swatch). */
function CustomCell({
  swatch,
  selectedColour,
  mixOpen,
  recipe,
  onTap,
  onRemovePart,
  onRemoveSwatch,
  onReplaceHue,
  onCaptureText,
}: {
  swatch: CustomSwatch;
  selectedColour: string | null;
  mixOpen: boolean;
  recipe: Record<string, number>;
  onTap: (key: string) => void;
  onRemovePart: (key: string) => void;
  onRemoveSwatch: (id: string) => void;
  onReplaceHue: (id: string, hue: CapturedHue) => void;
  onCaptureText: (text: string, targetId?: string) => void;
}) {
  const { over, handlers } = useHueDrop(
    (h) => onReplaceHue(swatch.id, h),
    (t) => onCaptureText(t, swatch.id),
  );
  return (
    <span
      className={cn(
        "group relative flex items-center justify-center rounded-full",
        over && "ring-2 ring-ink-deep ring-offset-1 ring-offset-card",
      )}
      {...handlers}
    >
      <Swatch
        css={capturedHueCss(swatch)}
        dragKey={swatch.id}
        title={`Your hue — ${swatch.phrase}. Drag onto a word${
          mixOpen ? ", or tap to add a part" : ", or tap to add to the target"
        }. Drop a selection here to replace it.`}
        ariaLabel={`Custom hue: ${swatch.phrase}`}
        active={!mixOpen && selectedColour === swatch.id}
        badge={mixOpen ? recipe[swatch.id] : undefined}
        onToggle={() => onTap(swatch.id)}
        onRemovePart={mixOpen ? () => onRemovePart(swatch.id) : undefined}
      />
      {!mixOpen && (
        <button
          type="button"
          aria-label="Remove this swatch"
          onClick={() => onRemoveSwatch(swatch.id)}
          className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
        >
          <X className="size-2.5" />
        </button>
      )}
    </span>
  );
}

/** The + cell — tap to open the beaker (mix mode), or drop a hue / selection to
 *  capture it straight into a new swatch. */
function PlusCell({
  mixOpen,
  onStartMix,
  onAddHue,
  onCaptureText,
}: {
  mixOpen: boolean;
  onStartMix: () => void;
  onAddHue: (hue: CapturedHue) => void;
  onCaptureText: (text: string, targetId?: string) => void;
}) {
  const { over, handlers } = useHueDrop(onAddHue, (t) => onCaptureText(t));
  return (
    <div className="flex items-center justify-center" {...handlers}>
      <button
        type="button"
        aria-pressed={mixOpen}
        onClick={onStartMix}
        title="Mix a new hue — or drop a selection / Hue-band segment to capture one"
        className={cn(
          "flex size-9 cursor-pointer items-center justify-center rounded-full border border-dashed transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          mixOpen
            ? "border-border/60 text-muted-foreground/70 hover:text-muted-foreground"
            : "border-foreground/80 text-foreground hover:border-foreground hover:bg-muted/30",
          over && "border-ink-deep bg-ink-deep/10 text-ink-deep",
        )}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

/** A mood swatch: draggable (the quick gesture) and clickable (toggle into the
 *  composed target, or pour a part in mix mode). In mix mode the count chip
 *  removes one part, with right-click kept as a backup. */
function Swatch({
  css,
  dragKey,
  title,
  ariaLabel,
  active,
  badge,
  onToggle,
  onRemovePart,
}: {
  css: string;
  dragKey: string;
  title: string;
  ariaLabel: string;
  active: boolean;
  badge?: number;
  onToggle: () => void;
  onRemovePart?: () => void;
}) {
  return (
    <span className="relative flex size-9 shrink-0 items-center justify-center">
      <button
        type="button"
        draggable
        aria-pressed={active}
        onDragStart={(e) => {
          e.dataTransfer.setData(COLOUR_DROP_MIME, dragKey);
          e.dataTransfer.effectAllowed = "copy";
        }}
        onClick={onToggle}
        onContextMenu={
          onRemovePart
            ? (e) => {
                e.preventDefault();
                onRemovePart();
              }
            : undefined
        }
        title={title}
        aria-label={ariaLabel}
        className={cn(
          "size-9 cursor-grab rounded-full border shadow-inner transition-transform",
          "hover:scale-110 active:cursor-grabbing",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
          active ? "border-ink-deep ring-2 ring-ink-deep/50" : "border-border",
        )}
        style={{ backgroundColor: css }}
      />
      {badge && badge > 0 ? (
        <button
          type="button"
          aria-label={`Remove one part from ${ariaLabel}`}
          title="Remove one part from this mix"
          onClick={(e) => {
            e.stopPropagation();
            onRemovePart?.();
          }}
          className="absolute -right-2 -top-2 flex h-5 min-w-7 cursor-pointer items-center justify-center gap-1 rounded-full border border-border/70 bg-background/90 px-1.5 text-[10px] font-semibold tabular-nums text-foreground shadow-md shadow-black/30 backdrop-blur transition-transform hover:scale-105 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          {badge}
          <X className="size-3 stroke-[3]" />
        </button>
      ) : null}
    </span>
  );
}

/** The mixing beaker — ink falls in from the pigment grid above, the liquid
 *  level rises with the parts and takes the running blend's colour, and the
 *  recipe reads back as the target meaning. Accept pours it into a new swatch. */
function Beaker({
  fillCss,
  totalParts,
  phrase,
  pour,
  canPour,
  onAccept,
  onCancel,
}: {
  fillCss: string | undefined;
  totalParts: number;
  phrase: string;
  pour: { token: number; css: string };
  canPour: boolean;
  onAccept: () => void;
  onCancel: () => void;
}) {
  const liquidCss = fillCss ?? "var(--muted)";
  const dropCss = pour.css || "hsl(252, 55%, 68%)";
  const isMixed = totalParts > 0;
  const liquidLevel = isMixed ? 53 - Math.min(totalParts - 1, 4) * 2.25 : 53;
  const wavePath = (y: number) =>
    `M-50,${y} Q-40,${y + 6.5} -30,${y} Q-20,${y - 6.5} -10,${y} Q0,${y + 6.5} 10,${y} Q20,${y - 6.5} 30,${y} Q40,${y + 6.5} 50,${y} Q60,${y - 6.5} 70,${y} Q80,${y + 6.5} 90,${y} Q100,${y - 6.5} 110,${y} Q120,${y + 6.5} 130,${y} L130,80 L-50,80 Z`;
  const dropPath =
    "M40 32 C37.8 35.2 36.4 37.5 36.4 39.7 C36.4 42 38 43.8 40 43.8 C42 43.8 43.6 42 43.6 39.7 C43.6 37.5 42.2 35.2 40 32 Z";
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/60 p-3">
      <div className="relative mx-auto size-20">
        <svg viewBox="0 0 80 80" role="img" aria-label="Colour mix pool" className="size-20">
          <defs>
            <clipPath id="mix-pool-clip">
              <circle cx="40" cy="40" r="30" />
            </clipPath>
            <linearGradient id="mix-empty-liquid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--muted)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--muted)" stopOpacity="0.26" />
            </linearGradient>
            <linearGradient id="mix-empty-drop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(252, 60%, 76%)" />
              <stop offset="100%" stopColor="hsl(252, 48%, 48%)" />
            </linearGradient>
            <linearGradient id="mix-empty-stroke" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(252, 55%, 68%)" />
              <stop offset="100%" stopColor="hsl(252, 48%, 46%)" />
            </linearGradient>
          </defs>
          <circle
            cx="40"
            cy="40"
            r="30"
            fill="var(--card)"
            stroke="var(--border)"
            strokeWidth="2"
          />
          <g clipPath="url(#mix-pool-clip)">
            <rect x="0" y="0" width="80" height="80" fill="var(--card)" />
            <g>
              <path
                d={wavePath(liquidLevel)}
                fill={isMixed ? liquidCss : "url(#mix-empty-liquid)"}
                className="transition-all duration-500"
              />
            </g>
          </g>
          <circle
            cx="40"
            cy="40"
            r="30"
            fill="none"
            stroke="var(--border)"
            strokeOpacity="1"
            strokeWidth="2"
            className="transition-colors duration-500"
          />
          {!isMixed && (
            <path
              d={wavePath(liquidLevel)}
              fill="none"
              stroke="url(#mix-empty-stroke)"
              strokeOpacity="0.7"
              strokeWidth="1.5"
              clipPath="url(#mix-pool-clip)"
            />
          )}
          {!isMixed && (
            <path className="inklings-hue-empty-drop" d={dropPath} fill="url(#mix-empty-drop)" />
          )}
          {pour.token > 0 && (
            <path
              key={pour.token}
              className={cn(
                totalParts === 1 ? "inklings-mix-first-drop" : "inklings-mix-drop-pour",
              )}
              d={dropPath}
              fill={dropCss}
            />
          )}
        </svg>
      </div>
      {totalParts > 0 ? (
        <p className="text-[11px] italic leading-snug text-muted-foreground">{phrase}</p>
      ) : (
        <p className="text-[11px] italic leading-snug text-muted-foreground">
          Tap the colours above to mix the hue — each one falls a part into the beaker.
        </p>
      )}
      <div className="flex justify-end gap-1.5">
        <Button
          size="sm"
          variant={totalParts > 0 ? "secondary" : "outline"}
          onClick={onCancel}
          className="cursor-pointer"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onAccept}
          disabled={!canPour}
          className={cn(canPour ? "cursor-pointer" : "cursor-not-allowed")}
        >
          <Check className="size-4" /> Add to palette
        </Button>
      </div>
    </div>
  );
}
