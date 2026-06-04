import { describe, expect, it } from "vitest";
import { type Influence, tileInfluences } from "@/lib/quill/explain";

const concat = (segs: { text: string }[]) => segs.map((s) => s.text).join("");

describe("tileInfluences", () => {
  const original = "The vile, brooding moor swallowed the pale light.";

  it("places each influence and fills the gaps with neutral text", () => {
    const influences: Influence[] = [
      { text: "vile, brooding", weight: 0.9, reason: "menacing adjectives" },
      { text: "pale light", weight: -0.4, reason: "softens the gloom" },
    ];
    const segs = tileInfluences(original, influences);
    expect(concat(segs)).toBe(original);
    const influential = segs.filter((s) => s.weight !== 0);
    expect(influential.map((s) => s.text)).toEqual(["vile, brooding", "pale light"]);
    expect(influential[0]?.reason).toBe("menacing adjectives");
    expect(segs.every((s) => (s.weight === 0 ? s.reason === null : s.reason !== null))).toBe(true);
  });

  it("always reconstructs the original exactly", () => {
    const cases: Influence[][] = [
      [],
      [{ text: "moor", weight: 1, reason: "r" }],
      [
        { text: "The", weight: 0.2, reason: "r" },
        { text: "light.", weight: -0.5, reason: "r" },
      ],
    ];
    for (const influences of cases) {
      expect(concat(tileInfluences(original, influences))).toBe(original);
    }
  });

  it("drops influences that aren't found in order, keeping the tiling intact", () => {
    const influences: Influence[] = [
      { text: "pale light", weight: -0.4, reason: "later phrase first" },
      { text: "vile, brooding", weight: 0.9, reason: "now out of order → dropped" },
      { text: "not in the text at all", weight: 0.5, reason: "absent → dropped" },
    ];
    const segs = tileInfluences(original, influences);
    expect(concat(segs)).toBe(original);
    expect(segs.filter((s) => s.weight !== 0).map((s) => s.text)).toEqual(["pale light"]);
  });

  it("returns a single neutral segment when there are no influences", () => {
    const segs = tileInfluences(original, []);
    expect(segs).toEqual([{ text: original, weight: 0, reason: null }]);
  });

  it("clamps weights into [-1, 1]", () => {
    const segs = tileInfluences(original, [
      { text: "vile, brooding", weight: 5, reason: "r" },
      { text: "pale light", weight: -9, reason: "r" },
    ]);
    const weights = segs.filter((s) => s.weight !== 0).map((s) => s.weight);
    expect(weights).toEqual([1, -1]);
  });

  it("matches a repeated phrase at successive occurrences", () => {
    const text = "red then red again";
    const segs = tileInfluences(text, [
      { text: "red", weight: 1, reason: "first" },
      { text: "red", weight: 0.5, reason: "second" },
    ]);
    expect(concat(segs)).toBe(text);
    expect(segs.filter((s) => s.weight !== 0)).toHaveLength(2);
  });

  it("handles empty text", () => {
    expect(tileInfluences("", [])).toEqual([]);
  });
});
