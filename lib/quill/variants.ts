// Variant lenses (idea #4, PromptCanvas "non-linear exploration") — one
// target, three intensities of pursuing it. Instead of a single rewrite the
// writer gets a small fan of takes to compare and pick from; each lens wraps
// the composed target in intensity guidance the rewriter already understands.

export type VariantLens = {
  key: string;
  label: string;
  /** One-line description shown in the variant switcher. */
  hint: string;
};

export const VARIANT_LENSES: readonly VariantLens[] = [
  { key: "light", label: "Light touch", hint: "smallest edit that gets there" },
  { key: "balanced", label: "Balanced", hint: "even rewrite toward the target" },
  { key: "bold", label: "Bold", hint: "commit fully to the direction" },
];

/**
 * Wraps the composed target in a lens's intensity guidance. The balanced
 * lens passes the target through untouched — it *is* today's behaviour.
 * Unknown keys return null so a stale key can't silently fall back.
 */
export function variantTarget(key: string, target: string): string | null {
  const aim = target.trim();
  if (!aim) return null;
  switch (key) {
    case "light":
      return `${aim} — with the lightest possible touch: change only what the target strictly requires, keep the writer's wording wherever possible`;
    case "balanced":
      return aim;
    case "bold":
      return `${aim} — boldly: commit fully to this direction, restructure sentences where it serves the target`;
    default:
      return null;
  }
}
