// Counterfactual hue explanation (#2): which words drive the prose's colour, and
// why. The model returns the influential phrases; this tiles them back over the
// analysed text so the overlay can shade each one. Amin's XAI line — not just
// *what* colour, but *what in the text* makes it, and what would change it.

/** A phrase the model flagged as driving (or fighting) the prose's hue. */
export type Influence = {
  /** Exact substring quoted from the analysed text. */
  text: string;
  /** -1 (pulls against the hue) … +1 (defines it). */
  weight: number;
  /** Short justification, e.g. "menacing adjectives". */
  reason: string;
};

/** A run of the analysed text, tagged with how much it drives the hue. */
export type HueSegment = {
  text: string;
  /** -1..1; 0 for the neutral connective tissue between influences. */
  weight: number;
  /** The model's reason — present only on influential segments. */
  reason: string | null;
};

/**
 * Tile `original` into segments, placing each influence at its location and
 * filling the gaps with neutral (weight 0) text. Influences are matched in
 * order from a moving cursor, so the result always reconstructs `original`
 * exactly (`segments.map(s => s.text).join("") === original`) however loosely
 * the model quoted — anything not found in order is dropped, never trusted to
 * tile the text itself. This is the span-fidelity guarantee the diff path needs
 * the model to honour, here enforced by construction instead.
 */
export function tileInfluences(original: string, influences: Influence[]): HueSegment[] {
  const segments: HueSegment[] = [];
  let cursor = 0;
  for (const inf of influences) {
    if (!inf.text) continue;
    const at = original.indexOf(inf.text, cursor);
    if (at < 0) continue; // not found at/after the cursor → drop it
    if (at > cursor) {
      segments.push({ text: original.slice(cursor, at), weight: 0, reason: null });
    }
    segments.push({
      text: inf.text,
      weight: Math.max(-1, Math.min(1, inf.weight)),
      reason: inf.reason,
    });
    cursor = at + inf.text.length;
  }
  if (cursor < original.length) {
    segments.push({ text: original.slice(cursor), weight: 0, reason: null });
  }
  return segments;
}
