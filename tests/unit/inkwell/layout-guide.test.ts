import { describe, expect, it } from "vitest";
import { type InkwellLayout, LAYOUT_GUIDE, layoutGuide } from "@/lib/inkwell/layout-guide";

const LAYOUTS: InkwellLayout[] = ["classical", "modern", "by-hue"];

describe("layoutGuide", () => {
  it("has a non-empty reading and distance hint for every layout", () => {
    for (const l of LAYOUTS) {
      const g = layoutGuide(l);
      expect(g.reading.length).toBeGreaterThan(0);
      expect(g.distance.length).toBeGreaterThan(0);
    }
  });

  it("covers exactly the three layouts", () => {
    expect(Object.keys(LAYOUT_GUIDE).sort()).toEqual(["by-hue", "classical", "modern"]);
  });

  it("is honest that UMAP axes are not semantic in the stylometry views", () => {
    expect(layoutGuide("classical").distance.toLowerCase()).toContain("umap");
    expect(layoutGuide("modern").distance.toLowerCase()).toContain("umap");
  });
});
