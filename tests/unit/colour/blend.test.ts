import { describe, expect, it } from "vitest";
import { blendColours } from "@/lib/colour/blend";

describe("blendColours", () => {
  it("returns null when no sources are provided", () => {
    expect(blendColours({})).toBeNull();
  });

  it("returns the single source's HSL when only one is present", () => {
    const out = blendColours({ algorithmic: { hue: 200, saturation: 50, lightness: 60 } });
    expect(out).toMatchObject({ hue: 200, saturation: 50, lightness: 60 });
  });

  it("circular-means hue across the 0°/360° seam", () => {
    // Red at 358° and red at 2° should blend to roughly red at 0°, NOT cyan at 180°.
    const out = blendColours({
      algorithmic: { hue: 358, saturation: 60, lightness: 50 },
      llm: { hue: 2, saturation: 60, lightness: 50 },
    });
    // 358° and 2° blended with 40/60 weight; should be near 0° (allowing for ~1° tolerance).
    expect(out).not.toBeNull();
    if (!out) return;
    const wrapped = Math.min(out.hue, 360 - out.hue);
    expect(wrapped).toBeLessThan(5);
  });

  it("weights LLM more than algorithmic by default", () => {
    const out = blendColours({
      algorithmic: { hue: 0, saturation: 100, lightness: 50 },
      llm: { hue: 0, saturation: 0, lightness: 50 },
    });
    // Default weights are algo 0.4 / llm 0.6, so saturation should land ~40.
    expect(out?.saturation).toBeGreaterThanOrEqual(38);
    expect(out?.saturation).toBeLessThanOrEqual(42);
  });

  it("renormalises weights so a lone source still uses full sat/light", () => {
    // Without renormalisation, lone algo (weight 0.4) would shrink sat to 40.
    const out = blendColours({ algorithmic: { hue: 0, saturation: 100, lightness: 50 } });
    expect(out?.saturation).toBe(100);
    expect(out?.lightness).toBe(50);
  });

  it("includes both source names in the justification", () => {
    const out = blendColours({
      algorithmic: { hue: 0, saturation: 50, lightness: 50 },
      llm: { hue: 100, saturation: 50, lightness: 50 },
    });
    expect(out?.justification).toContain("algorithmic");
    expect(out?.justification).toContain("llm");
  });
});
