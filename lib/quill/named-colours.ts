// A small lexicon of colour and mood words → HSL, so the "drift to target"
// meter (#5) can resolve a target like "blue" or "warm, melancholy" instantly
// and for free. Anything not in here falls back to the model (deriveTargetColour).
// Lightness stays in the app's ink range (~35–68) so target swatches read as ink
// on paper, matching deriveTextColour's palette.

import type { Hsl } from "./colour-distance";

export const NAMED_COLOURS: Record<string, Hsl> = {
  // Plain colours
  red: { hue: 2, saturation: 75, lightness: 52 },
  crimson: { hue: 348, saturation: 78, lightness: 50 },
  scarlet: { hue: 8, saturation: 80, lightness: 52 },
  orange: { hue: 28, saturation: 80, lightness: 55 },
  amber: { hue: 42, saturation: 82, lightness: 55 },
  gold: { hue: 46, saturation: 75, lightness: 58 },
  yellow: { hue: 52, saturation: 80, lightness: 60 },
  lime: { hue: 90, saturation: 65, lightness: 55 },
  green: { hue: 135, saturation: 55, lightness: 48 },
  emerald: { hue: 155, saturation: 60, lightness: 45 },
  teal: { hue: 178, saturation: 55, lightness: 45 },
  cyan: { hue: 190, saturation: 65, lightness: 52 },
  sky: { hue: 205, saturation: 70, lightness: 60 },
  blue: { hue: 220, saturation: 70, lightness: 52 },
  indigo: { hue: 255, saturation: 60, lightness: 50 },
  violet: { hue: 270, saturation: 55, lightness: 55 },
  purple: { hue: 280, saturation: 55, lightness: 50 },
  magenta: { hue: 312, saturation: 70, lightness: 55 },
  pink: { hue: 330, saturation: 70, lightness: 65 },
  rose: { hue: 345, saturation: 65, lightness: 62 },
  brown: { hue: 25, saturation: 45, lightness: 40 },
  grey: { hue: 220, saturation: 6, lightness: 55 },
  gray: { hue: 220, saturation: 6, lightness: 55 },
  black: { hue: 260, saturation: 10, lightness: 24 },
  white: { hue: 60, saturation: 6, lightness: 88 },
  // Moods — mapped the same way deriveTextColour reads a feel
  warm: { hue: 25, saturation: 70, lightness: 58 },
  cool: { hue: 210, saturation: 55, lightness: 55 },
  cold: { hue: 210, saturation: 50, lightness: 55 },
  hot: { hue: 8, saturation: 82, lightness: 52 },
  icy: { hue: 195, saturation: 45, lightness: 68 },
  passionate: { hue: 352, saturation: 80, lightness: 52 },
  romantic: { hue: 338, saturation: 60, lightness: 62 },
  melancholy: { hue: 225, saturation: 35, lightness: 48 },
  melancholic: { hue: 225, saturation: 35, lightness: 48 },
  gloomy: { hue: 250, saturation: 25, lightness: 38 },
  somber: { hue: 250, saturation: 22, lightness: 38 },
  serene: { hue: 185, saturation: 40, lightness: 62 },
  calm: { hue: 190, saturation: 38, lightness: 60 },
  cheerful: { hue: 50, saturation: 80, lightness: 62 },
  joyful: { hue: 50, saturation: 82, lightness: 62 },
  gothic: { hue: 285, saturation: 40, lightness: 35 },
  dreamy: { hue: 275, saturation: 50, lightness: 60 },
  earthy: { hue: 30, saturation: 45, lightness: 45 },
  nostalgic: { hue: 38, saturation: 50, lightness: 58 },
};

/**
 * Resolve a target descriptor to a colour by scanning it for a known colour or
 * mood word, left to right — so "warm, melancholy" resolves to "warm" and
 * "deep ocean blue" to "blue". Returns null when nothing is recognised, leaving
 * the caller to fall back to the model.
 */
export function nameToHsl(input: string): Hsl | null {
  for (const token of input.toLowerCase().split(/[^a-z]+/)) {
    const hit = token && NAMED_COLOURS[token];
    if (hit) return hit;
  }
  return null;
}
