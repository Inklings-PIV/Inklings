import { describe, expect, it } from "vitest";
import { computeWritingStats } from "@/lib/quill/stats";

describe("computeWritingStats", () => {
  it("returns all zeros for empty text", () => {
    expect(computeWritingStats("   ")).toEqual({
      words: 0,
      sentences: 0,
      characters: 0,
      readingMinutes: 0,
      avgSentenceWords: 0,
    });
  });

  it("counts words, characters, and sentences", () => {
    const s = computeWritingStats("The cat sat. The dog ran!");
    expect(s.words).toBe(6);
    expect(s.sentences).toBe(2);
    expect(s.characters).toBe("Thecatsat.Thedogran!".length);
  });

  it("clamps a fragment to one sentence", () => {
    expect(computeWritingStats("no terminator here").sentences).toBe(1);
  });

  it("reading time is at least one minute and grows with length", () => {
    const short = computeWritingStats("a few words here");
    const long = computeWritingStats(Array(500).fill("word").join(" "));
    expect(short.readingMinutes).toBeGreaterThanOrEqual(1);
    expect(long.readingMinutes).toBeGreaterThan(short.readingMinutes);
  });

  it("average sentence length reflects words per sentence", () => {
    const s = computeWritingStats("one two three four. five six.");
    expect(s.avgSentenceWords).toBeCloseTo(6 / 2);
  });
});
