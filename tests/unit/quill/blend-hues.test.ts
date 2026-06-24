import { describe, expect, it } from "vitest";
import { blendHues, colourDropByKey } from "@/components/quill/colour-drop";

const green = colourDropByKey("green")?.hsl;
const white = colourDropByKey("white")?.hsl;
const black = colourDropByKey("black")?.hsl;

describe("blendHues", () => {
  it("tints with white toward pastel, not toward white's nominal hue (beige bug)", () => {
    if (!green || !white) throw new Error("missing pigment");
    const blend = blendHues([
      { hsl: green, weight: 1 },
      { hsl: white, weight: 1 },
    ]);
    expect(blend).not.toBeNull();
    if (!blend) return;
    // Hue stays in the green band — white must not drag it toward its 60° yellow.
    expect(blend.hue).toBeGreaterThan(110);
    expect(blend.hue).toBeLessThan(150);
    // …and it actually lightens + softens.
    expect(blend.lightness).toBeGreaterThan(green.lightness);
    expect(blend.saturation).toBeLessThan(green.saturation);
  });

  it("shades with black toward a darker green, hue held", () => {
    if (!green || !black) throw new Error("missing pigment");
    const blend = blendHues([
      { hsl: green, weight: 1 },
      { hsl: black, weight: 1 },
    ]);
    expect(blend?.hue).toBeGreaterThan(110);
    expect(blend?.hue).toBeLessThan(150);
    expect(blend?.lightness).toBeLessThan(green.lightness);
  });

  it("returns null for no parts", () => {
    expect(blendHues([])).toBeNull();
  });
});
