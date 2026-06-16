// Style widgets (PromptCanvas, idea #3) — the free-text target decomposed
// into composable, manipulable facets. PromptCanvas (Amin et al., arXiv
// 2506.03741) found that prompts surfaced as visible widgets beat a bare
// text box on creativity support and cognitive load. Each active widget
// contributes one phrase; widgetsToTarget composes the same target-string
// language suggestRewrite already speaks, so the backend stays untouched.

export type WidgetOption = {
  value: string;
  label: string;
  /** The phrase this option contributes to the composed rewrite target. */
  phrase: string;
};

export type StyleWidget = {
  key: string;
  label: string;
  options: readonly WidgetOption[];
};

// Four fixed facets with distinct axes — tone (temperature), rhythm
// (sentence shape), imagery (density), register (formality). Kept small on
// purpose: every option must read at a glance and compose with any other.
export const STYLE_WIDGETS: readonly StyleWidget[] = [
  {
    key: "tone",
    label: "Tone",
    options: [
      { value: "warm", label: "Warm", phrase: "warmer and more intimate in voice" },
      { value: "cool", label: "Cool", phrase: "cooler and more detached, a touch ironic" },
      { value: "playful", label: "Playful", phrase: "lighter and more playful in tone" },
      { value: "grave", label: "Grave", phrase: "graver and more solemn in tone" },
    ],
  },
  {
    key: "rhythm",
    label: "Rhythm",
    options: [
      {
        value: "clipped",
        label: "Clipped",
        phrase: "short, clipped sentences with a brisk rhythm",
      },
      { value: "flowing", label: "Flowing", phrase: "long, flowing sentences that breathe" },
      {
        value: "varied",
        label: "Varied",
        phrase: "varied sentence lengths — staccato against long arcs",
      },
    ],
  },
  {
    key: "imagery",
    label: "Imagery",
    options: [
      { value: "spare", label: "Spare", phrase: "spare, restrained imagery — say less" },
      {
        value: "sensory",
        label: "Sensory",
        phrase: "rich sensory imagery you can touch and smell",
      },
      {
        value: "figurative",
        label: "Figurative",
        phrase: "bolder metaphor and figurative language",
      },
    ],
  },
  {
    key: "register",
    label: "Register",
    options: [
      { value: "plain", label: "Plain", phrase: "plain, everyday words" },
      { value: "literary", label: "Literary", phrase: "a literary, slightly formal register" },
      { value: "ornate", label: "Ornate", phrase: "an ornate, baroque register" },
    ],
  },
];

/** Widget key → selected option value; null/absent = widget inactive. */
export type WidgetSelection = Readonly<Record<string, string | null>>;

/**
 * Composes the active widgets (in STYLE_WIDGETS order) plus an optional
 * free-text note into one target descriptor for {@link suggestRewrite}.
 * Returns "" when nothing is active — the caller treats that as "no target".
 */
export function widgetsToTarget(selection: WidgetSelection, custom = ""): string {
  const phrases = STYLE_WIDGETS.flatMap((widget) => {
    const value = selection[widget.key];
    const option = value ? widget.options.find((o) => o.value === value) : undefined;
    return option ? [option.phrase] : [];
  });
  const extra = custom.trim();
  if (extra) phrases.push(extra);
  return phrases.join("; ");
}
