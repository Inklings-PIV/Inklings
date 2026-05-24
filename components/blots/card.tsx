import Link from "next/link";
import { FingerprintBars, SourceHues } from "@/components/blots/widgets";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { type HSLOverride, hueFor } from "@/lib/colour/placeholder";
import type { ClassicalFeatures } from "@/lib/stylometry/classical";

export type BlotCardBlot = {
  bookId: string;
  title: string;
  authorName: string;
  authorSlug: string;
  classical: ClassicalFeatures | null;
  algorithmic: HSLOverride | null;
  llm: HSLOverride | null;
  crowd: HSLOverride | null;
  blended: HSLOverride | null;
};

/**
 * Shared book card. Title links to /blots/[id], author name links to
 * /authors/[slug]. Don't wrap the whole card in another Link — nested
 * anchors are invalid HTML and would swallow the author link.
 */
export function BlotCard({ blot }: { blot: BlotCardBlot }) {
  const blendedCss = hueFor(blot.bookId, "blended", blot.blended).css;
  return (
    <Card className="h-full bg-card/60 transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div
          role="img"
          aria-label={`Blended hue of ${blot.title}`}
          className="size-10 rounded-full border border-border shadow-inner"
          style={{ backgroundColor: blendedCss }}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-2">
        <div>
          <h3 className="font-serif text-base leading-tight">
            <Link
              href={`/blots/${blot.bookId}`}
              className="text-ink-deep outline-none hover:text-ink-bleed focus-visible:underline"
            >
              {blot.title}
            </Link>
          </h3>
          <p className="text-xs text-muted-foreground">
            <Link
              href={`/authors/${blot.authorSlug}`}
              className="hover:text-ink-deep hover:underline"
            >
              {blot.authorName}
            </Link>
          </p>
        </div>

        <SourceHues
          bookId={blot.bookId}
          algorithmic={blot.algorithmic}
          llm={blot.llm}
          crowd={blot.crowd}
          blended={blot.blended}
        />

        <FingerprintBars features={blot.classical} />
      </CardContent>
    </Card>
  );
}
