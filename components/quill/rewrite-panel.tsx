"use client";

import {
  AlignLeft,
  Check,
  Columns2,
  Feather,
  Loader2,
  Sparkles,
  Wand2,
  Wind,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  applyDecisions,
  type DiffToken,
  type RewriteNudge,
  type RewriteSegment,
  type TargetRewrite,
  toDiffTokens,
} from "@/lib/quill/diff";
import { cn } from "@/lib/utils";

type DiffView = "split" | "inline";

const EMPTY_DIFF: RewriteSegment[] = [];

/**
 * The suggested-rewrite surface: a structured diff plus the per-change accept
 * controls (B4 ownership) and the "Nudges applied" panel. `onAccept` receives
 * the text the writer chose to apply — either the full rewrite or only the
 * accepted changes.
 */
export function RewritePanel({
  rewrite,
  isPending,
  error,
  onAccept,
  onReject,
}: {
  rewrite: TargetRewrite | null;
  isPending: boolean;
  error: string | null;
  onAccept: (text: string) => void;
  onReject: () => void;
}) {
  // Split shows original | rewrite side by side; inline weaves removals and
  // additions into one column where each change can be taken or left.
  const [view, setView] = useState<DiffView>("split");

  const diff = rewrite?.diff ?? EMPTY_DIFF;
  const tokens = useMemo(() => toDiffTokens(diff), [diff]);
  const changeIndices = useMemo(
    () => tokens.filter((t) => t.kind === "change").map((t) => t.index),
    [tokens],
  );

  // Per-change accept set — B4 ownership. Start with every change accepted (so
  // the default "apply" equals the full rewrite); the writer deselects the ones
  // they want to keep in their own voice. Reset whenever a new rewrite lands.
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  useEffect(() => {
    setAccepted(new Set(changeIndices));
  }, [changeIndices]);

  const toggleChange = (index: number) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const total = changeIndices.length;
  const acceptedCount = changeIndices.filter((i) => accepted.has(i)).length;
  const applyLabel =
    acceptedCount === total ? "Use the rewrite" : `Apply ${acceptedCount} of ${total}`;

  return (
    <Card className="mt-6 bg-card/60">
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[10px] tracking-widest text-muted-foreground uppercase">
            Suggested rewrite
          </h2>
          {!isPending && rewrite && (
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => v && setView(v as DiffView)}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="split" className="gap-1.5 text-xs">
                <Columns2 className="size-3.5" /> Side-by-side
              </ToggleGroupItem>
              <ToggleGroupItem value="inline" className="gap-1.5 text-xs">
                <AlignLeft className="size-3.5" /> Inline diff
              </ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>

        {isPending ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Claude is rewriting…
          </div>
        ) : error ? (
          <p className="text-xs italic text-destructive">{error}</p>
        ) : rewrite ? (
          <>
            {view === "inline" ? (
              <InteractiveDiff tokens={tokens} accepted={accepted} onToggle={toggleChange} />
            ) : (
              <DiffBody diff={rewrite.diff} view="split" />
            )}
            <DiffLegend
              hint={
                view === "split"
                  ? "Switch to Inline diff to keep or drop each change individually."
                  : "Click any change to keep it in your own words."
              }
            />
            {rewrite.nudges.length > 0 && <NudgesApplied nudges={rewrite.nudges} />}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onReject}>
                <X className="size-4" /> Keep original
              </Button>
              <Button
                size="sm"
                disabled={acceptedCount === 0}
                onClick={() => onAccept(applyDecisions(diff, accepted))}
              >
                <Check className="size-4" /> {applyLabel}
              </Button>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The inline diff as an editable decision surface (B4 ownership). Unchanged
 * text is plain; each change is a button the writer toggles. Accepted changes
 * show the rewrite's words in emerald; rejected ones fall back to the original
 * so the prose stays in the writer's voice. Nothing is committed until they
 * apply — agency stays with the author, never full-text regeneration.
 */
function InteractiveDiff({
  tokens,
  accepted,
  onToggle,
}: {
  tokens: DiffToken[];
  accepted: Set<number>;
  onToggle: (index: number) => void;
}) {
  return (
    <p className="font-serif text-base leading-relaxed text-ink-deep">
      {tokens.map((token, i) =>
        token.kind === "same" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: tokens are static and never reordered
          <span key={`s-${i}`}>{token.text}</span>
        ) : (
          <ChangeChip
            key={`c-${token.index}`}
            change={token}
            isAccepted={accepted.has(token.index)}
            onToggle={() => onToggle(token.index)}
          />
        ),
      )}
    </p>
  );
}

function ChangeChip({
  change,
  isAccepted,
  onToggle,
}: {
  change: { removed: string; added: string };
  isAccepted: boolean;
  onToggle: () => void;
}) {
  const { removed, added } = change;
  // Always show something toggleable: an accepted insertion shows the new words;
  // a rejected one shows the original; the degenerate empty side falls back to
  // the other, struck through, so the change can still be flipped back.
  const accepted = added !== "" ? { text: added, struck: false } : { text: removed, struck: true };
  const rejected =
    removed !== "" ? { text: removed, struck: false } : { text: added, struck: true };
  const shown = isAccepted ? accepted : rejected;

  return (
    <button
      type="button"
      aria-pressed={isAccepted}
      title={isAccepted ? "Keep your original wording here" : "Apply this change"}
      onClick={onToggle}
      className={cn(
        "rounded-[3px] px-0.5 align-baseline transition-colors duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        shown.struck && "line-through",
        isAccepted
          ? "bg-emerald-500/12 text-emerald-700 hover:bg-emerald-500/20"
          : "bg-transparent text-ink-deep/70 underline decoration-dotted decoration-ink-deep/30 underline-offset-2 hover:bg-rose-500/10 hover:text-rose-700/80",
      )}
    >
      {shown.text || "·"}
    </button>
  );
}

/**
 * Renders the structured rewrite diff. `split` reconstructs the original (same +
 * removed) and the rewrite (same + added) into two columns; `inline` weaves the
 * whole diff into one column. Added text glows green, removed text is struck
 * through in rose — the green/pink language from the pitch. Spans transition
 * their tint so toggling views feels like one surface re-settling, not a redraw.
 */
function DiffBody({ diff, view }: { diff: RewriteSegment[]; view: DiffView }) {
  if (view === "inline") {
    return (
      <div className="font-serif text-base leading-relaxed text-ink-deep">
        {diff.map((seg, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: diff is static and never reordered
          <DiffSpan key={`i-${i}`} seg={seg} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <h3 className="text-[10px] tracking-wider text-muted-foreground uppercase">Original</h3>
        <p className="mt-2 font-serif text-base leading-relaxed text-ink-deep/70">
          {diff
            .filter((s) => s.op !== "add")
            .map((seg, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: diff is static and never reordered
              <DiffSpan key={`o-${i}`} seg={seg} side="original" />
            ))}
        </p>
      </div>
      <div>
        <h3 className="text-[10px] tracking-wider text-ink-bleed uppercase">Nudge</h3>
        <p className="mt-2 font-serif text-base leading-relaxed text-ink-deep">
          {diff
            .filter((s) => s.op !== "remove")
            .map((seg, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: diff is static and never reordered
              <DiffSpan key={`r-${i}`} seg={seg} side="rewrite" />
            ))}
        </p>
      </div>
    </div>
  );
}

/**
 * One diff segment. In a single-side column (`side` set) the opposite op never
 * arrives, so we only ever tint the one that belongs there; in the inline view
 * (`side` undefined) both adds and removes are tinted together.
 */
function DiffSpan({ seg, side }: { seg: RewriteSegment; side?: "original" | "rewrite" }) {
  const base = "transition-colors duration-200 ease-out";
  if (seg.op === "add" && side !== "original") {
    return (
      <span className={cn(base, "rounded-[3px] bg-emerald-500/12 px-0.5 text-emerald-700")}>
        {seg.text}
      </span>
    );
  }
  if (seg.op === "remove" && side !== "rewrite") {
    return (
      <span
        className={cn(base, "rounded-[3px] bg-rose-500/12 px-0.5 text-rose-700/80 line-through")}
      >
        {seg.text}
      </span>
    );
  }
  return <span>{seg.text}</span>;
}

// Rotating glyphs so each nudge card reads as its own small object rather than a
// repeated bullet — variety is cheap delight on a feature seen now and then.
const NUDGE_ICONS = [Wand2, Feather, Wind, Sparkles];

/**
 * The "Nudges applied" panel — each named change the rewrite made toward the
 * target, as an inspectable card (label + reason). This is the PromptCanvas
 * move: the prompt's effects become visible, discrete objects instead of an
 * invisible transformation. Cards fade/slide in with a short stagger so the
 * list assembles itself rather than snapping in all at once.
 */
function NudgesApplied({ nudges }: { nudges: RewriteNudge[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[10px] tracking-wider text-muted-foreground uppercase">Nudges applied</h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {nudges.map((nudge, i) => {
          const Icon = NUDGE_ICONS[i % NUDGE_ICONS.length] ?? Sparkles;
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: nudges are static and never reordered
              key={`nudge-${i}`}
              style={{ animationDelay: `${i * 45}ms` }}
              className="flex animate-in items-start gap-2.5 rounded-lg border border-border/60 bg-card/50 p-3 fade-in slide-in-from-bottom-1 fill-mode-backwards duration-300 ease-out"
            >
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-ink-bleed/10 text-ink-bleed">
                <Icon className="size-3.5" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium leading-tight text-ink-deep">
                  {nudge.label}
                </span>
                <span className="text-xs leading-snug text-muted-foreground">{nudge.reason}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DiffLegend({ hint }: { hint?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-rose-500/30" aria-hidden="true" />
        Removed or toned down
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-emerald-500/30" aria-hidden="true" />
        Added or emphasised
      </span>
      {hint && <span className="italic">{hint}</span>}
    </div>
  );
}
