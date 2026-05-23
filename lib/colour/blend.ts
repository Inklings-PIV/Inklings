// Blender (#27) — combines per-source HSLs into a single blended colour.
// Today we have algorithmic + LLM; crowd (#26) joins once the game starts
// producing votes.
//
// Hue is the tricky bit: 359° and 1° should average to 0°, not 180°. We do
// a circular weighted mean via cos/sin (the same trick the by-hue UMAP uses
// for hue wraparound). Saturation and lightness are straight weighted means.

export type SourceInput = {
  hue: number;
  saturation: number;
  lightness: number;
};

export type WeightedSource = SourceInput & { weight: number };

export type BlendedColour = {
  hue: number;
  saturation: number;
  lightness: number;
  /** Programmatic — names the sources and weights actually mixed. */
  justification: string;
};

/**
 * Default weights when each source is present. Algo is stylometric so it
 * weighs the *style*; LLM weighs the *feel*; crowd weighs *what readers
 * actually see* — give the most trust to live-reader data once we have it.
 */
const DEFAULT_WEIGHTS = {
  algorithmic: 0.4,
  llm: 0.6,
  crowd: 0,
};

export function blendColours(sources: {
  algorithmic?: SourceInput | null;
  llm?: SourceInput | null;
  crowd?: SourceInput | null;
}): BlendedColour | null {
  const inputs: Array<{ name: keyof typeof DEFAULT_WEIGHTS; src: SourceInput; weight: number }> =
    [];

  if (sources.algorithmic)
    inputs.push({
      name: "algorithmic",
      src: sources.algorithmic,
      weight: DEFAULT_WEIGHTS.algorithmic,
    });
  if (sources.llm) inputs.push({ name: "llm", src: sources.llm, weight: DEFAULT_WEIGHTS.llm });
  if (sources.crowd)
    inputs.push({ name: "crowd", src: sources.crowd, weight: DEFAULT_WEIGHTS.crowd });

  if (inputs.length === 0) return null;

  // Re-normalise weights to sum to 1 over the sources that are present.
  // Otherwise blending only algo (no llm) would land at 0.4× saturation.
  const weightSum = inputs.reduce((s, i) => s + i.weight, 0);
  if (weightSum <= 0) return null;
  for (const i of inputs) i.weight /= weightSum;

  // Circular weighted mean for hue.
  let cosSum = 0;
  let sinSum = 0;
  for (const { src, weight } of inputs) {
    const rad = (src.hue * Math.PI) / 180;
    cosSum += weight * Math.cos(rad);
    sinSum += weight * Math.sin(rad);
  }
  const meanRad = Math.atan2(sinSum, cosSum);
  const hue = Math.round(((meanRad * 180) / Math.PI + 360) % 360);

  // Arithmetic weighted mean for saturation / lightness.
  const saturation = Math.round(inputs.reduce((s, i) => s + i.weight * i.src.saturation, 0));
  const lightness = Math.round(inputs.reduce((s, i) => s + i.weight * i.src.lightness, 0));

  const justification = `Blended ${inputs
    .map((i) => `${(i.weight * 100).toFixed(0)}% ${i.name}`)
    .join(" + ")}`;

  return { hue, saturation, lightness, justification };
}
