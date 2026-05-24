import Link from "next/link";
import type { Hand } from "@/app/(tabs)/authors/hands-view";
import { Card, CardContent } from "@/components/ui/card";
import { averageBlendedHsl } from "@/lib/colour/average";
import { hueFromHSL } from "@/lib/colour/placeholder";

export function HandCard({ hand }: { hand: Hand }) {
  const signature = averageBlendedHsl(
    hand.blendedHues.map((h) => ({
      hue: h.hue,
      saturation: h.saturation,
      lightness: h.lightness,
    })),
  );
  const swatchCss = signature
    ? hueFromHSL(signature.hue, signature.saturation, signature.lightness).css
    : "var(--muted)";
  const lifespan =
    hand.birthYear || hand.deathYear ? `${hand.birthYear ?? "?"}–${hand.deathYear ?? "?"}` : null;

  return (
    <Link href={`/authors/${hand.authorSlug}`} className="group block focus:outline-none">
      <Card className="h-full transition-colors group-hover:bg-accent/40 group-focus-visible:ring-2 group-focus-visible:ring-ring/60">
        <CardContent className="flex items-center gap-4 p-5">
          <div
            role="img"
            aria-label={`${hand.authorName} signature hue`}
            className="size-14 shrink-0 rounded-full border border-border shadow-inner"
            style={{ backgroundColor: swatchCss }}
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-lg tracking-tight text-ink-deep">
              {hand.authorName}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {lifespan ? `${lifespan} · ` : ""}
              {hand.blotCount} {hand.blotCount === 1 ? "blot" : "blots"}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
