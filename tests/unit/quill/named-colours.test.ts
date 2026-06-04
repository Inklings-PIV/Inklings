import { describe, expect, it } from "vitest";
import { NAMED_COLOURS, nameToHsl } from "@/lib/quill/named-colours";

describe("nameToHsl", () => {
  it("maps a plain colour word to a hue in the blue range", () => {
    const hsl = nameToHsl("blue");
    expect(hsl).not.toBeNull();
    expect(hsl?.hue).toBeGreaterThan(195);
    expect(hsl?.hue).toBeLessThan(250);
  });

  it("is case-insensitive", () => {
    expect(nameToHsl("Crimson")).toEqual(nameToHsl("crimson"));
    expect(nameToHsl("CRIMSON")).not.toBeNull();
  });

  it("picks the first recognised word in a multi-word target", () => {
    // "warm" is known, "melancholy" is too — the first one wins.
    expect(nameToHsl("warm, melancholy")).toEqual(NAMED_COLOURS.warm);
    expect(nameToHsl("deep ocean blue")).toEqual(NAMED_COLOURS.blue);
  });

  it("understands a few moods, not just colour names", () => {
    expect(nameToHsl("melancholy")).not.toBeNull();
    expect(nameToHsl("serene")).not.toBeNull();
  });

  it("returns null when nothing is recognised", () => {
    expect(nameToHsl("Hemingway-like")).toBeNull();
    expect(nameToHsl("lush, baroque")).toBeNull();
    expect(nameToHsl("")).toBeNull();
    expect(nameToHsl("   ")).toBeNull();
  });

  it("only ever returns valid HSL values", () => {
    for (const hsl of Object.values(NAMED_COLOURS)) {
      expect(hsl.hue).toBeGreaterThanOrEqual(0);
      expect(hsl.hue).toBeLessThanOrEqual(360);
      expect(hsl.saturation).toBeGreaterThanOrEqual(0);
      expect(hsl.saturation).toBeLessThanOrEqual(100);
      expect(hsl.lightness).toBeGreaterThanOrEqual(0);
      expect(hsl.lightness).toBeLessThanOrEqual(100);
    }
  });
});
