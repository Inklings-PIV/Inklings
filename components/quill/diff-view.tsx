"use client";

import { Check, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChangedSegment, DiffSegment, HunkState } from "./use-diff";

// ---------------------------------------------------------------------------
// DiffText — the inline annotated paragraph, rendered in the top editor card
// ---------------------------------------------------------------------------

export function DiffText({
  segments,
  states,
  setHunkState,
}: {
  segments: DiffSegment[];
  states: Record<string, HunkState>;
  setHunkState: (id: string, next: HunkState) => void;
}) {
  return (
    <div className="min-h-[400px] font-serif text-base leading-relaxed text-ink-deep">
      {segments.map((seg) => {
        if (seg.type === "unchanged") {
          return <span key={seg.id}>{seg.value}</span>;
        }
        return (
          <HunkSpan
            key={seg.id}
            segment={seg}
            state={states[seg.id] ?? "pending"}
            onAccept={() => setHunkState(seg.id, "accepted")}
            onReject={() => setHunkState(seg.id, "rejected")}
            onReset={() => setHunkState(seg.id, "pending")}
          />
        );
      })}
    </div>
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
}: {
  resolvedCount: number;
  totalChanges: number;
  onApply: () => void;
  onAcceptAll: () => void;
  onReject: () => void;
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
      <span className="text-[11px] tabular-nums text-muted-foreground">
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
      className="relative inline-block align-baseline"
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
