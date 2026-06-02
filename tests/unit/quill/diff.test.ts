import { describe, expect, it } from "vitest";
import {
  applyDecisions,
  countChanges,
  originalFromDiff,
  type RewriteSegment,
  rewriteFromDiff,
  toDiffTokens,
} from "@/lib/quill/diff";

const DIFF: RewriteSegment[] = [
  { text: "The ", op: "same" },
  { text: "huge", op: "remove" },
  { text: "vast", op: "add" },
  { text: " sky.", op: "same" },
];

describe("rewriteFromDiff", () => {
  it("keeps same + add, drops remove", () => {
    expect(rewriteFromDiff(DIFF)).toBe("The vast sky.");
  });

  it("returns empty string for empty diff", () => {
    expect(rewriteFromDiff([])).toBe("");
  });
});

describe("originalFromDiff", () => {
  it("keeps same + remove, drops add", () => {
    expect(originalFromDiff(DIFF)).toBe("The huge sky.");
  });
});

describe("round-trip", () => {
  it("an all-same diff reconstructs identically on both sides", () => {
    const same: RewriteSegment[] = [{ text: "unchanged prose", op: "same" }];
    expect(rewriteFromDiff(same)).toBe("unchanged prose");
    expect(originalFromDiff(same)).toBe("unchanged prose");
  });
});

describe("toDiffTokens / countChanges", () => {
  it("groups adjacent remove+add into one change between anchors", () => {
    const tokens = toDiffTokens(DIFF);
    expect(tokens).toEqual([
      { kind: "same", text: "The " },
      { kind: "change", index: 0, removed: "huge", added: "vast" },
      { kind: "same", text: " sky." },
    ]);
    expect(countChanges(DIFF)).toBe(1);
  });

  it("treats a pure insertion as a change with empty removed", () => {
    const ins: RewriteSegment[] = [
      { text: "a ", op: "same" },
      { text: "bright ", op: "add" },
      { text: "day", op: "same" },
    ];
    expect(toDiffTokens(ins)).toContainEqual({
      kind: "change",
      index: 0,
      removed: "",
      added: "bright ",
    });
  });

  it("indexes multiple changes in order", () => {
    const two: RewriteSegment[] = [
      { text: "x", op: "remove" },
      { text: "y", op: "add" },
      { text: " mid ", op: "same" },
      { text: "p", op: "remove" },
      { text: "q", op: "add" },
    ];
    expect(countChanges(two)).toBe(2);
    expect(toDiffTokens(two).filter((t) => t.kind === "change").map((t) => t.index)).toEqual([0, 1]);
  });
});

describe("applyDecisions", () => {
  it("accepting every change equals the full rewrite", () => {
    expect(applyDecisions(DIFF, new Set([0]))).toBe(rewriteFromDiff(DIFF));
  });

  it("accepting none equals the original", () => {
    expect(applyDecisions(DIFF, new Set())).toBe(originalFromDiff(DIFF));
  });

  it("accepts changes selectively", () => {
    const two: RewriteSegment[] = [
      { text: "The ", op: "same" },
      { text: "huge", op: "remove" },
      { text: "vast", op: "add" },
      { text: " ", op: "same" },
      { text: "old", op: "remove" },
      { text: "new", op: "add" },
      { text: " sky.", op: "same" },
    ];
    expect(applyDecisions(two, new Set([0]))).toBe("The vast old sky.");
    expect(applyDecisions(two, new Set([1]))).toBe("The huge new sky.");
  });
});
