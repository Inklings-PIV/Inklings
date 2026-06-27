import { describe, expect, it } from "vitest";
import { type PanelItem, reorderPanels, resolveLayout, seedLayout } from "@/lib/quill/panel-layout";

const keys = (l: PanelItem[], z: "left" | "right") =>
  l.filter((p) => p.zone === z).map((p) => p.key);

describe("reorderPanels", () => {
  const base: PanelItem[] = [
    { key: "hue", zone: "right" },
    { key: "fingerprint", zone: "right" },
    { key: "save", zone: "right" },
  ];

  it("reorders within a zone (move save before fingerprint)", () => {
    const next = reorderPanels(base, "save", "right", "fingerprint");
    expect(keys(next, "right")).toEqual(["hue", "save", "fingerprint"]);
  });

  it("moves a panel to the other zone", () => {
    const next = reorderPanels(base, "save", "left", null);
    expect(keys(next, "left")).toEqual(["save"]);
    expect(keys(next, "right")).toEqual(["hue", "fingerprint"]);
  });

  it("appends to the end of the zone when beforeKey is null", () => {
    const next = reorderPanels(base, "hue", "right", null);
    expect(keys(next, "right")).toEqual(["fingerprint", "save", "hue"]);
  });

  it("is a no-op for an unknown key", () => {
    expect(reorderPanels(base, "nope", "left", null)).toBe(base);
  });
});

describe("seedLayout", () => {
  it("seeds every preset panel into the right zone", () => {
    const next = seedLayout("analyse");
    expect(next.every((p) => p.zone === "right")).toBe(true);
    expect(next.map((p) => p.key)).toEqual(["hue", "fingerprint", "band", "arc", "neighbours"]);
  });
});

describe("resolveLayout", () => {
  it("returns the saved workspace when one exists", () => {
    const saved: PanelItem[] = [{ key: "hue", zone: "left" }];
    expect(resolveLayout({ analyse: saved }, "analyse")).toBe(saved);
  });

  it("falls back to the preset seed when the workspace is untouched", () => {
    expect(resolveLayout({}, "rewrite").map((p) => p.key)).toEqual(["target", "version"]);
  });
});
