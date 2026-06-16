// Draft version history (idea #4, the deferred half) — a bounded stack of
// pre-rewrite snapshots. Accepting a rewrite remounts the editor, which
// wipes TipTap's own undo stack, so without this the writer's old draft is
// gone the moment they accept. Pure list ops; the page owns the state.

export type DraftVersion = {
  /** The full editor HTML at the moment the snapshot was taken. */
  html: string;
  /** What the writer was aiming for when this draft was replaced. */
  sourceTarget: string;
  /** Epoch millis, provided by the caller (keeps this module pure). */
  takenAt: number;
};

/** Newest-first cap — old versions fall off the end. */
export const MAX_VERSIONS = 10;

/**
 * Pushes a snapshot onto the front of the stack. No-ops when the snapshot's
 * html is empty or identical to the newest entry (double-accept, re-render),
 * and trims the stack to {@link MAX_VERSIONS}.
 */
export function pushVersion(
  stack: readonly DraftVersion[],
  version: DraftVersion,
  max = MAX_VERSIONS,
): DraftVersion[] {
  if (!version.html.trim()) return [...stack];
  if (stack[0]?.html === version.html) return [...stack];
  return [version, ...stack].slice(0, Math.max(1, max));
}
