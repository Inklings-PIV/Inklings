import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripGutenbergBoilerplate } from "@/lib/ingestion/gutenberg-text";
import { extractClassical, FUNCTION_WORDS } from "@/lib/stylometry/classical";

const fixture = (name: string) => readFileSync(resolve("tests/fixtures", name), "utf8");

describe("extractClassical", () => {
  it("produces a stable shape", () => {
    const f = extractClassical("It is a truth universally acknowledged. A second sentence here.");
    expect(typeof f.wordCount).toBe("number");
    expect(typeof f.sentenceCount).toBe("number");
    expect(typeof f.typeTokenRatio).toBe("number");
    expect(typeof f.mtld).toBe("number");
    expect(f.sentenceLength).toMatchObject({
      mean: expect.any(Number),
      std: expect.any(Number),
      p50: expect.any(Number),
      p90: expect.any(Number),
    });
    expect(f.punctuation).toMatchObject({
      comma: expect.any(Number),
      period: expect.any(Number),
    });
    // functionWords has exactly FUNCTION_WORDS.length keys, all 0..1
    expect(Object.keys(f.functionWords)).toHaveLength(FUNCTION_WORDS.length);
    for (const v of Object.values(f.functionWords)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic", () => {
    const sample =
      "Call me Ishmael. Some years ago—never mind how long precisely—having little or no money in my purse, I thought I would sail about a little.";
    const a = extractClassical(sample);
    const b = extractClassical(sample);
    expect(a).toEqual(b);
  });

  it("counts sentences and words plausibly", () => {
    const f = extractClassical("First sentence. Second sentence here? Third one! And a fourth.");
    expect(f.sentenceCount).toBe(4);
    expect(f.wordCount).toBeGreaterThanOrEqual(8);
  });

  it("returns zeros for empty input", () => {
    const f = extractClassical("");
    expect(f.wordCount).toBe(0);
    expect(f.sentenceCount).toBe(0);
    expect(f.mtld).toBe(0);
    expect(f.typeTokenRatio).toBe(0);
    expect(f.sentenceLength.mean).toBe(0);
    for (const v of Object.values(f.punctuation)) expect(v).toBe(0);
  });

  it("differentiates Hemingway-like terse prose from Woolf-like dense prose", () => {
    const terse = extractClassical(
      "He saw the boat. The sea was flat. He cast the line. The fish bit. He pulled hard. The line snapped.",
    );
    const dense = extractClassical(
      "The clouds, those slow grey witnesses of the afternoon, rolled across a sky that—being neither blue nor really anything we might name—seemed to her, as she watched it from the window, like the inside of a thought one cannot quite finish.",
    );
    expect(dense.sentenceLength.mean).toBeGreaterThan(terse.sentenceLength.mean);
    expect(dense.punctuation.comma).toBeGreaterThan(terse.punctuation.comma);
  });

  it("MTLD is finite and positive on a non-trivial sample", () => {
    const text = stripGutenbergBoilerplate(fixture("gutenberg-sample.txt"));
    expect(text).not.toBeNull();
    const f = extractClassical(text ?? "");
    expect(f.mtld).toBeGreaterThan(0);
    expect(Number.isFinite(f.mtld)).toBe(true);
  });

  it("function-word vector is the right length and dense (zeros allowed)", () => {
    const f = extractClassical("The cat sat on the mat.");
    expect(Object.keys(f.functionWords)).toHaveLength(FUNCTION_WORDS.length);
    // "the" + "on" appear; "anaphor" / "whom" do not.
    expect(f.functionWords.the).toBeGreaterThan(0);
    expect(f.functionWords.on).toBeGreaterThan(0);
    expect(f.functionWords.whom).toBe(0);
  });
});
