import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stripGutenbergBoilerplate } from "@/lib/ingestion/gutenberg-text";

const fixture = (name: string) => readFileSync(resolve("tests/fixtures", name), "utf8");

describe("stripGutenbergBoilerplate", () => {
  it("returns the body between START and END markers", () => {
    const out = stripGutenbergBoilerplate(fixture("gutenberg-sample.txt"));
    expect(out).not.toBeNull();
    expect(out).toContain("It is a truth universally acknowledged");
    expect(out).toContain("CHAPTER I.");
  });

  it("does not include the START or END markers", () => {
    const out = stripGutenbergBoilerplate(fixture("gutenberg-sample.txt"));
    expect(out).not.toMatch(/\*{3}\s*START OF/i);
    expect(out).not.toMatch(/\*{3}\s*END OF/i);
  });

  it("does not include the pre-START header (title, license blurb)", () => {
    const out = stripGutenbergBoilerplate(fixture("gutenberg-sample.txt"));
    expect(out).not.toContain("Release date");
    expect(out).not.toContain("Title: Pride and Prejudice");
    expect(out).not.toContain("This ebook is for the use of");
  });

  it("does not include the post-END licence boilerplate", () => {
    const out = stripGutenbergBoilerplate(fixture("gutenberg-sample.txt"));
    expect(out).not.toContain("START: FULL LICENSE");
    expect(out).not.toContain("Updated editions will replace");
  });

  it("returns the trimmed body (no leading or trailing whitespace)", () => {
    const out = stripGutenbergBoilerplate(fixture("gutenberg-sample.txt"));
    expect(out).toBe(out?.trim());
  });

  it("returns null when the START marker is missing", () => {
    expect(stripGutenbergBoilerplate("just some text, no markers")).toBeNull();
  });

  it("returns null on empty input", () => {
    expect(stripGutenbergBoilerplate("")).toBeNull();
  });

  it("returns null when the body between markers is whitespace only", () => {
    const raw =
      "*** START OF THE PROJECT GUTENBERG EBOOK X ***\n\n\n*** END OF THE PROJECT GUTENBERG EBOOK X ***";
    expect(stripGutenbergBoilerplate(raw)).toBeNull();
  });

  it("handles 'THIS PROJECT GUTENBERG' variant", () => {
    const raw =
      "preamble\n*** START OF THIS PROJECT GUTENBERG EBOOK FOO ***\nbody\n*** END OF THIS PROJECT GUTENBERG EBOOK FOO ***\nfooter";
    expect(stripGutenbergBoilerplate(raw)).toBe("body");
  });

  it("returns everything after START when END marker is missing", () => {
    const raw =
      "preamble\n*** START OF THE PROJECT GUTENBERG EBOOK FOO ***\nthe whole body, no end marker\n";
    const out = stripGutenbergBoilerplate(raw);
    expect(out).toBe("the whole body, no end marker");
  });
});
