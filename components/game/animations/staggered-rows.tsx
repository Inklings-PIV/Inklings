"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Children fade in one at a time with a small upward translate, like a
 * clerk writing them down. Used for the leaderboard refresh after each
 * scored round.
 *
 * Re-animates whenever the items array's keys (per keyFn) change, so
 * the list shouldn't be memoised externally if you want the stagger to
 * play on every refresh.
 */
export function StaggeredRows<T>({
  items,
  keyFn,
  renderItem,
  itemClassName,
  className,
  staggerMs = 60,
}: {
  items: T[];
  keyFn: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => ReactNode;
  itemClassName?: string | ((item: T, index: number) => string);
  className?: string;
  staggerMs?: number;
}) {
  const reducedMotion = useReducedMotion();

  const resolveItemClass = (item: T, index: number): string | undefined => {
    if (typeof itemClassName === "function") return itemClassName(item, index);
    return itemClassName;
  };

  if (reducedMotion) {
    return (
      <ol className={className}>
        {items.map((item, i) => (
          <li key={keyFn(item, i)} className={resolveItemClass(item, i)}>
            {renderItem(item, i)}
          </li>
        ))}
      </ol>
    );
  }

  const containerVariants = {
    visible: { transition: { staggerChildren: staggerMs / 1000 } },
  } as const;

  const itemVariants = {
    hidden: { opacity: 0, y: -4 },
    visible: { opacity: 1, y: 0 },
  } as const;

  return (
    <motion.ol
      className={className}
      initial="hidden"
      animate="visible"
      variants={containerVariants}
    >
      {items.map((item, i) => (
        <motion.li
          key={keyFn(item, i)}
          variants={itemVariants}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className={resolveItemClass(item, i)}
        >
          {renderItem(item, i)}
        </motion.li>
      ))}
    </motion.ol>
  );
}
