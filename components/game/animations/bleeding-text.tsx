"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Word-by-word fade-in for the game's smudge excerpt. Mounted inside the
 * <Smudge> card; triggered on every new round by re-keying the parent so
 * this remounts and re-animates.
 *
 * The total sweep is bounded at ~500 ms regardless of word count — the
 * per-word delay shrinks for long excerpts so the bleed never feels slow.
 * Whitespace tokens are passed through verbatim so the text wraps the
 * same way it would without animation.
 */
export function BleedingText({ text }: { text: string }) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion || text.length === 0) {
    return <>{text}</>;
  }

  // Split keeping whitespace so spaces / newlines stay as their own tokens
  // and don't get wrapped in motion.span (which would break inline wrap).
  const tokens = text.split(/(\s+)/);
  const wordCount = tokens.filter((t) => t.trim().length > 0).length;
  const totalSweepSec = 0.5;
  let wordIndex = 0;

  return (
    <>
      {tokens.map((tok, i) => {
        // The parent re-keys this component on every new round, so token
        // position within a given excerpt is stable — index keys are safe.
        if (tok.trim().length === 0)
          // biome-ignore lint/suspicious/noArrayIndexKey: stable within a single excerpt
          return <span key={`ws-${i}`}>{tok}</span>;
        const delay = wordCount > 0 ? (wordIndex / wordCount) * totalSweepSec : 0;
        wordIndex++;
        return (
          <motion.span
            // biome-ignore lint/suspicious/noArrayIndexKey: stable within a single excerpt
            key={`w-${i}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay, duration: 0.2, ease: "easeOut" }}
          >
            {tok}
          </motion.span>
        );
      })}
    </>
  );
}
