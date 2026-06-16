// Input bounds for the Quill's model-backed server actions. A server action is
// a public endpoint: without a cap, a single huge paste (or a crafted call)
// turns into an unbounded, expensive LLM request. We clamp the text we send and
// cap how many paragraphs the EmoArc band fans out to.

/** Max characters sent to the model in one derivation (~a few thousand tokens). */
export const MODEL_MAX_CHARS = 12_000;

/** Max paragraphs the hue band derives in one call. */
export const MAX_BAND_PARAGRAPHS = 40;

/** Truncate text to a safe length before sending it to the model. */
export function clampForModel(text: string, max: number = MODEL_MAX_CHARS): string {
  return text.length > max ? text.slice(0, max) : text;
}
