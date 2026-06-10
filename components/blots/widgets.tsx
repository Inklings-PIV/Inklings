import { type HSLOverride, hueFor } from "@/lib/colour/placeholder";
import {
  circularHueDistance,
  circularMeanHue,
  describeHue,
  signedHueDelta,
  softnessBucket,
  sourceDisagreement,
} from "@/lib/colour/uncertainty";
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

type NamedSource = { label: string; hsl: HSLOverride };

/**
 * How far apart the independent hue derivations land — a hue strip centred on
 * the sources' circular mean (so 358° and 2° sit next to each other, not at
 * opposite ends) with one marker per derived method, plus a one-line read.
 * Renders an honest "nothing to compare" note below two derived sources.
 */
export function HueAgreement({
  algorithmic,
  llm,
  crowd,
}: {
  algorithmic?: HSLOverride | null;
  llm?: HSLOverride | null;
  crowd?: HSLOverride | null;
}) {
  const sources: NamedSource[] = (
    [
      ["Algo", algorithmic],
      ["LLM", llm],
      ["Crowd", crowd],
    ] as const
  ).flatMap(([label, hsl]) => (hsl ? [{ label, hsl }] : []));

  const [first, second] = sources;
  if (!first || !second) {
    return (
      <p className="text-xs italic leading-snug text-muted-foreground">
        Only one independent derivation so far — nothing to compare yet.
      </p>
    );
  }

  const hues = sources.map((s) => s.hsl.hue);
  const disagreement = sourceDisagreement(hues.map((hue) => ({ hue }))) ?? 0;
  const meanDelta = Math.round(disagreement * 180);
  const centre = circularMeanHue(hues) ?? 0;
  const bucket = softnessBucket(disagreement);

  // Name the farthest-apart pair — with two sources that's just the pair.
  let pairA = first;
  let pairB = second;
  let widest = -1;
  for (const a of sources) {
    for (const b of sources) {
      if (a === b) continue;
      const d = circularHueDistance(a.hsl.hue, b.hsl.hue);
      if (d > widest) {
        widest = d;
        pairA = a;
        pairB = b;
      }
    }
  }

  const line =
    bucket === 0
      ? `Methods agree closely (Δ${meanDelta}°).`
      : `${bucket === 1 ? "Methods lean apart" : "Methods contest this hue"} (Δ${meanDelta}°) — ${pairA.label} reads ${describeHue(pairA.hsl.hue)}, ${pairB.label} ${describeHue(pairB.hsl.hue)}.`;

  // Hue scale spanning ±90° around the circular mean; fixed S/L for legibility.
  const gradient = Array.from({ length: 7 }, (_, i) => {
    const h = (((centre - 90 + i * 30) % 360) + 360) % 360;
    return `hsl(${Math.round(h)} 65% 60%) ${Math.round((i / 6) * 100)}%`;
  }).join(", ");

  return (
    <div>
      <div
        className="relative h-2 rounded-full border border-border/60"
        style={{ background: `linear-gradient(to right, ${gradient})` }}
        role="img"
        aria-label={line}
        title="Hue scale centred on the sources' mean — one marker per method"
      >
        {sources.map((s) => {
          const pos = Math.min(0.95, Math.max(0.05, 0.5 + signedHueDelta(centre, s.hsl.hue) / 180));
          return (
            <span
              key={s.label}
              title={`${s.label} · ${Math.round(s.hsl.hue)}°`}
              className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-sm"
              style={{
                left: `${pos * 100}%`,
                backgroundColor: `hsl(${s.hsl.hue} ${s.hsl.saturation}% ${s.hsl.lightness}%)`,
              }}
            />
          );
        })}
      </div>
      <p className="mt-2 text-xs leading-snug text-muted-foreground">{line}</p>
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
