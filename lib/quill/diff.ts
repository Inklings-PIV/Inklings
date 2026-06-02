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

// --- Incremental ownership (PromptCanvas Finding #4) -----------------------
// Accepting a rewrite wholesale is "full-text regeneration" — the move Amin's
// study found weakens authorial agency. Instead we split the diff into discrete
// changes the writer can take or leave one at a time. A "change" is a maximal
// run of adjacent non-`same` segments (the removed words and the added words
// that replace them), anchored between unchanged text.

/** One take-it-or-leave-it change: the original text and its replacement. */
export type DiffChange = {
  /** Stable index into the change list, used as the accept/reject key. */
  index: number;
  /** Original text in this span (may be empty for a pure insertion). */
  removed: string;
  /** Replacement text in this span (may be empty for a pure deletion). */
  added: string;
};

/** A render token: unchanged anchor text, or an inspectable change. */
export type DiffToken = { kind: "same"; text: string } | ({ kind: "change" } & DiffChange);

/** Walk the diff into tokens, grouping adjacent add/remove runs into one change. */
export function toDiffTokens(diff: RewriteSegment[]): DiffToken[] {
  const tokens: DiffToken[] = [];
  let removed = "";
  let added = "";
  let changeIndex = 0;

  const flush = () => {
    if (removed === "" && added === "") return;
    tokens.push({ kind: "change", index: changeIndex, removed, added });
    changeIndex += 1;
    removed = "";
    added = "";
  };

  for (const seg of diff) {
    if (seg.op === "same") {
      flush();
      if (seg.text !== "") tokens.push({ kind: "same", text: seg.text });
    } else if (seg.op === "remove") {
      removed += seg.text;
    } else {
      added += seg.text;
    }
  }
  flush();
  return tokens;
}

/** How many discrete changes the diff contains. */
export function countChanges(diff: RewriteSegment[]): number {
  return toDiffTokens(diff).filter((t) => t.kind === "change").length;
}

/**
 * Reconstruct the text with only the accepted changes applied: an accepted
 * change contributes its `added` text, a rejected one keeps its `removed`
 * (original) text. With every change accepted this equals the full rewrite;
 * with none, the original.
 */
export function applyDecisions(diff: RewriteSegment[], accepted: Set<number>): string {
  return toDiffTokens(diff)
    .map((t) => {
      if (t.kind === "same") return t.text;
      return accepted.has(t.index) ? t.added : t.removed;
    })
    .join("");
}
