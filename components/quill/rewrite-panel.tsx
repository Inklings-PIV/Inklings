"use client";

import { Brush, ChevronDown, Loader2, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { COLOUR_DROPS, type ColourDrop, colourCssOf } from "@/components/quill/colour-drop";
import { COLOUR_DROP_MIME } from "@/components/quill/editor";
import { TargetWidgets } from "@/components/quill/target-widgets";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { WidgetSelection } from "@/lib/quill/widgets";
import { cn } from "@/lib/utils";

const INTENSITY_LABELS: Record<number, string> = {
  1: "Whisper",
  2: "Subtle",
  3: "Moderate",
  4: "Bold",
  5: "Full",
};

// Brush = how many sentences the colour drop covers. Selection always wins over
// this; it only governs a drop point. The brush icon grows with the size.
const BRUSH_SIZES = [
  { size: 1, iconClass: "size-3", title: "Fine — just the sentence" },
  { size: 3, iconClass: "size-4", title: "Medium — sentence ± 1" },
  { size: 7, iconClass: "size-5", title: "Broad — sentence ± 3" },
] as const;

function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/**
 * The fused rewrite widget. Three stacked parts: a collapsible colour area
 * (draggable mood swatches + brush size), a collapsible words area (style facets
 * + free-text brief), and a fixed footer (intensity, the animate toggle and the
 * rewrite button). Colour and words compose into one target — colour is optional.
 * Dragging a swatch onto the prose is the quick gesture; clicking one toggles it
 * into the composed target instead.
 */
export function RewritePanel({
  selectedColour,
  onToggleColour,
  brushSize,
  onBrushChange,
  selection,
  onWidgetChange,
  target,
  onTargetChange,
  composedTarget,
  intensity,
  onIntensityChange,
  animate,
  onAnimateChange,
  wordCount,
  onRequest,
  isPending,
  hasRewrite,
  selectionText,
  onClearSelection,
  error,
}: {
  selectedColour: string | null;
  onToggleColour: (key: string) => void;
  brushSize: number;
  onBrushChange: (n: number) => void;
  selection: WidgetSelection;
  onWidgetChange: (key: string, value: string | null) => void;
  target: string;
  onTargetChange: (s: string) => void;
  composedTarget: string;
  intensity: number;
  onIntensityChange: (n: number) => void;
  animate: boolean;
  onAnimateChange: (b: boolean) => void;
  wordCount: number;
  onRequest: () => void;
  isPending: boolean;
  hasRewrite: boolean;
  selectionText: string | null;
  onClearSelection: () => void;
  error: string | null;
}) {
  const [colourOpen, setColourOpen] = useState(true);
  const [wordsOpen, setWordsOpen] = useState(true);

  const effectiveWordCount = selectionText ? countWords(selectionText) : wordCount;
  const canAsk = effectiveWordCount >= 3 && composedTarget.trim().length > 0 && !isPending;
  const buttonLabel = selectionText
    ? "Nudge selection"
    : hasRewrite
      ? "Try another nudge"
      : "Suggest a nudge";

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        {/* §1 — colour: the swatch strip stays visible even collapsed so it's
            always draggable; collapsing only hides the brush row + helper. */}
        <section className="flex flex-col gap-2">
          <SectionHeader
            label="Colour"
            open={colourOpen}
            onToggle={() => setColourOpen((v) => !v)}
          />
          <div className="flex flex-wrap gap-2">
            {COLOUR_DROPS.map((c) => (
              <Swatch
                key={c.key}
                colour={c}
                active={selectedColour === c.key}
                onToggle={() => onToggleColour(c.key)}
              />
            ))}
          </div>
          {colourOpen && (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Brush
                </span>
                <div className="flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
                  {BRUSH_SIZES.map((b) => (
                    <button
                      key={b.size}
                      type="button"
                      aria-pressed={brushSize === b.size}
                      aria-label={b.title}
                      title={b.title}
                      onClick={() => onBrushChange(b.size)}
                      className={cn(
                        "inline-flex size-7 items-center justify-center rounded transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                        brushSize === b.size
                          ? "bg-card text-ink-deep shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Brush className={b.iconClass} />
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] italic leading-snug text-muted-foreground">
                Drag a colour onto a word for an instant nudge, or tap one to fold its mood into the
                target below.
              </p>
            </>
          )}
        </section>

        {/* §2 — words: style facets + a free-text brief. */}
        <section className="flex flex-col gap-2 border-t border-border/60 pt-3">
          <SectionHeader label="Words" open={wordsOpen} onToggle={() => setWordsOpen((v) => !v)} />
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
                  placeholder="warm, melancholy · Hemingway-like · lush, baroque"
                  className="h-9 rounded-md border border-border bg-card px-3 text-sm placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40 focus:outline-none"
                />
              </label>
            </>
          )}
        </section>

        {/* §3 — fixed footer. */}
        <div className="flex flex-col gap-3 border-t border-border/60 pt-3">
          {composedTarget ? (
            <p className="text-[11px] leading-snug text-muted-foreground">
              Aiming for: <span className="italic">{composedTarget}</span>
            </p>
          ) : (
            <p className="text-[11px] italic leading-snug text-muted-foreground">
              Pick a colour, facets, a brief — or any mix. Claude rewrites toward the combination.
            </p>
          )}
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
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={animate}
              onChange={(e) => onAnimateChange(e.target.checked)}
              className="size-3.5 cursor-pointer accent-ink-bleed"
            />
            Splash animation on rewrite
          </label>
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
          <Button size="sm" variant="outline" onClick={onRequest} disabled={!canAsk}>
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
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeader({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="flex items-center justify-between text-[10px] tracking-widest text-muted-foreground uppercase transition-colors hover:text-foreground focus-visible:outline-none"
    >
      {label}
      <ChevronDown
        aria-hidden="true"
        className={cn("size-3.5 transition-transform", open && "rotate-180")}
      />
    </button>
  );
}

/** A mood swatch: draggable (the quick gesture) and clickable (toggle into the
 *  composed target). The two don't conflict — a click never starts a drag. */
function Swatch({
  colour,
  active,
  onToggle,
}: {
  colour: ColourDrop;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      draggable
      aria-pressed={active}
      onDragStart={(e) => {
        e.dataTransfer.setData(COLOUR_DROP_MIME, colour.key);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={onToggle}
      title={`${colour.label} — ${colour.target}. Drag onto a word, or tap to add to the target.`}
      aria-label={`${colour.label}: ${colour.target}`}
      className={cn(
        "size-7 shrink-0 cursor-grab rounded-full border shadow-inner transition-transform",
        "hover:scale-110 active:cursor-grabbing",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        active ? "border-ink-deep ring-2 ring-ink-deep/50" : "border-border",
      )}
      style={{ backgroundColor: colourCssOf(colour) }}
    />
  );
}
