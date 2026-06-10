import { describe, expect, it } from "vitest";
import { VARIANT_LENSES, variantTarget } from "@/lib/quill/variants";

describe("VARIANT_LENSES", () => {
  it("has three lenses with unique keys", () => {
    expect(VARIANT_LENSES).toHaveLength(3);
    expect(new Set(VARIANT_LENSES.map((l) => l.key)).size).toBe(3);
  });

  it("every lens key resolves a variant target", () => {
    for (const lens of VARIANT_LENSES) {
      expect(variantTarget(lens.key, "warmer")).toBeTruthy();
    }
  });
});

describe("variantTarget", () => {
  it("passes the balanced lens through untouched", () => {
    expect(variantTarget("balanced", " warmer ")).toBe("warmer");
  });

  it("wraps light and bold lenses around the target", () => {
    expect(variantTarget("light", "warmer")).toContain("warmer");
    expect(variantTarget("light", "warmer")).toContain("lightest");
    expect(variantTarget("bold", "warmer")).toContain("boldly");
  });

  it("returns null for empty targets and unknown lenses", () => {
    expect(variantTarget("balanced", "  ")).toBeNull();
    expect(variantTarget("nope", "warmer")).toBeNull();
  });
});
