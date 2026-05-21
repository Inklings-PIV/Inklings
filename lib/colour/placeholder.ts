// Placeholder colouring until real per-source hues land in #24-#27.
// Hashes the bookId to a stable base hue and rotates by the selected source
// so the four chips per book and the dot colours on the canvas agree.

export type HueSource = "algorithmic" | "llm" | "crowd" | "blended";

const SOURCE_OFFSET: Record<HueSource, number> = {
  algorithmic: 0,
  llm: 35,
  crowd: 70,
  blended: 15,
};

export type Hue = {
  /** RGB tuple in 0–255 for canvas / WebGL consumers. */
  rgb: [number, number, number];
  /** OKLCH CSS string for HTML backgrounds. */
  css: string;
  /** Underlying hue degree (0..360). */
  hue: number;
};

export function hueFor(bookId: string, source: HueSource): Hue {
  let h = 0;
  for (let i = 0; i < bookId.length; i++) {
    h = (h * 31 + bookId.charCodeAt(i)) | 0;
  }
  const base = ((h % 360) + 360) % 360;
  const hue = (base + SOURCE_OFFSET[source]) % 360;
  return {
    rgb: hslToRgb(hue, 60, 55),
    css: `oklch(0.7 0.16 ${hue.toFixed(0)})`,
    hue,
  };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100;
  const lit = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lit, 1 - lit);
  const f = (n: number) => lit - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}
