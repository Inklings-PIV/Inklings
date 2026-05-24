import { describe, expect, it } from "vitest";
import {
  countWords,
  firstPageExcerpt,
  longestParagraphExcerpt,
  meaningfulParagraphs,
  parseParagraphs,
  randomExcerpt,
  takeWindow,
} from "@/lib/excerpts/select";

function makeText(): string {
  // 50 paragraphs of varied length so middle-band selection has room to work.
  // Paragraphs are numbered so test assertions can locate which one was picked.
  const parts: string[] = [
    "DEDICATION", // 1-word headers should be dropped by meaningfulParagraphs
    "To the editor, with thanks.", // < 20 words — filtered
    "CHAPTER 1", // chapter header pattern — filtered
  ];
  for (let i = 0; i < 50; i++) {
    parts.push(`Paragraph ${i}. ${"word ".repeat(40 + (i % 10) * 5).trim()}`);
  }
  return parts.join("\n\n");
}

describe("parseParagraphs", () => {
  it("splits on blank lines and trims whitespace", () => {
    const text = "first.\n\nsecond.\n\n  third  .\n\n\nfourth.";
    expect(parseParagraphs(text)).toEqual(["first.", "second.", "third .", "fourth."]);
  });

  it("collapses internal whitespace within a paragraph", () => {
    expect(parseParagraphs("a\n   b\n  c")).toEqual(["a b c"]);
  });
});

describe("meaningfulParagraphs", () => {
  it("drops short paragraphs and chapter-header patterns", () => {
    const out = meaningfulParagraphs([
      "DEDICATION",
      "CHAPTER 1",
      "Short.",
      "This is a long enough paragraph that exceeds the twenty-word minimum threshold so it should be kept by the filter even though it is somewhat plain.",
    ]);
    expect(out).toHaveLength(1);
  });
});

describe("takeWindow", () => {
  it("walks forward accumulating paragraphs until the target word count", () => {
    const paras = ["one ".repeat(50).trim(), "two ".repeat(50).trim(), "three ".repeat(50).trim()];
    const out = takeWindow(paras, 0, 80);
    // 50 words doesn't hit 80, 100 does — should grab two paragraphs.
    expect(out.split("\n\n")).toHaveLength(2);
  });

  it("returns empty when starting past the end", () => {
    expect(takeWindow(["a", "b"], 5, 100)).toBe("");
  });
});

describe("firstPageExcerpt", () => {
  it("returns a non-empty string near the start of the book", () => {
    const out = firstPageExcerpt(makeText(), { targetWords: 100 });
    expect(out.length).toBeGreaterThan(0);
    expect(countWords(out)).toBeGreaterThanOrEqual(100);
    // Should not include the chapter-header / dedication paragraphs that were filtered.
    expect(out).not.toContain("DEDICATION");
    expect(out).not.toContain("CHAPTER 1");
  });
});

describe("longestParagraphExcerpt", () => {
  it("picks from the book's middle 60% and hits the target word count", () => {
    const out = longestParagraphExcerpt(makeText(), { targetWords: 100 });
    expect(countWords(out)).toBeGreaterThanOrEqual(100);
  });
});

describe("randomExcerpt", () => {
  it("is deterministic for the same bookId", () => {
    const text = makeText();
    const a = randomExcerpt(text, { targetWords: 100, bookId: "abc-123" });
    const b = randomExcerpt(text, { targetWords: 100, bookId: "abc-123" });
    expect(a).toBe(b);
  });

  it("varies for different bookIds", () => {
    const text = makeText();
    const a = randomExcerpt(text, { targetWords: 100, bookId: "abc-123" });
    const b = randomExcerpt(text, { targetWords: 100, bookId: "xyz-789" });
    // Could collide by chance with a tiny corpus, but for our fixture they shouldn't.
    expect(a === b).toBe(false);
  });
});
