import { hueFor } from "@/lib/colour/placeholder";
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
}: {
  label: string;
  color: string;
  ring?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-1 rounded-full border border-border bg-background/70 px-1.5 py-0.5"
      title={label}
    >
      <span
        className="size-3 rounded-full border border-border/60"
        style={{
          backgroundColor: color,
          boxShadow: ring ? "0 0 0 1px var(--ring)" : undefined,
        }}
      />
      <span className="text-[10px] tracking-wider text-muted-foreground uppercase">{label}</span>
    </div>
  );
}

/** Renders the four per-source hue chips for a book. */
export function SourceHues({ bookId }: { bookId: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <HueChip label="Algo" color={hueFor(bookId, "algorithmic").css} />
      <HueChip label="LLM" color={hueFor(bookId, "llm").css} />
      <HueChip label="Crowd" color={hueFor(bookId, "crowd").css} />
      <HueChip label="Blend" color={hueFor(bookId, "blended").css} ring />
    </div>
  );
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
