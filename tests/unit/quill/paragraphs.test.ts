import { describe, expect, it } from "vitest";
import { splitParagraphs } from "@/lib/quill/paragraphs";

describe("splitParagraphs", () => {
  it("splits multiple <p> blocks into ordered texts", () => {
    expect(splitParagraphs("<p>First one.</p><p>Second one.</p>")).toEqual([
      "First one.",
      "Second one.",
    ]);
  });

  it("flattens inline markup and decodes entities", () => {
    expect(splitParagraphs("<p>A <strong>bold</strong> &amp; brave line</p>")).toEqual([
      "A bold & brave line",
    ]);
  });

  it("handles headings and blockquotes as their own blocks", () => {
    expect(splitParagraphs("<h1>Title</h1><blockquote>Quote</blockquote><p>Body</p>")).toEqual([
      "Title",
      "Quote",
      "Body",
    ]);
  });

  it("drops empty blocks", () => {
    expect(splitParagraphs("<p></p><p>  </p><p>Real</p>")).toEqual(["Real"]);
  });

  it("treats tagless plain text as one paragraph", () => {
    expect(splitParagraphs("just some words")).toEqual(["just some words"]);
  });

  it("returns an empty list for empty input", () => {
    expect(splitParagraphs("")).toEqual([]);
  });
});
