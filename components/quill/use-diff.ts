"use client";

import type { Change } from "diff";
import { diffWords } from "diff";
import { useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HunkState = "pending" | "accepted" | "rejected";

// Every segment carries an `id` so callers never need array-index keys.
export type UnchangedSegment = { type: "unchanged"; id: string; value: string };
export type SubstitutionSegment = {
  type: "substitution";
  id: string;
  removed: string;
  added: string;
};
export type DeletionSegment = { type: "deletion"; id: string; removed: string };
export type InsertionSegment = { type: "insertion"; id: string; added: string };

export type DiffSegment =
  | UnchangedSegment
  | SubstitutionSegment
  | DeletionSegment
  | InsertionSegment;

export type ChangedSegment = SubstitutionSegment | DeletionSegment | InsertionSegment;

// ---------------------------------------------------------------------------
// Pure helpers (exported so DiffActions can call buildResolved)
// ---------------------------------------------------------------------------

export function buildSegments(original: string, rewrite: string): DiffSegment[] {
  if (!original && !rewrite) return [];
  const raw: Change[] = diffWords(original, rewrite);
  const segments: DiffSegment[] = [];
  let segIdx = 0; // monotonic counter for stable IDs on all segment types
  let i = 0;

  while (i < raw.length) {
    const part = raw[i];
    if (!part) {
      i++;
      continue;
    }

    if (!part.added && !part.removed) {
      segments.push({ type: "unchanged", id: `u-${segIdx++}`, value: part.value });
      i++;
    } else if (part.removed) {
      const next = raw[i + 1];
      if (next?.added) {
        segments.push({
          type: "substitution",
          id: `c-${segIdx++}`,
          removed: part.value,
          added: next.value,
        });
        i += 2;
      } else {
        segments.push({ type: "deletion", id: `c-${segIdx++}`, removed: part.value });
        i++;
      }
    } else {
      segments.push({ type: "insertion", id: `c-${segIdx++}`, added: part.value });
      i++;
    }
  }

  return segments;
}

export function buildResolved(segments: DiffSegment[], states: Record<string, HunkState>): string {
  return segments
    .map((seg) => {
      if (seg.type === "unchanged") return seg.value;
      const state = states[seg.id] ?? "pending";
      if (seg.type === "substitution") return state === "accepted" ? seg.added : seg.removed;
      if (seg.type === "deletion") return state === "accepted" ? "" : seg.removed;
      return state === "accepted" ? seg.added : "";
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export type DiffResult = {
  segments: DiffSegment[];
  states: Record<string, HunkState>;
  setHunkState: (id: string, next: HunkState) => void;
  resolvedCount: number;
  totalChanges: number;
  resolvedText: () => string;
};

export function useDiff(original: string, rewrite: string): DiffResult {
  const segments = useMemo(() => buildSegments(original, rewrite), [original, rewrite]);

  const changeSegments = useMemo(
    () => segments.filter((s): s is ChangedSegment => s.type !== "unchanged"),
    [segments],
  );

  const makeInitialStates = (cs: ChangedSegment[]) =>
    Object.fromEntries(cs.map((s) => [s.id, "pending" as HunkState]));

  const [states, setStates] = useState<Record<string, HunkState>>(() =>
    makeInitialStates(changeSegments),
  );

  // Render-time sync: when the rewrite string changes (new nudge), reset all
  // hunk states. Using a "previous value" pattern avoids useEffect and the
  // exhaustive-deps lint rule.
  const [prevRewrite, setPrevRewrite] = useState(rewrite);
  if (rewrite !== prevRewrite) {
    setPrevRewrite(rewrite);
    setStates(makeInitialStates(changeSegments));
  }

  const resolvedCount = Object.values(states).filter((s) => s !== "pending").length;
  const totalChanges = changeSegments.length;

  const setHunkState = (id: string, next: HunkState) =>
    setStates((prev) => ({ ...prev, [id]: next }));

  const resolvedText = () => buildResolved(segments, states);

  return { segments, states, setHunkState, resolvedCount, totalChanges, resolvedText };
}
