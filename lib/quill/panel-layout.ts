// Sidebar widget layout for the Quill — an ordered, zoned list. Array order is
// the render order *within* a zone (rendering filters by zone, preserving
// order); cross-zone array order is irrelevant. Presets seed this list; drag
// reorders it. The whole array is persisted to localStorage.

export type Zone = "left" | "right";
export type PanelItem = { key: string; zone: Zone; collapsed?: boolean };

// Every widget that can live in a sidebar, in add-menu order. `band` is a member
// but renders in the editor column (not a draggable card) until the #3 merge
// folds it into the hue widget — it has no node in the zone render.
export const PANEL_CATALOGUE = [
  { key: "hue", label: "Hue readout" },
  { key: "fingerprint", label: "Style fingerprint" },
  { key: "band", label: "Hue band" },
  { key: "arc", label: "Story shape" },
  { key: "neighbours", label: "Nearest authors" },
  { key: "version", label: "Versions" },
  { key: "target", label: "Rewrite" },
  { key: "save", label: "Save to scribe" },
] as const;

export const PANEL_LABELS: Record<string, string> = Object.fromEntries(
  PANEL_CATALOGUE.map((p) => [p.key, p.label]),
);

// Preset templates — applying one overwrites the layout (a reset, not a live
// mode). Everything seeds into the right zone; drag to the left as desired.
export const PRESET_SEEDS = {
  essentials: ["hue", "save"],
  analyse: ["hue", "fingerprint", "band", "arc", "neighbours"],
  rewrite: ["target", "version"],
} as const satisfies Record<string, readonly string[]>;

export type PresetName = keyof typeof PRESET_SEEDS;

export const PRESET_LABELS: Record<PresetName, string> = {
  essentials: "Essentials",
  analyse: "Analyse",
  rewrite: "Rewrite",
};

export function seedLayout(preset: PresetName): PanelItem[] {
  return PRESET_SEEDS[preset].map((key): PanelItem => ({ key, zone: "right" }));
}

/** The layout for a preset's workspace: its saved arrangement if the writer has
 *  touched it, otherwise the suggested seed. Each preset persists separately, so
 *  switching presets is switching workspaces, not resetting. */
export function resolveLayout(
  workspaces: Record<string, PanelItem[]>,
  preset: PresetName,
): PanelItem[] {
  return workspaces[preset] ?? seedLayout(preset);
}

/** Move `key` into `zone`, positioned before `beforeKey` (or to the end of the
 *  zone when `beforeKey` is null). Pure; returns a new array (or the same
 *  reference when `key` isn't present). */
export function reorderPanels(
  layout: PanelItem[],
  key: string,
  zone: Zone,
  beforeKey: string | null,
): PanelItem[] {
  const moving = layout.find((p) => p.key === key);
  if (!moving) return layout;
  const rest = layout.filter((p) => p.key !== key);
  const item: PanelItem = { ...moving, zone };
  const result: PanelItem[] = [];
  let inserted = false;
  for (const p of rest) {
    if (!inserted && p.zone === zone && p.key === beforeKey) {
      result.push(item);
      inserted = true;
    }
    result.push(p);
  }
  // No anchor matched (append, or beforeKey in another zone): push at the end.
  // Filtering by zone preserves array order, so this lands last in its zone.
  if (!inserted) result.push(item);
  return result;
}
