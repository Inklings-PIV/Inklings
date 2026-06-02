// Structured rewrite types for the Quill "Target" mode (#38 follow-up).
//
// The pitch (public/piv-pitch.pdf p7) promises more than a plain-text rewrite:
// a word-level diff (green = added/emphasised, pink = removed/toned-down) and a
// list of named "nudges" explaining *why* the prose moved toward the target.
// That maps onto Amin's research — XAI counterfactual highlighting + PromptCanvas
// composable, visible prompt objects — so we make the rewrite an explainable,
// inspectable object instead of an opaque blob.
//
// The diff is the source of truth: the model emits aligned segments and we
// reconstruct both the original and the rewrite from them, so the three views
// (original / rewrite / inline diff) can never drift apart.

/** One aligned span of the diff. `same` text is unchanged; `add` exists only in
 *  the rewrite; `remove` existed only in the original. */
export type RewriteSegment = {
  text: string;
  op: "same" | "add" | "remove";
};

/** A named, human-readable change the rewrite made toward the target — the
 *  "Nudges Applied" cards in the pitch. Composable + inspectable per PromptCanvas. */
export type RewriteNudge = {
  /** Short title, e.g. "Softened intensity". */
  label: string;
  /** One-line explanation of what the nudge did. */
  reason: string;
};

export type TargetRewrite = {
  /** Full rewritten prose, reconstructed from the diff (`add` + `same`). */
  rewrite: string;
  diff: RewriteSegment[];
  nudges: RewriteNudge[];
};

/** Reconstruct the rewritten text: everything except removed spans. */
export function rewriteFromDiff(diff: RewriteSegment[]): string {
  return diff
    .filter((s) => s.op !== "remove")
    .map((s) => s.text)
    .join("");
}

/** Reconstruct the original text: everything except added spans. */
export function originalFromDiff(diff: RewriteSegment[]): string {
  return diff
    .filter((s) => s.op !== "add")
    .map((s) => s.text)
    .join("");
}
