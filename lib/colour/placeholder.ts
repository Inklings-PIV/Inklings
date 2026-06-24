// Placeholder colouring for sources whose real deriver hasn't landed yet
// (#25 LLM, #26 crowd, #27 blended). The algorithmic deriver IS shipped — pass
// its `book_colours` row as the `override` and `hueFor` will use real HSL.
//
// Without an override: hashes bookId to a stable base hue and rotates by source,
// so the four chips per book and the dot colours on the canvas stay consistent.

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

export type HSLOverride = {
  hue: number;
  saturation: number;
  lightness: number;
  /** Saved with the colour row; surfaces in chip tooltips + detail panel. */
  justification?: string | null;
};

export function hueFor(bookId: string, source: HueSource, override?: HSLOverride | null): Hue {
  if (override) return hueFromHSL(override.hue, override.saturation, override.lightness);

  let h = 0;
  for (let i = 0; i < bookId.length; i++) {
    h = (h * 31 + bookId.charCodeAt(i)) | 0;
  }
  const base = ((h % 360) + 360) % 360;
  const hue = (base + SOURCE_OFFSET[source]) % 360;
  return {
    rgb: hslToRgb(hue, 60, 55),
    css: `hsl(${hue.toFixed(0)} 60% 55%)`,
    hue,
  };
}

// Saturation cap for the ink-on-paper feel — high-chroma colours read as neon
// against the paper. Only saturation is clamped: lightness is left untouched so
// the achromatic agents keep their extremes (near-white ~92, near-black ~22).
const INK_MAX_SATURATION = 60;

/** Pure HSL→display conversion shared by every real-source deriver. The CSS is a
 *  native hsl() string so it matches the HSL exactly — feeding HSL hue degrees
 *  into an oklch() string renders a completely different colour (the wheels don't
 *  align: HSL 65° yellow ≈ OKLCH 110°, while OKLCH 65° is orange). Saturation is
 *  muted toward ink; the input hue/lightness are preserved. */
export function hueFromHSL(hue: number, saturation: number, lightness: number): Hue {
  const s = Math.min(saturation, INK_MAX_SATURATION);
  return {
    rgb: hslToRgb(hue, s, lightness),
    css: `hsl(${hue.toFixed(0)} ${s}% ${lightness}%)`,
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
