import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlotCard, type BlotCardBlot } from "@/components/blots/card";
import { FingerprintBars } from "@/components/blots/widgets";
import { Separator } from "@/components/ui/separator";
import { averageBlendedHsl } from "@/lib/colour/average";
import { type HSLOverride, hueFromHSL } from "@/lib/colour/placeholder";
import { getDb, schema } from "@/lib/db";
import type { ClassicalFeatures } from "@/lib/stylometry/classical";

export const dynamic = "force-dynamic";

type AuthorPageData = {
  authorName: string;
  authorBirth: number | null;
  authorDeath: number | null;
  books: BlotCardBlot[];
};

async function fetchAuthor(slug: string): Promise<AuthorPageData | null> {
  const db = getDb();
  const [author] = await db
    .select({
      id: schema.authors.id,
      name: schema.authors.name,
      slug: schema.authors.slug,
      birthYear: schema.authors.birthYear,
      deathYear: schema.authors.deathYear,
    })
    .from(schema.authors)
    .where(eq(schema.authors.slug, slug))
    .limit(1);
  if (!author) return null;

  const algoColours = alias(schema.bookColours, "algo_colours");
  const llmColours = alias(schema.bookColours, "llm_colours");
  const crowdColours = alias(schema.bookColours, "crowd_colours");
  const blendedColours = alias(schema.bookColours, "blended_colours");

  const rows = await db
    .select({
      bookId: schema.books.id,
      title: schema.books.title,
      classical: schema.bookFeatures.classical,
      algoHue: algoColours.hue,
      algoSaturation: algoColours.saturation,
      algoLightness: algoColours.lightness,
      algoJustification: algoColours.justification,
      llmHue: llmColours.hue,
      llmSaturation: llmColours.saturation,
      llmLightness: llmColours.lightness,
      llmJustification: llmColours.justification,
      crowdHue: crowdColours.hue,
      crowdSaturation: crowdColours.saturation,
      crowdLightness: crowdColours.lightness,
      crowdJustification: crowdColours.justification,
      blendedHue: blendedColours.hue,
      blendedSaturation: blendedColours.saturation,
      blendedLightness: blendedColours.lightness,
      blendedJustification: blendedColours.justification,
    })
    .from(schema.books)
    .leftJoin(schema.bookFeatures, eq(schema.bookFeatures.bookId, schema.books.id))
    .leftJoin(
      algoColours,
      and(eq(algoColours.bookId, schema.books.id), eq(algoColours.source, "algorithmic")),
    )
    .leftJoin(llmColours, and(eq(llmColours.bookId, schema.books.id), eq(llmColours.source, "llm")))
    .leftJoin(
      crowdColours,
      and(eq(crowdColours.bookId, schema.books.id), eq(crowdColours.source, "crowd")),
    )
    .leftJoin(
      blendedColours,
      and(eq(blendedColours.bookId, schema.books.id), eq(blendedColours.source, "blended")),
    )
    .where(eq(schema.books.authorId, author.id));

  const books: BlotCardBlot[] = rows.map((r) => ({
    bookId: r.bookId,
    title: r.title,
    authorName: author.name,
    authorSlug: author.slug,
    classical: (r.classical as ClassicalFeatures | null) ?? null,
    algorithmic: hslFrom(r.algoHue, r.algoSaturation, r.algoLightness, r.algoJustification),
    llm: hslFrom(r.llmHue, r.llmSaturation, r.llmLightness, r.llmJustification),
    crowd: hslFrom(r.crowdHue, r.crowdSaturation, r.crowdLightness, r.crowdJustification),
    blended: hslFrom(r.blendedHue, r.blendedSaturation, r.blendedLightness, r.blendedJustification),
  }));

  return {
    authorName: author.name,
    authorBirth: author.birthYear,
    authorDeath: author.deathYear,
    books,
  };
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
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const author = await fetchAuthor(slug);
  if (!author) return { title: "Author · Inklings" };
  return {
    title: `${author.authorName} · Inklings`,
    description: `${author.books.length} ${
      author.books.length === 1 ? "blot" : "blots"
    } by ${author.authorName} in the Inklings corpus.`,
  };
}

