import { type HSLOverride, hueFor } from "@/lib/colour/placeholder";
import type { ClassicalFeatures } from "@/lib/stylometry/classical";

// 28 of the most common English function words — every book's bar over these
// gives a visible per-book fingerprint shape that's stable across reads.
export const FINGERPRINT_WORDS: readonly string[] = [
  "the",
  "of",
  "and",
  "to",
  "in",
  "a",
  "he",
  "she",
  "it",
  "is",
  "was",
  "but",
  "his",
  "her",
  "for",
  "as",
  "with",
  "they",
  "be",
  "not",
  "this",
  "that",
  "from",
  "you",
  "by",
  "have",
  "had",
  "are",
];

export function HueChip({
  label,
  color,
  ring = false,
  title,
}: {
  label: string;
  color: string;
  ring?: boolean;
  /** Hover tooltip *and* the swatch's accessible name; falls back to
   * `label` when omitted. Screen readers don't read `title` reliably, so
   * we also project this string into the swatch's `aria-label`. */
  title?: string;
}) {
  const accessibleName = title ?? label;
  return (
    <div
      className="flex items-center gap-1 rounded-full border border-border bg-background/70 px-1.5 py-0.5"
      title={accessibleName}
    >
      <span
        role="img"
        aria-label={accessibleName}
        className="size-3 rounded-full border border-border/60"
        style={{
          backgroundColor: color,
          boxShadow: ring ? "0 0 0 1px var(--ring)" : undefined,
        }}
      />
      <span
        aria-hidden="true"
        className="text-[10px] tracking-wider text-muted-foreground uppercase"
      >
        {label}
      </span>
    </div>
  );
}

const PLACEHOLDER_REASON = "Placeholder colour — deriver not built yet";

/** Renders the four per-source hue chips for a book. */
export function SourceHues({
  bookId,
  algorithmic,
  llm,
  crowd,
  blended,
}: {
  bookId: string;
  /** Real HSL row when the algorithmic deriver has run; else placeholder. */
  algorithmic?: HSLOverride | null;
  /** Real HSL row when the LLM deriver has run; else placeholder. */
  llm?: HSLOverride | null;
  /** Real HSL once 3+ game votes for the book have accumulated. */
  crowd?: HSLOverride | null;
  /** Real weighted blend when at least one source has been derived. */
  blended?: HSLOverride | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <HueChip
        label="Algo"
        color={hueFor(bookId, "algorithmic", algorithmic).css}
        title={titleFor("Algo", algorithmic)}
      />
      <HueChip label="LLM" color={hueFor(bookId, "llm", llm).css} title={titleFor("LLM", llm)} />
      <HueChip
        label="Crowd"
        color={hueFor(bookId, "crowd", crowd).css}
        title={
          crowd?.justification
            ? `Crowd · ${crowd.justification}`
            : "Crowd · not enough guesses yet — play /game"
        }
      />
      <HueChip
        label="Blend"
        color={hueFor(bookId, "blended", blended).css}
        ring
        title={titleFor("Blend", blended)}
      />
    </div>
  );
}

function titleFor(label: string, override: HSLOverride | null | undefined): string {
  return override?.justification
    ? `${label} · ${override.justification}`
    : `${label} · ${PLACEHOLDER_REASON}`;
}

/** Per-book bar chart of function-word frequencies — a "fingerprint". */
export function FingerprintBars({ features }: { features: ClassicalFeatures | null }) {
  // Map function-word freq (0..~0.05 typically) into 0..1 bar height. The ×20
  // factor stretches the common range so bars are distinctive without saturating.
  const heights = FINGERPRINT_WORDS.map((w) => {
    const freq = features?.functionWords?.[w] ?? 0;
    return Math.min(1, freq * 20);
  });

  return (
    <div
      aria-hidden="true"
      className="flex h-6 items-end gap-px"
      title="Stylometric fingerprint — function-word frequencies"
    >
      {heights.map((h, i) => (
        <span
          key={FINGERPRINT_WORDS[i]}
          className="w-1 rounded-sm bg-ink-faded/60"
          style={{ height: `${Math.max(6, h * 100)}%` }}
        />
      ))}
    </div>
  );
}
