"use client";

import { useEffect } from "react";
import { Blot } from "@/components/landing/blot";
import { Button } from "@/components/ui/button";

// Tab-specific error boundary — catches errors thrown by the (tabs) layout
// (e.g. ensureScribe failing) or by any tab page's data fetch. Replaces the
// silent empty-array fallback that used to mask DB errors as "no books yet".
export default function TabsError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Tab surface error:", error);
  }, [error]);

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-20">
        <div className="absolute top-1/3 right-1/4 inklings-drift">
          <Blot color="oklch(0.55 0.2 290)" size={260} shape={1} />
        </div>
      </div>

      <h1 className="font-display text-4xl tracking-tight text-ink-deep sm:text-5xl">
        This surface can't load.
      </h1>
      <p className="mt-4 font-serif text-lg italic text-ink-bleed">
        The corpus is probably fine — give it a moment and try again.
      </p>
      {error.message && (
        <code className="mt-5 max-w-md truncate rounded-md border border-dashed border-border bg-muted/60 px-3 py-1.5 text-[11px] text-muted-foreground">
          {error.message}
        </code>
      )}
      <Button onClick={unstable_retry} className="mt-8">
        Retry
      </Button>
    </div>
  );
}
