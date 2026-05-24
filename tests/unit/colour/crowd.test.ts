import { describe, expect, it } from "vitest";
import { aggregateCrowdColour } from "@/lib/colour/crowd";

describe("aggregateCrowdColour", () => {
  it("returns null below the minimum vote threshold", () => {
    expect(aggregateCrowdColour([])).toBeNull();
    expect(
      aggregateCrowdColour([
        { hue: 200, saturation: 60, lightness: 50 },
        { hue: 210, saturation: 60, lightness: 50 },
      ]),
    ).toBeNull();
  });

  it("averages 3+ votes via circular mean for hue", () => {
    // Three votes clustered around 0°/360° seam — should average to ~0°.
    const out = aggregateCrowdColour([
      { hue: 358, saturation: 60, lightness: 50 },
      { hue: 2, saturation: 60, lightness: 50 },
      { hue: 0, saturation: 60, lightness: 50 },
    ]);
    expect(out).not.toBeNull();
    if (!out) return;
    const wrapped = Math.min(out.hue, 360 - out.hue);
    expect(wrapped).toBeLessThan(3);
  });

  it("uses arithmetic mean for saturation and lightness", () => {
    const out = aggregateCrowdColour([
      { hue: 100, saturation: 20, lightness: 40 },
      { hue: 100, saturation: 60, lightness: 60 },
      { hue: 100, saturation: 100, lightness: 80 },
    ]);
    expect(out?.saturation).toBe(60);
    expect(out?.lightness).toBe(60);
  });

  it("justification includes the vote count and pluralises", () => {
    const one = aggregateCrowdColour(
      Array.from({ length: 3 }, () => ({ hue: 0, saturation: 50, lightness: 50 })),
    );
    expect(one?.justification).toContain("3 guesses");
  });
});
