import model from "wink-eng-lite-web-model";
import winkNLP, { type ItemSentence } from "wink-nlp";

const nlp = winkNLP(model);
const its = nlp.its;

// ---------------------------------------------------------------------------
// Function-word vocabulary (150 stable slots)
// ---------------------------------------------------------------------------
// A fixed list keeps every book's feature vector the same shape, so #15's
// UMAP and any per-book similarity math can compare apples to apples without
// worrying about which words happened to appear in which book.
//
// Curated from canonical stylometry sources (Mosteller-Wallace, Burrows Delta)
// plus the most common English function words. ALL LOWERCASE; comparison is
// against wink-nlp's lemmatised, lowercased token stream.

export const FUNCTION_WORDS: readonly string[] = [
  "a",
  "about",
  "above",
  "after",
  "again",
  "against",
  "all",
  "also",
  "although",
  "am",
  "among",
  "an",
  "and",
  "another",
  "any",
  "are",
  "as",
  "at",
  "back",
  "be",
  "because",
  "been",
  "before",
  "being",
  "below",
  "between",
  "both",
  "but",
  "by",
  "can",
  "could",
  "did",
  "do",
  "does",
  "down",
  "during",
  "each",
  "either",
  "even",
  "every",
  "few",
  "for",
  "from",
  "had",
  "has",
  "have",
  "having",
  "he",
  "her",
  "here",
  "hers",
  "herself",
  "him",
  "himself",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "itself",
  "just",
  "like",
  "many",
  "may",
  "me",
  "might",
  "more",
  "most",
  "much",
  "must",
  "my",
  "myself",
  "neither",
  "never",
  "no",
  "nor",
  "not",
  "now",
  "of",
  "off",
  "on",
  "once",
  "only",
  "or",
  "other",
  "our",
  "ours",
  "out",
  "over",
  "own",
  "rather",
  "really",
  "same",
  "shall",
  "she",
  "should",
  "since",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "theirs",
  "them",
  "themselves",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "though",
  "through",
  "thus",
  "to",
  "too",
  "under",
  "until",
  "up",
  "upon",
  "us",
  "very",
  "was",
  "we",
  "well",
  "were",
  "what",
  "when",
  "where",
  "whether",
  "which",
  "while",
  "who",
  "whom",
  "whose",
  "why",
  "will",
  "with",
  "within",
  "without",
  "would",
  "yet",
  "you",
  "your",
] as const;

const FUNCTION_WORD_SET: ReadonlySet<string> = new Set(FUNCTION_WORDS);

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export type ClassicalFeatures = {
  wordCount: number;
  sentenceCount: number;
  sentenceLength: { mean: number; std: number; p50: number; p90: number };
  /** Simple type-token ratio (length-sensitive). */
  typeTokenRatio: number;
  /** Length-robust MTLD (mean of forward + reverse pass). */
  mtld: number;
  /** Punctuation marks per 1000 words. */
  punctuation: {
    comma: number;
    period: number;
    semicolon: number;
    colon: number;
    questionMark: number;
    exclamationMark: number;
    emDash: number;
    parenthesis: number;
  };
  /**
   * Relative frequency (occurrences / total words) of each function word.
   * Keys are always the full FUNCTION_WORDS list — zero where absent.
   */
  functionWords: Record<string, number>;
};

/**
 * Compute the classical stylometric fingerprint of a text. Pure function,
 * deterministic given the same input. No I/O.
 */
