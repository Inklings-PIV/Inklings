import { describe, expect, it } from "vitest";
import { clampForModel, MODEL_MAX_CHARS } from "@/lib/quill/limits";

describe("clampForModel", () => {
  it("returns short text unchanged", () => {
    expect(clampForModel("short")).toBe("short");
  });

  it("truncates text longer than the limit", () => {
    const long = "x".repeat(MODEL_MAX_CHARS + 500);
    expect(clampForModel(long)).toHaveLength(MODEL_MAX_CHARS);
  });

  it("respects a custom limit", () => {
    expect(clampForModel("abcdef", 3)).toBe("abc");
  });

  it("keeps text exactly at the limit", () => {
    const exact = "y".repeat(10);
    expect(clampForModel(exact, 10)).toBe(exact);
  });
});
