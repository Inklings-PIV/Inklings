import { describe, expect, it } from "vitest";
import { countWords, slugify } from "@/lib/inngest/ingest-book";

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
