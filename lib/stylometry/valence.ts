// Per-sentence valence via wink-nlp's AFINN-backed sentiment — lexicon-based,
// CPU-only, free. Deliberately humble: this is "mood as a lexicon reads it",
// not ground truth, and the Quill labels it that way.

import model from "wink-eng-lite-web-model";
import winkNLP, { type ItemSentence } from "wink-nlp";

const nlp = winkNLP(model);
const its = nlp.its;

export type ValencePoint = {
  /** Lexicon sentiment of one sentence, roughly -1..1. */
  valence: number;
  /** Which draft paragraph the sentence came from — drives hover→highlight. */
  paragraphIndex: number;
};

/**
 * Sentence-level valence across the draft's paragraphs, in reading order.
 * Paragraphs are processed separately so every sentence keeps an honest
 * paragraph index even when wink would merge boundaries differently.
 */
export function paragraphValences(paragraphs: readonly string[]): ValencePoint[] {
  const points: ValencePoint[] = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const doc = nlp.readDoc(paragraph);
    doc.sentences().each((sentence: ItemSentence) => {
      const valence = sentence.out(its.sentiment);
      if (typeof valence === "number" && Number.isFinite(valence)) {
        points.push({ valence, paragraphIndex });
      }
    });
  });
  return points;
}
