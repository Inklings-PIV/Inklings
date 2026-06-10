import { describe, expect, it } from "vitest";
import { type DraftVersion, MAX_VERSIONS, pushVersion } from "@/lib/quill/history";

const v = (html: string, takenAt = 0): DraftVersion => ({
  html,
  sourceTarget: "warmer",
  takenAt,
});

describe("pushVersion", () => {
  it("pushes newest-first", () => {
    const stack = pushVersion(pushVersion([], v("<p>one</p>")), v("<p>two</p>"));
    expect(stack.map((s) => s.html)).toEqual(["<p>two</p>", "<p>one</p>"]);
  });

  it("ignores empty snapshots", () => {
    expect(pushVersion([], v("   "))).toEqual([]);
  });

  it("dedupes a snapshot identical to the newest entry", () => {
    const once = pushVersion([], v("<p>same</p>", 1));
    const twice = pushVersion(once, v("<p>same</p>", 2));
    expect(twice).toHaveLength(1);
    expect(twice[0]?.takenAt).toBe(1);
  });

  it("allows the same html deeper in the stack (A → B → A)", () => {
    let stack = pushVersion([], v("<p>a</p>"));
    stack = pushVersion(stack, v("<p>b</p>"));
    stack = pushVersion(stack, v("<p>a</p>"));
    expect(stack.map((s) => s.html)).toEqual(["<p>a</p>", "<p>b</p>", "<p>a</p>"]);
  });

  it("caps the stack at MAX_VERSIONS, dropping the oldest", () => {
    let stack: DraftVersion[] = [];
    for (let i = 0; i < MAX_VERSIONS + 3; i++) {
      stack = pushVersion(stack, v(`<p>${i}</p>`, i));
    }
    expect(stack).toHaveLength(MAX_VERSIONS);
    expect(stack[0]?.html).toBe(`<p>${MAX_VERSIONS + 2}</p>`);
    expect(stack.at(-1)?.html).toBe(`<p>3</p>`);
  });

  it("does not mutate the input stack", () => {
    const original = pushVersion([], v("<p>one</p>"));
    const copy = [...original];
    pushVersion(original, v("<p>two</p>"));
    expect(original).toEqual(copy);
  });
});
