import { describe, expect, it } from "vitest";
import { paragraphValences } from "@/lib/stylometry/valence";

describe("paragraphValences", () => {
  it("orders happy prose above grim prose", () => {
    const points = paragraphValences([
      "What a wonderful, delightful morning. I love this happy place.",
      "The terrible war brought misery, death and despair.",
    ]);
    expect(points.length).toBeGreaterThanOrEqual(2);
    const happy = points.filter((p) => p.paragraphIndex === 0);
    const grim = points.filter((p) => p.paragraphIndex === 1);
    const mean = (xs: typeof points) => xs.reduce((s, p) => s + p.valence, 0) / xs.length;
    expect(mean(happy)).toBeGreaterThan(mean(grim));
  });

  it("tracks the paragraph index per sentence", () => {
    const points = paragraphValences(["One. Two.", "Three."]);
    expect(points.map((p) => p.paragraphIndex)).toEqual([0, 0, 1]);
  });

  it("returns an empty list for no paragraphs", () => {
    expect(paragraphValences([])).toEqual([]);
  });
});