export function extractClassical(text: string): ClassicalFeatures {
  const doc = nlp.readDoc(text);

  // Token streams (all lowercase via its.normal).
  const tokenTypes = doc.tokens().out(its.type) as string[];
  const tokenValues = doc.tokens().out(its.normal);

  const words: string[] = [];
  const puncCounts = blankPunctuation();
  for (let i = 0; i < tokenTypes.length; i++) {
    const t = tokenTypes[i];
    const v = tokenValues[i];
    if (t === "word" && v) {
      words.push(v);
    } else if (t === "punctuation" && v) {
      tallyPunctuation(v, puncCounts);
    }
  }
  const totalWords = words.length;

  // Per-sentence word counts. Drop empty sentences (wink-nlp emits a sentinel
  // sentence for empty input; we want sentenceCount == 0 in that case).
  const sentenceWordCounts: number[] = [];
  doc.sentences().each((s: ItemSentence) => {
    const types = s.tokens().out(its.type) as string[];
    let n = 0;
    for (const t of types) if (t === "word") n++;
    if (n > 0) sentenceWordCounts.push(n);
  });

  return {
    wordCount: totalWords,
    sentenceCount: sentenceWordCounts.length,
    sentenceLength: summaryStats(sentenceWordCounts),
    typeTokenRatio: totalWords > 0 ? new Set(words).size / totalWords : 0,
    mtld: computeMtld(words),
    punctuation: normalisePunctuation(puncCounts, totalWords),
    functionWords: functionWordFreqs(words),
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function summaryStats(xs: number[]): { mean: number; std: number; p50: number; p90: number } {
  if (xs.length === 0) return { mean: 0, std: 0, p50: 0, p90: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((acc, x) => acc + (x - mean) ** 2, 0) / xs.length;
  const std = Math.sqrt(variance);
  const sorted = [...xs].sort((a, b) => a - b);
  return {
    mean,
    std,
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(((p / 100) * sorted.length) | 0));
  return sorted[idx] ?? 0;
}

/**
 * MTLD: Measure of Textual Lexical Diversity (McCarthy 2005). Length-robust
 * replacement for naive TTR. Returns the mean of forward and reverse passes.
 */
function computeMtld(words: string[], threshold = 0.72): number {
  if (words.length === 0) return 0;
  const forward = mtldSinglePass(words, threshold);
  const reverse = mtldSinglePass([...words].reverse(), threshold);
  return (forward + reverse) / 2;
}

function mtldSinglePass(words: string[], threshold: number): number {
  let factors = 0;
  let types = new Set<string>();
  let tokens = 0;
  let ttr = 1;
  for (const w of words) {
    types.add(w);
    tokens++;
    ttr = types.size / tokens;
    if (ttr <= threshold) {
      factors++;
      types = new Set();
      tokens = 0;
      ttr = 1;
    }
  }
  // Partial factor proportional to how far the trailing segment moved toward
  // the threshold (canonical MTLD treatment of the remainder).
  if (tokens > 0) {
    const remainder = (1 - ttr) / (1 - threshold);
    factors += Number.isFinite(remainder) ? remainder : 1;
  }
  if (factors === 0) factors = 1;
  return words.length / factors;
}

type PunctuationCounts = {
  comma: number;
  period: number;
  semicolon: number;
  colon: number;
  questionMark: number;
  exclamationMark: number;
  emDash: number;
  parenthesis: number;
};

function blankPunctuation(): PunctuationCounts {
  return {
    comma: 0,
    period: 0,
    semicolon: 0,
    colon: 0,
    questionMark: 0,
    exclamationMark: 0,
    emDash: 0,
    parenthesis: 0,
  };
}

function tallyPunctuation(token: string, c: PunctuationCounts): void {
  switch (token) {
    case ",":
      c.comma++;
      break;
    case ".":
    case "...":
    case "…":
      c.period++;
      break;
    case ";":
      c.semicolon++;
      break;
    case ":":
      c.colon++;
      break;
    case "?":
      c.questionMark++;
      break;
    case "!":
      c.exclamationMark++;
      break;
    case "—":
    case "–":
    case "--":
      c.emDash++;
      break;
    case "(":
    case ")":
    case "[":
    case "]":
      c.parenthesis++;
      break;
    default:
      break;
  }
}

function normalisePunctuation(c: PunctuationCounts, totalWords: number) {
  const per1k = (n: number) => (totalWords > 0 ? (n / totalWords) * 1000 : 0);
  return {
    comma: per1k(c.comma),
    period: per1k(c.period),
    semicolon: per1k(c.semicolon),
    colon: per1k(c.colon),
    questionMark: per1k(c.questionMark),
    exclamationMark: per1k(c.exclamationMark),
    emDash: per1k(c.emDash),
    parenthesis: per1k(c.parenthesis),
  };
}

function functionWordFreqs(words: string[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const fw of FUNCTION_WORDS) counts.set(fw, 0);
  for (const w of words) {
    if (FUNCTION_WORD_SET.has(w)) {
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  const out: Record<string, number> = {};
  const total = words.length || 1;
  for (const fw of FUNCTION_WORDS) {
    out[fw] = (counts.get(fw) ?? 0) / total;
  }
  return out;
}
