import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "@/lib/quill/markdown";

describe("htmlToMarkdown", () => {
  it("returns empty string for empty input", () => {
    expect(htmlToMarkdown("")).toBe("");
  });

  it("converts headings and paragraphs", () => {
    expect(htmlToMarkdown("<h1>Title</h1><p>Body text.</p>")).toBe("# Title\n\nBody text.");
  });

  it("converts inline bold, italic, and code", () => {
    expect(htmlToMarkdown("<p>A <strong>bold</strong> and <em>soft</em> <code>x</code></p>")).toBe(
      "A **bold** and *soft* `x`",
    );
  });

  it("converts bullet lists", () => {
    expect(htmlToMarkdown("<ul><li>one</li><li>two</li></ul>")).toBe("- one\n- two");
  });

  it("numbers ordered lists", () => {
    expect(htmlToMarkdown("<ol><li>first</li><li>second</li></ol>")).toBe("1. first\n2. second");
  });

  it("prefixes blockquotes", () => {
    expect(htmlToMarkdown("<blockquote><p>quoted</p></blockquote>")).toBe("> quoted");
  });

  it("decodes entities", () => {
    expect(htmlToMarkdown("<p>tea &amp; toast &lt;3</p>")).toBe("tea & toast <3");
  });

  it("separates paragraphs with a blank line", () => {
    expect(htmlToMarkdown("<p>one</p><p>two</p>")).toBe("one\n\ntwo");
  });
});
