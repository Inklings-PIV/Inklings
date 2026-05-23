import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FingerprintBars, SourceHues } from "@/components/blots/widgets";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { type HSLOverride, hueFor } from "@/lib/colour/placeholder";
import { getDb, schema } from "@/lib/db";
import type { ClassicalFeatures } from "@/lib/stylometry/classical";

export const dynamic = "force-dynamic";

type BlotPageData = {
  bookId: string;
  title: string;
  gutenbergId: number | null;
  lang: string;
  wordCount: number | null;
  ingestedAt: Date | null;
  authorName: string;
  authorBirth: number | null;
  authorDeath: number | null;
  classical: ClassicalFeatures | null;
  algorithmic: HSLOverride | null;
  llm: HSLOverride | null;
  blended: HSLOverride | null;
};

async function fetchBlot(id: string): Promise<BlotPageData | null> {
  try {
    const db = getDb();
    const algoColours = alias(schema.bookColours, "algo_colours");
    const llmColours = alias(schema.bookColours, "llm_colours");
    const blendedColours = alias(schema.bookColours, "blended_colours");
    const [row] = await db
      .select({
        bookId: schema.books.id,
        title: schema.books.title,
        gutenbergId: schema.books.gutenbergId,
        lang: schema.books.lang,
        wordCount: schema.books.wordCount,
        ingestedAt: schema.books.ingestedAt,
        authorName: schema.authors.name,
        authorBirth: schema.authors.birthYear,
        authorDeath: schema.authors.deathYear,
        classical: schema.bookFeatures.classical,
        algoHue: algoColours.hue,
        algoSaturation: algoColours.saturation,
        algoLightness: algoColours.lightness,
        algoJustification: algoColours.justification,
        llmHue: llmColours.hue,
        llmSaturation: llmColours.saturation,
        llmLightness: llmColours.lightness,
        llmJustification: llmColours.justification,
        blendedHue: blendedColours.hue,
        blendedSaturation: blendedColours.saturation,
        blendedLightness: blendedColours.lightness,
        blendedJustification: blendedColours.justification,
      })
      .from(schema.books)
      .innerJoin(schema.authors, eq(schema.books.authorId, schema.authors.id))
      .leftJoin(schema.bookFeatures, eq(schema.bookFeatures.bookId, schema.books.id))
      .leftJoin(
        algoColours,
        and(eq(algoColours.bookId, schema.books.id), eq(algoColours.source, "algorithmic")),
      )
      .leftJoin(
        llmColours,
        and(eq(llmColours.bookId, schema.books.id), eq(llmColours.source, "llm")),
      )
      .leftJoin(
        blendedColours,
        and(eq(blendedColours.bookId, schema.books.id), eq(blendedColours.source, "blended")),
      )
      .where(eq(schema.books.id, id))
      .limit(1);

    if (!row) return null;

    return {
      bookId: row.bookId,
      title: row.title,
      gutenbergId: row.gutenbergId,
      lang: row.lang,
      wordCount: row.wordCount,
      ingestedAt: row.ingestedAt,
      authorName: row.authorName,
      authorBirth: row.authorBirth,
      authorDeath: row.authorDeath,
      classical: (row.classical as ClassicalFeatures | null) ?? null,
      algorithmic: hslFrom(
        row.algoHue,
        row.algoSaturation,
        row.algoLightness,
        row.algoJustification,
      ),
      llm: hslFrom(row.llmHue, row.llmSaturation, row.llmLightness, row.llmJustification),
      blended: hslFrom(
        row.blendedHue,
        row.blendedSaturation,
        row.blendedLightness,
        row.blendedJustification,
      ),
    };
  } catch {
    return null;
  }
}

function hslFrom(
  h: number | null,
  s: number | null,
  l: number | null,
  j: string | null,
): HSLOverride | null {
  return h != null && s != null && l != null
    ? { hue: h, saturation: s, lightness: l, justification: j }
    : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const blot = await fetchBlot(id);
  if (!blot) return { title: "Blot · Inklings" };
  return {
    title: `${blot.title} — ${blot.authorName} · Inklings`,
    description: blot.algorithmic?.justification ?? undefined,
  };
}

