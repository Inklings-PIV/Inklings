import { describe, expect, it } from "vitest";
import {
  originalFromDiff,
  type RewriteSegment,
  rewriteFromDiff,
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