export default async function AuthorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const author = await fetchAuthor(slug);
  if (!author) notFound();

  const lifespan =
    author.authorBirth || author.authorDeath
      ? `(${author.authorBirth ?? "?"}–${author.authorDeath ?? "?"})`
      : null;

  const signatureHsl = averageBlendedHsl(
    author.books.map((b) => ({
      hue: b.blended?.hue ?? null,
      saturation: b.blended?.saturation ?? null,
      lightness: b.blended?.lightness ?? null,
    })),
  );
  const signatureSwatchCss = signatureHsl
    ? hueFromHSL(signatureHsl.hue, signatureHsl.saturation, signatureHsl.lightness).css
    : "var(--muted)";
  const signatureFeatures = averageClassicalFeatures(author.books);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link
        href="/blots"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-ink-deep"
      >
        <ArrowLeft className="size-3" /> All blots
      </Link>

      <header className="mt-4 flex flex-wrap items-start gap-5">
        <div
          role="img"
          aria-label="Author signature hue"
          className="size-20 shrink-0 rounded-full border border-border shadow-inner"
          style={{ backgroundColor: signatureSwatchCss }}
        />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl tracking-tight text-ink-deep sm:text-4xl">
            {author.authorName}
          </h1>
          {lifespan && <p className="mt-1 text-sm text-muted-foreground">{lifespan}</p>}
          <p className="mt-3 text-sm text-muted-foreground">
            {author.books.length} {author.books.length === 1 ? "blot" : "blots"} in the corpus
            {signatureHsl ? " · the swatch averages every blot's blended hue." : "."}
          </p>
        </div>
      </header>

      {signatureFeatures && (
        <>
          <Separator className="my-6" />
          <Section title="Author signature">
            <FingerprintBars features={signatureFeatures} />
            <p className="mt-2 text-xs italic leading-snug text-muted-foreground">
              The 28-bar fingerprint averaged across every book in the corpus —{author.authorName}'s
              collective stylometric hand.
            </p>
          </Section>
        </>
      )}

      <Separator className="my-6" />

      {author.books.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">
          No books by this author in the corpus yet.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {author.books.map((book) => (
            <li key={book.bookId}>
              <BlotCard blot={book} />
            </li>
          ))}
        </ul>
      )}
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

/**
 * Circular weighted mean for hue (cos/sin) + arithmetic mean for sat/lightness
 * across every book's blended HSL. Returns null if no book has a blended row.
 * Same trick the blender and crowd aggregator use for hue wraparound.
 */
/**
 * Average the function-word frequency map across every book that has features.
 * Returns a ClassicalFeatures-shaped object so we can pass it straight to
 * FingerprintBars.
 */
function averageClassicalFeatures(
  books: ReadonlyArray<{ classical: ClassicalFeatures | null }>,
): ClassicalFeatures | null {
  const sources = books.flatMap((b) => (b.classical ? [b.classical] : []));
  if (sources.length === 0) return null;

  const wordSum: Record<string, number> = {};
  for (const f of sources) {
    for (const [word, freq] of Object.entries(f.functionWords)) {
      wordSum[word] = (wordSum[word] ?? 0) + freq;
    }
  }
  const functionWords: Record<string, number> = {};
  for (const [word, sum] of Object.entries(wordSum)) {
    functionWords[word] = sum / sources.length;
  }

  // FingerprintBars only reads .functionWords; the rest is a structural shell
  // so we don't have to invent a new type.
  return {
    wordCount: 0,
    sentenceCount: 0,
    sentenceLength: { mean: 0, std: 0, p50: 0, p90: 0 },
    typeTokenRatio: 0,
    mtld: 0,
    punctuation: {
      comma: 0,
      period: 0,
      semicolon: 0,
      colon: 0,
      questionMark: 0,
      exclamationMark: 0,
      emDash: 0,
      parenthesis: 0,
    },
    functionWords,
  };
}
