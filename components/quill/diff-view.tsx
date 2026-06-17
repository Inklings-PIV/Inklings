"use client";

import { Check, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChangedSegment, DiffSegment, HunkState } from "./use-diff";

// ---------------------------------------------------------------------------
// DiffText — the inline annotated paragraph, rendered in the top editor card
// ---------------------------------------------------------------------------

// Segments from diffWords can contain \n\n (paragraph breaks) or \n (line
// breaks) in their text values. We split the flat segment stream into
// paragraph groups so the diff view renders with the same <p my-3> structure
// as the Tiptap editor — no whitespace-pre-wrap hack needed.

type InlineItem =
  | { kind: "text"; value: string; key: string }
  | { kind: "hunk"; segment: ChangedSegment; key: string }
  | { kind: "br"; key: string };

function buildParagraphGroups(segments: DiffSegment[]): { key: string; items: InlineItem[] }[] {
  const groups: { key: string; items: InlineItem[] }[] = [];
  let current: InlineItem[] = [];
  let groupKey = "";

  const flush = () => {
    if (current.length > 0) {
      groups.push({ key: groupKey, items: current });
      current = [];
    }
  };

  for (const seg of segments) {
    if (seg.type !== "unchanged") {
      if (!groupKey) groupKey = seg.id;
      current.push({ kind: "hunk", segment: seg as ChangedSegment, key: seg.id });
      continue;
    }

    for (const [ci, chunk] of seg.value.split(/\n\n/).entries()) {
      if (ci > 0) {
        flush();
        groupKey = `${seg.id}-p${ci}`;
      } else if (!groupKey) {
        groupKey = seg.id;
      }
      for (const [li, line] of chunk.split(/\n/).entries()) {
        if (li > 0) {
          current.push({ kind: "br", key: `${seg.id}-${ci}-br${li}` });
        }
        if (line) {
          current.push({ kind: "text", value: line, key: `${seg.id}-${ci}-t${li}` });
        }
      }
    }
  }
  flush();

  return groups;
}

export function DiffText({
  segments,
  states,
  setHunkState,
  highlightPending = false,
  leadIn,
  tailOut,
}: {
  segments: DiffSegment[];
  states: Record<string, HunkState>;
  setHunkState: (id: string, next: HunkState) => void;
  highlightPending?: boolean;
  /** Unchanged in-paragraph context hugging the start of the span, rendered
   *  greyed and inline so a mid-paragraph rewrite reads as one paragraph. */
  leadIn?: string;
  /** Unchanged in-paragraph context hugging the end of the span. */
  tailOut?: string;
}) {
  const paragraphs = buildParagraphGroups(segments);
  const lastIndex = paragraphs.length - 1;
  // Returns a bare run of <p>s (no wrapper) so the diff paragraphs sit in the
  // same block flow as the surrounding before/after context the page renders —
  // margins collapse uniformly and `first:mt-0` resolves against the real first
  // paragraph, matching the Tiptap editor's rhythm exactly.
  return (
    <>
      {paragraphs.map((para, pIndex) => (
        <p key={para.key} className="my-3 first:mt-0">
          {pIndex === 0 && leadIn && <span className="text-ink-deep/40 select-none">{leadIn}</span>}
          {para.items.map((item) => {
            if (item.kind === "br") return <br key={item.key} />;
            if (item.kind === "text") return <span key={item.key}>{item.value}</span>;
            return (
              <HunkSpan
                key={item.key}
                segment={item.segment}
                state={states[item.segment.id] ?? "pending"}
                highlightPending={highlightPending}
                onAccept={() => setHunkState(item.segment.id, "accepted")}
                onReject={() => setHunkState(item.segment.id, "rejected")}
                onReset={() => setHunkState(item.segment.id, "pending")}
              />
            );
          })}
          {pIndex === lastIndex && tailOut && (
            <span className="text-ink-deep/40 select-none">{tailOut}</span>
          )}
        </p>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// DiffActions — the control bar, rendered in the RewritePanel below
// ---------------------------------------------------------------------------

export function DiffActions({
  resolvedCount,
  totalChanges,
  onApply,
  onAcceptAll,
  onReject,
  onHighlightEnter,
  onHighlightLeave,
}: {
  resolvedCount: number;
  totalChanges: number;
  onApply: () => void;
  onAcceptAll: () => void;
  onReject: () => void;
  onHighlightEnter?: () => void;
  onHighlightLeave?: () => void;
}) {
  if (totalChanges === 0) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm italic text-muted-foreground">No changes detected in this rewrite.</p>
        <Button variant="outline" size="sm" onClick={onReject}>
          <X className="size-4" /> Dismiss
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: hover-only highlight; no click/keyboard action needed */}
      <span
        className="cursor-default text-[11px] tabular-nums text-muted-foreground"
        onMouseEnter={onHighlightEnter}
        onMouseLeave={onHighlightLeave}
      >
        {resolvedCount} of {totalChanges} {totalChanges === 1 ? "change" : "changes"} resolved
        <span className="ml-1 opacity-60">· changes shown inline above</span>
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={onReject}>
          <X className="size-4" /> Keep original
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onApply}
          disabled={resolvedCount === 0}
          title={resolvedCount === 0 ? "Resolve at least one change first" : undefined}
        >
          Apply ({resolvedCount})
        </Button>
        <Button size="sm" onClick={onAcceptAll}>
          <Check className="size-4" /> Accept all
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HunkSpan — one changed region, inline, with hover controls
// ---------------------------------------------------------------------------

function HunkSpan({
  segment,
  state,
  highlightPending,
  onAccept,
  onReject,
  onReset,
}: {
  segment: ChangedSegment;
  state: HunkState;
  highlightPending: boolean;
  onAccept: () => void;
  onReject: () => void;
  onReset: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpen = () => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setIsOpen(true);
  };

  const handleClose = () => {
    closeTimer.current = setTimeout(() => {
      setIsOpen(false);
      closeTimer.current = null;
    }, 80);
  };

  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    };
  }, []);

  const wrap = (fn: () => void) => () => {
    fn();
    setIsOpen(false);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mouse-only tooltip reveal; keyboard users interact via the buttons inside
    <span
      className={cn(
        "relative inline-block align-baseline transition-all duration-150",
        state !== "pending" && !isOpen && "opacity-60",
        state === "pending" &&
          highlightPending &&
          "rounded-sm bg-ink-bleed/15 ring-1 ring-ink-bleed/35",
      )}
      onMouseEnter={handleOpen}
      onMouseLeave={handleClose}
    >
      {/* Controls float above the hunk, centred over it */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: extends hover area to bridge the gap between word and tooltip */}
      <span
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2",
          "flex items-center gap-0.5 rounded border border-border bg-card/95 p-0.5 shadow-sm backdrop-blur",
          "transition-opacity duration-100",
          isOpen ? "pointer-events-auto opacity-100" : "opacity-0",
        )}
        onMouseEnter={handleOpen}
        onMouseLeave={handleClose}
      >
        {state === "pending" ? (
          <>
            <HunkButton label="Accept this change" onClick={wrap(onAccept)} variant="accept">
              <Check className="size-3" />
            </HunkButton>
            <HunkButton label="Reject this change" onClick={wrap(onReject)} variant="reject">
              <X className="size-3" />
            </HunkButton>
          </>
        ) : (
          <HunkButton label="Reset this change" onClick={wrap(onReset)} variant="reset">
            <RotateCcw className="size-3" />
          </HunkButton>
        )}
      </span>

      <HunkText
        segment={segment}
        state={state}
        onAccept={wrap(onAccept)}
        onReject={wrap(onReject)}
        onReset={wrap(onReset)}
      />
    </span>
  );
}

