import type { ReactNode } from "react";
import { TabFooter } from "@/components/tab-footer";
import { ensureScribe } from "@/lib/auth/scribe";

// Force dynamic rendering for everything under `(tabs)` because we touch
// cookies on every request. The landing page (/) lives outside this group
// so it stays statically renderable (see #68 ISR plan).
export const dynamic = "force-dynamic";

export default async function TabsLayout({ children }: { children: ReactNode }) {
  // Set the scribe cookie + upsert the matching DB row on first visit to any
  // tabbed surface, so future game votes (#26/#32), session rows, and quill
  // samples have a stable FK target.
  await ensureScribe();
  return (
    <>
      {children}
      <TabFooter />
    </>
  );
}