export default async function BlotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const blot = await fetchBlot(id);
  if (!blot) notFound();

  const blendedCss = hueFor(blot.bookId, "blended", blot.blended).css;
  const lifespan =
    blot.authorBirth || blot.authorDeath
      ? `(${blot.authorBirth ?? "?"}–${blot.authorDeath ?? "?"})`
      : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link
        href="/blots"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-ink-deep"
      >
        <ArrowLeft className="size-3" /> All blots
      </Link>

      <header className="mt-4 flex flex-wrap items-start gap-4">
        <div
          role="img"
          aria-label="Blended hue"
          className="size-16 shrink-0 rounded-full border border-border shadow-inner"
          style={{ backgroundColor: blendedCss }}
        />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-2xl tracking-tight text-ink-deep sm:text-3xl">
            {blot.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {blot.authorName}
            {lifespan ? ` ${lifespan}` : ""}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {[
              blot.gutenbergId ? `Project Gutenberg #${blot.gutenbergId}` : null,
              blot.lang ? blot.lang.toUpperCase() : null,
              blot.wordCount ? `${blot.wordCount.toLocaleString()} words` : null,
              blot.ingestedAt ? `ingested ${formatDate(blot.ingestedAt)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </header>

      <Separator className="my-6" />

      <Section title="Hues">
        <SourceHues
          bookId={blot.bookId}
          algorithmic={blot.algorithmic}
          llm={blot.llm}
          blended={blot.blended}
        />
        <ul className="mt-3 space-y-1 text-xs leading-snug text-muted-foreground">
          <Reasoning label="Algo" text={blot.algorithmic?.justification} />
          <Reasoning label="LLM" text={blot.llm?.justification} />
          <Reasoning label="Crowd" text={null} />
          <Reasoning label="Blend" text={blot.blended?.justification} />
        </ul>
      </Section>

      <Separator className="my-6" />

      <Section title="Fingerprint">
        <FingerprintBars features={blot.classical} />
        <p className="mt-2 text-xs italic text-muted-foreground">
          Bar heights are the relative frequency of the 28 most common English function words — a
          small, stable per-book signature.
        </p>
      </Section>

      <Separator className="my-6" />

      <Section title="Stylometry">
        <StylometryTable features={blot.classical} />
      </Section>

      <Separator className="my-6" />

      <Section title="Crowd colour votes">
        <p className="text-xs italic text-muted-foreground">
          Not yet collected — coming with the Blotting Game (#32).
        </p>
      </Section>

      <Separator className="my-6" />

      <Link href={`/inkwell?selected=${blot.bookId}`}>
        <Button variant="outline" size="sm">
          View on the Inkwell <ArrowRight />
        </Button>
      </Link>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[10px] tracking-widest text-muted-foreground uppercase">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Reasoning({ label, text }: { label: string; text: string | null | undefined }) {
  return (
    <li>
      <span className="font-semibold text-ink-deep">{label}:</span>{" "}
      {text ? text : <span className="italic">not derived yet — placeholder colour</span>}
    </li>
  );
}

function StylometryTable({ features }: { features: ClassicalFeatures | null }) {
  if (!features) {
    return (
      <p className="text-xs italic text-muted-foreground">
        No features extracted yet for this book.
      </p>
    );
  }
  const sl = features.sentenceLength;
  const p = features.punctuation;
  const rows: Array<[string, string]> = [
    ["Words", features.wordCount.toLocaleString()],
    ["Sentences", features.sentenceCount.toLocaleString()],
    [
      "Mean sentence length",
      `${sl.mean.toFixed(1)} words (std ${sl.std.toFixed(1)}, p50 ${sl.p50}, p90 ${sl.p90})`,
    ],
    ["MTLD (vocab richness)", features.mtld.toFixed(1)],
    ["Type-token ratio", features.typeTokenRatio.toFixed(3)],
    ["Commas / 1k", p.comma.toFixed(1)],
    ["Periods / 1k", p.period.toFixed(1)],
    ["Semicolons / 1k", p.semicolon.toFixed(1)],
    ["Colons / 1k", p.colon.toFixed(1)],
    ["Question marks / 1k", p.questionMark.toFixed(1)],
    ["Exclamation marks / 1k", p.exclamationMark.toFixed(1)],
    ["Em-dashes / 1k", p.emDash.toFixed(1)],
    ["Parentheses / 1k", p.parenthesis.toFixed(1)],
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
      {rows.map(([term, value]) => (
        <div
          key={term}
          className="flex items-baseline justify-between gap-2 border-b border-dashed border-border/60 py-1"
        >
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="tabular-nums text-ink-deep">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
