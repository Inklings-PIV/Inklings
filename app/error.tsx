"use client";

import { useEffect } from "react";
import { Blot } from "@/components/landing/blot";
import { Button } from "@/components/ui/button";

// App-wide error boundary. Tab routes have their own (tabs)/error.tsx that
// catches errors closer to the surface; this one catches anything outside
// the tabs group (landing page, top-level routes).
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Until Sentry is wired (#44 — wontfix today, may revisit), at least make
    // sure something visible exists in the browser console for triage.
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-25">
        <div className="absolute top-1/4 left-1/4 inklings-pulse">
          <Blot color="oklch(0.65 0.18 20)" size={220} shape={3} />
        </div>
      </div>

      <h1 className="font-serif text-5xl tracking-tight text-ink-deep sm:text-6xl">
        Something spilled.
      </h1>
      <p className="mt-4 font-serif text-xl italic text-ink-bleed">
        An unexpected error blotted the page.
      </p>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        It might just be a passing smudge. Try again — or come back in a moment.
      </p>
      {error.message && (
        <code className="mt-5 max-w-md truncate rounded-md border border-dashed border-border bg-muted/60 px-3 py-1.5 text-[11px] text-muted-foreground">
          {error.message}
        </code>
      )}
      <Button onClick={unstable_retry} className="mt-8">
        Try again
      </Button>
    </div>
  );
}
