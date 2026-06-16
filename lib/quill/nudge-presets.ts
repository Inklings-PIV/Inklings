// One-tap stylistic nudges for the editor's right-click menu. Each preset is a
// free-form target string fed to the selection rewriter — the same target
// language as the Quill's Target mode, but pre-written for common moves so a
// writer can nudge a sentence without typing a brief.

export type NudgePreset = {
  key: string;
  label: string;
  /** Target descriptor handed to the rewriter. */
  target: string;
};

export const NUDGE_PRESETS: readonly NudgePreset[] = [
  {
    key: "tighten",
    label: "Tighten",
    target: "tighter and leaner — cut filler, shorten without losing meaning",
  },
  { key: "soften", label: "Soften", target: "softer and gentler in tone, less forceful" },
  { key: "vivid", label: "Make vivid", target: "more vivid and sensory, with concrete imagery" },
  {
    key: "plainer",
    label: "Plainer",
    target: "plainer and simpler — everyday words, shorter sentences",
  },
  { key: "warmer", label: "Warmer", target: "warmer and more intimate in voice" },
  { key: "cooler", label: "Cooler", target: "cooler and more detached, a touch ironic" },
] as const;

export function presetByKey(key: string): NudgePreset | undefined {
  return NUDGE_PRESETS.find((p) => p.key === key);
}
