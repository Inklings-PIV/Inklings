import { DOMParser } from "@tiptap/pm/model";
import { getSchema } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { blockRangeAt, textblockRanges } from "@/lib/quill/blocks";
import { splitParagraphs } from "@/lib/quill/paragraphs";

// Build a ProseMirror doc from HTML through the exact schema the editor uses, so
// these tests exercise the same block structure TipTap produces at runtime.
const schema = getSchema([StarterKit]);

function docFromHtml(html: string) {
  const el = document.createElement("div");
  el.innerHTML = html;
  return DOMParser.fromSchema(schema).parse(el);
}

describe("textblockRanges", () => {
  it("aligns 1:1 with splitParagraphs across paragraphs, headings, lists and quotes", () => {
    // The off-by-one risk: list items and blockquote lines are nested, so a
    // top-level-only walk would miss them. splitParagraphs counts each one.
    const html =
      "<p>First one.</p><h2>The Title</h2><ul><li>Alpha</li><li>Beta</li></ul><blockquote>A quote</blockquote><p>Last.</p>";
    const doc = docFromHtml(html);
    expect(textblockRanges(doc).map((r) => r.text)).toEqual(splitParagraphs(html));
  });

  it("returns ranges that slice back to each block's own text", () => {
    const html = "<p>Alpha beta.</p><p>Gamma delta.</p>";
    const doc = docFromHtml(html);
    for (const r of textblockRanges(doc)) {
      expect(doc.textBetween(r.from, r.to, " ", " ")).toBe(r.text);
    }
  });

  it("drops empty and whitespace-only blocks like splitParagraphs", () => {
    const html = "<p></p><p>  </p><p>Real text here.</p>";
    const doc = docFromHtml(html);
    expect(textblockRanges(doc).map((r) => r.text)).toEqual(["Real text here."]);
  });

  it("flattens inline markup into a single block", () => {
    const html = "<p>A <strong>bold</strong> and <em>italic</em> line</p>";
    const doc = docFromHtml(html);
    expect(textblockRanges(doc).map((r) => r.text)).toEqual(["A bold and italic line"]);
  });

  it("treats a tagless paragraph as one block", () => {
    const doc = docFromHtml("just some words");
    const ranges = textblockRanges(doc);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]?.text).toBe("just some words");
  });

  it("never descends into a textblock's inline children (no duplicates)", () => {
    const html = "<p>One <strong>two</strong> three.</p>";
    expect(textblockRanges(docFromHtml(html))).toHaveLength(1);
  });
});

describe("blockRangeAt", () => {
  it("returns the block at an index, and null when out of range", () => {
    const doc = docFromHtml("<p>One.</p><p>Two.</p>");
    expect(blockRangeAt(doc, 0)?.text).toBe("One.");
    expect(blockRangeAt(doc, 1)?.text).toBe("Two.");
    expect(blockRangeAt(doc, -1)).toBeNull();
    expect(blockRangeAt(doc, 2)).toBeNull();
  });
});
