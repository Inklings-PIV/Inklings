import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { BLOT_SHAPES, shapeForId } from "@/lib/canvas/blot-shapes";
import { averageBlendedHsl } from "@/lib/colour/average";
import { getDb, schema } from "@/lib/db";

export const alt = "An author — Inklings";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Per-author OG card. Signature hue = circular mean of every blended hue
// across the author's books. Mirrors the swatch on /authors/[slug].
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [fraunces, garamondItalic, mascotBuf] = await Promise.all([
    readFile(join(process.cwd(), "assets/Fraunces-Bold.ttf")),
    readFile(join(process.cwd(), "assets/EBGaramond-Italic.ttf")),
    readFile(join(process.cwd(), "public/inkling-mascot-no-background.png")),
  ]);
  const mascotSrc = `data:image/png;base64,${mascotBuf.toString("base64")}`;

  const db = getDb();
  const [author] = await db
    .select({
      id: schema.authors.id,
      name: schema.authors.name,
      birthYear: schema.authors.birthYear,
      deathYear: schema.authors.deathYear,
    })
    .from(schema.authors)
    .where(eq(schema.authors.slug, slug))
    .limit(1);

  if (!author) return brandFallback({ fraunces, garamondItalic });

  const blendedRows = await db
    .select({
      bookId: schema.books.id,
      title: schema.books.title,
      hue: schema.bookColours.hue,
      saturation: schema.bookColours.saturation,
      lightness: schema.bookColours.lightness,
    })
    .from(schema.books)
    .leftJoin(
      schema.bookColours,
      and(eq(schema.bookColours.bookId, schema.books.id), eq(schema.bookColours.source, "blended")),
    )
    .where(eq(schema.books.authorId, author.id));

  // Plain hsl() rather than the in-app helper because Satori (the renderer
  // behind ImageResponse) doesn't parse oklch().
  const signatureHsl = averageBlendedHsl(blendedRows);
  const swatchCss = signatureHsl
    ? `hsl(${signatureHsl.hue} ${signatureHsl.saturation}% ${signatureHsl.lightness}%)`
    : "#cccccc";
  const bookCount = blendedRows.length;
  const lifespan =
    author.birthYear || author.deathYear
      ? `${author.birthYear ?? "?"}–${author.deathYear ?? "?"}`
      : null;

  // Up to 5 of the author's blots, peeking in from the right edge — their
  // collected "signature" rendered as overlapping silhouettes. Stack
  // closer to fully visible (right: small) for the first one and trail
  // off-canvas behind it.
  const decorations = blendedRows.slice(0, 5).map((r, i) => ({
    path: BLOT_SHAPES[shapeForId(r.bookId)],
    rotation: -10 + i * 7,
    right: -80 - i * 40,
    top: 80 + (i % 2) * 120,
    opacity: 0.28 - i * 0.04,
  }));

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#fbfaf6",
        color: "#1a1830",
        position: "relative",
      }}
    >
      {/* Soft hue wash from the right. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          backgroundImage: `linear-gradient(280deg, ${swatchCss} 0%, ${swatchCss} 30%, #fbfaf6 65%)`,
          opacity: 0.28,
        }}
      />

      {/* Decorative blot constellation on the right. */}
      {decorations.map((d) => (
        <svg
          key={`${d.right}-${d.top}`}
          viewBox="0 0 120 120"
          width="320"
          height="320"
          style={{
            position: "absolute",
            right: d.right,
            top: d.top,
            opacity: d.opacity,
            transform: `rotate(${d.rotation}deg)`,
          }}
        >
          <path d={d.path} fill={swatchCss} />
        </svg>
      ))}

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 96px",
          width: "100%",
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/** biome-ignore lint/performance/noImgElement: Satori only renders the raw HTML <img> */}
          <img src={mascotSrc} alt="" style={{ width: 44, height: 44 }} />
          <span
            style={{
              fontFamily: '"Fraunces", serif',
              fontSize: 26,
              letterSpacing: "-0.02em",
            }}
          >
            Inklings
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 760 }}>
          <span
            style={{
              fontFamily: '"EB Garamond", serif',
              fontStyle: "italic",
              fontSize: 26,
              color: "#3a4060",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            A signature in the corpus
          </span>
          <h1
            style={{
              margin: 0,
              fontFamily: '"Fraunces", serif',
              fontSize: author.name.length > 24 ? 88 : 120,
              lineHeight: 1.02,
              letterSpacing: "-0.03em",
            }}
          >
            {author.name}
          </h1>
          {lifespan && (
            <p
              style={{
                margin: 0,
                fontFamily: '"EB Garamond", serif',
                fontStyle: "italic",
                fontSize: 32,
                color: "#3a4060",
              }}
            >
              {lifespan}
            </p>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 9999,
                background: swatchCss,
                border: "2px solid rgba(26,24,48,0.18)",
                display: "flex",
              }}
            />
            <span
              style={{
                fontFamily: '"EB Garamond", serif',
                fontStyle: "italic",
                fontSize: 24,
                color: "#3a4060",
              }}
            >
              {bookCount} {bookCount === 1 ? "blot" : "blots"} · signature hue
            </span>
          </div>
          <span
            style={{
              fontFamily: '"Fraunces", serif',
              fontSize: 22,
              color: "#3a4060",
              letterSpacing: "-0.01em",
            }}
          >
            inklings.app
          </span>
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Fraunces", data: fraunces, style: "normal", weight: 700 },
        { name: "EB Garamond", data: garamondItalic, style: "italic", weight: 400 },
      ],
    },
  );
}

async function brandFallback({
  fraunces,
  garamondItalic,
}: {
  fraunces: Buffer;
  garamondItalic: Buffer;
}) {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        background: "#fbfaf6",
        color: "#1a1830",
        fontFamily: '"Fraunces", serif',
      }}
    >
      <h1 style={{ margin: 0, fontSize: 96, letterSpacing: "-0.03em" }}>Inklings</h1>
      <p
        style={{
          margin: "16px 0 0",
          fontFamily: '"EB Garamond", serif',
          fontStyle: "italic",
          fontSize: 32,
          color: "#3a4060",
        }}
      >
        this scribe has slipped the canvas
      </p>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Fraunces", data: fraunces, style: "normal", weight: 700 },
        { name: "EB Garamond", data: garamondItalic, style: "italic", weight: 400 },
      ],
    },
  );
}
