import { describe, expect, it } from "vitest";
import { STYLE_WIDGETS, widgetsToTarget } from "@/lib/quill/widgets";

describe("STYLE_WIDGETS", () => {
  it("has unique widget keys and option values", () => {
    const keys = STYLE_WIDGETS.map((w) => w.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const w of STYLE_WIDGETS) {
      const values = w.options.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });
});

describe("widgetsToTarget", () => {
  it("returns the empty string when nothing is active", () => {
    expect(widgetsToTarget({})).toBe("");
    expect(widgetsToTarget({ tone: null })).toBe("");
  });

  it("emits a single active widget's phrase", () => {
    expect(widgetsToTarget({ tone: "warm" })).toBe("warmer and more intimate in voice");
  });

  it("composes widgets in declaration order, semicolon-joined", () => {
    const target = widgetsToTarget({ register: "plain", tone: "cool" });
    expect(target).toBe("cooler and more detached, a touch ironic; plain, everyday words");
  });

  it("appends the free-text note last", () => {
    const target = widgetsToTarget({ tone: "warm" }, "  like late Ishiguro ");
    expect(target).toBe("warmer and more intimate in voice; like late Ishiguro");
  });

  it("works with the free-text note alone", () => {
    expect(widgetsToTarget({}, "lush, baroque")).toBe("lush, baroque");
  });

  it("ignores unknown keys and unknown option values", () => {
    expect(widgetsToTarget({ nope: "x", tone: "doesnt-exist" })).toBe("");
  });
});
