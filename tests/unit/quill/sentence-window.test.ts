import { describe, expect, it } from "vitest";
import { type SentenceRange, sentenceSpans, windowAround } from "@/lib/quill/blocks";

describe("sentenceSpans", () => {
  it("splits on sentence-ending punctuation", () => {
    const text = "One fish. Two fish! Red fish? Blue fish.";
    const spans = sentenceSpans(text);
    expect(spans.map((s) => text.slice(s.start, s.end))).toEqual([
      "One fish.",
      "Two fish!",
      "Red fish?",
      "Blue fish.",
    ]);
  });

  it("keeps a trailing fragment with no terminator", () => {
    const text = "Done. Not done";
    const spans = sentenceSpans(text);
    expect(spans).toHaveLength(2);
    const last = spans[1];
    expect(last && text.slice(last.start, last.end)).toBe("Not done");
  });

  it("treats abbreviation-free single sentences as one span", () => {
    expect(sentenceSpans("just one sentence")).toEqual([{ start: 0, end: 17 }]);
  });
});

describe("windowAround", () => {
  // Five sentences with arbitrary but ordered positions.
  const sents: SentenceRange[] = [
    { from: 1, to: 10 },
    { from: 11, to: 20 },
    { from: 21, to: 30 },
    { from: 31, to: 40 },
    { from: 41, to: 50 },
  ];

  it("radius 0 is the target sentence only", () => {
    expect(windowAround(sents, 2, 0)).toEqual({ from: 21, to: 30 });
  });

  it("radius 1 reaches one sentence each side", () => {
    expect(windowAround(sents, 2, 1)).toEqual({ from: 11, to: 40 });
  });

  it("clamps at the document edges", () => {
    expect(windowAround(sents, 0, 1)).toEqual({ from: 1, to: 20 });
    expect(windowAround(sents, 4, 3)).toEqual({ from: 11, to: 50 });
  });

  it("returns null for an empty document", () => {
    expect(windowAround([], 0, 1)).toBeNull();
  });
});
