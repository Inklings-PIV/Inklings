import Link from "next/link";
import { Blot } from "@/components/landing/blot";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-12 -left-16 opacity-30 inklings-drift"
      >
        <Blot color="oklch(0.7 0.16 30)" size={220} shape={1} />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -bottom-20 opacity-25 inklings-drift"
        style={{ animationDelay: "3s" }}
      >
        <Blot color="oklch(0.55 0.2 290)" size={300} shape={2} />
      </div>

      <h1 className="font-serif text-7xl tracking-tight text-ink-deep sm:text-8xl">404</h1>
      <p className="mt-4 font-serif text-xl italic text-ink-bleed">That blot's not on the page.</p>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        The page you were looking for doesn't exist, or it bled through to somewhere else.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/">Back to the landing</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/inkwell">Open the Inkwell</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/blots">Browse the Blots</Link>
        </Button>
      </div>
    </div>
  );
}
