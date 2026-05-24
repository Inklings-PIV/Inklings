// Temporary admin gate — env-var allowlist of scribe DB ids. Replaced by
// BetterAuth roles once #80 lands; until then the lone developer pastes
// their own scribe id into MODERATOR_SCRIBE_IDS and gets /admin/* access.

import { env } from "@/lib/env";

let cached: Set<string> | null = null;

function getModeratorSet(): Set<string> {
  if (cached) return cached;
  const ids = env.MODERATOR_SCRIBE_IDS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  cached = new Set(ids);
  return cached;
}

export function isModerator(scribeId: string): boolean {
  return getModeratorSet().has(scribeId);
}
