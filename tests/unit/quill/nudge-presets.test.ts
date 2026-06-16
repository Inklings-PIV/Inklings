import { describe, expect, it } from "vitest";
import { NUDGE_PRESETS, presetByKey } from "@/lib/quill/nudge-presets";

describe("NUDGE_PRESETS", () => {
  it("every preset has a key, label, and non-empty target", () => {
    for (const p of NUDGE_PRESETS) {
      expect(p.key.length).toBeGreaterThan(0);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.target.length).toBeGreaterThan(0);
    }
  });

  it("keys are unique", () => {
    const keys = NUDGE_PRESETS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("presetByKey resolves a known key and returns undefined otherwise", () => {
    expect(presetByKey("tighten")?.label).toBe("Tighten");
    expect(presetByKey("nope")).toBeUndefined();
  });
});
