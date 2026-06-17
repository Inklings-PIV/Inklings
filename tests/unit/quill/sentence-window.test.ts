import { describe, expect, it } from "vitest";
import { sentenceSpans } from "@/lib/quill/blocks";

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