function HunkButton({
  label,
  onClick,
  variant,
  children,
}: {
  label: string;
  onClick: () => void;
  variant: "accept" | "reject" | "reset";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex size-5 items-center justify-center rounded transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
        variant === "accept" && "text-ink-bleed hover:bg-ink-bleed/15",
        variant === "reject" && "text-destructive hover:bg-destructive/10",
        variant === "reset" && "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// HunkText — visible text for a hunk given its resolved state
// ---------------------------------------------------------------------------

function HunkText({
  segment,
  state,
  onAccept,
  onReject,
  onReset,
}: {
  segment: ChangedSegment;
  state: HunkState;
  onAccept: () => void;
  onReject: () => void;
  onReset: () => void;
}) {
  if (segment.type === "substitution") {
    if (state === "accepted") {
      return (
        <button
          type="button"
          title="Click to undo"
          onClick={onReset}
          className="inline cursor-pointer rounded-sm bg-ink-bleed/20 px-0.5 text-ink-deep hover:opacity-70 transition-opacity"
        >
          {segment.added}
        </button>
      );
    }
    if (state === "rejected") {
      return (
        <button
          type="button"
          title="Click to undo"
          onClick={onReset}
          className="inline cursor-pointer text-ink-deep hover:opacity-70 transition-opacity"
        >
          {segment.removed}
        </button>
      );
    }
    return (
      <>
        <button
          type="button"
          title="Click to keep original"
          onClick={onReject}
          className="inline cursor-pointer text-muted-foreground/70 line-through decoration-muted-foreground/40 hover:text-muted-foreground transition-colors"
        >
          {segment.removed}
        </button>{" "}
        <button
          type="button"
          title="Click to accept change"
          onClick={onAccept}
          className="inline cursor-pointer rounded-sm bg-ink-bleed/10 px-0.5 text-ink-bleed hover:bg-ink-bleed/20 transition-colors"
        >
          {segment.added}
        </button>
      </>
    );
  }

  if (segment.type === "deletion") {
    if (state === "accepted") return null;
    if (state === "rejected") {
      return (
        <button
          type="button"
          title="Click to undo"
          onClick={onReset}
          className="inline cursor-pointer text-ink-deep hover:opacity-70 transition-opacity"
        >
          {segment.removed}
        </button>
      );
    }
    return (
      <button
        type="button"
        title="Click to keep original"
        onClick={onReject}
        className="inline cursor-pointer text-muted-foreground/70 line-through decoration-muted-foreground/40 hover:text-muted-foreground transition-colors"
      >
        {segment.removed}
      </button>
    );
  }

  // insertion
  if (state === "accepted") {
    return (
      <button
        type="button"
        title="Click to undo"
        onClick={onReset}
        className="inline cursor-pointer rounded-sm bg-ink-bleed/20 px-0.5 text-ink-deep hover:opacity-70 transition-opacity"
      >
        {segment.added}
      </button>
    );
  }
  if (state === "rejected") return null;
  return (
    <button
      type="button"
      title="Click to accept change"
      onClick={onAccept}
      className="inline cursor-pointer rounded-sm bg-ink-bleed/10 px-0.5 text-ink-bleed hover:bg-ink-bleed/20 transition-colors"
    >
      {segment.added}
    </button>
  );
}
