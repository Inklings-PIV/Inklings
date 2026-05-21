import { describe, expect, it } from "vitest";
import { countWords, slugify, stubClassicalFeatures } from "@/lib/inngest/ingest-book";

describe("slugify", () => {
  it("lowercases + dashes", () => {
    expect(slugify("Pride and Prejudice")).toBe("pride-and-prejudice");
  });

  it("strips diacritics", () => {
    expect(slugify("Émile Zola")).toBe("emile-zola");
  });

  it("collapses runs of non-alphanumerics", () => {
    expect(slugify("Foo!! -- bar  baz")).toBe("foo-bar-baz");
  });

  it("trims leading/trailing dashes", () => {
    expect(slugify(" - Hello, World! - ")).toBe("hello-world");
  });
});

describe("countWords", () => {
  it("splits on whitespace, drops empties", () => {
    expect(countWords("one two   three\nfour")).toBe(4);
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
});

describe("stubClassicalFeatures", () => {
  it("returns a stable shape", () => {
    const f = stubClassicalFeatures(
      "It was the best of times, it was the worst of times. A second sentence.",
    );
    expect(f.stub).toBe(true);
    expect(f.wordCount).toBe(15);
    expect(f.sentenceCount).toBe(2);
    expect(f.meanSentenceLength).toBeCloseTo(7.5, 5);
    expect(f.typeTokenRatio).toBeGreaterThan(0);
    expect(f.typeTokenRatio).toBeLessThanOrEqual(1);
  });

  it("does not crash on empty input", () => {
    const f = stubClassicalFeatures("");
    expect(f.wordCount).toBe(0);
    expect(f.sentenceCount).toBe(0);
    expect(f.meanSentenceLength).toBe(0);
    expect(f.typeTokenRatio).toBe(0);
  });

  it("varies across different texts (UMAP needs variance)", () => {
    const a = stubClassicalFeatures("Short. Short. Short.");
    const b = stubClassicalFeatures(
      "A long, sprawling, baroque sentence that meanders through several clauses before finally arriving at a full stop.",
    );
    expect(a.meanSentenceLength).not.toBe(b.meanSentenceLength);
    expect(a.typeTokenRatio).not.toBe(b.typeTokenRatio);
  });
});
