import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { ImageResponse } from "next/og";
import { BLOT_SHAPES, shapeForId } from "@/lib/canvas/blot-shapes";
import { getDb, schema } from "@/lib/db";

export const alt = "A blot — Inklings";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Lives outside the (tabs) route group on purpose. Next 16 doesn't register
// metadata files when they're nested inside a route group AND a dynamic
// segment — the route silently 404s. Sitting at app/blots/[id]/ bypasses
// that and still resolves to the canonical /blots/:id/opengraph-image URL.
//
// Per-book OG card. Renders the book's blended hue as the dominant element;
// falls back to the brand mark if the book isn't found so a stale share
// link doesn't surface a 500 in someone's chat preview.
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [fraunces, garamondItalic, mascotBuf] = await Promise.all([
    readFile(join(process.cwd(), "assets/Fraunces-Bold.ttf")),
    readFile(join(process.cwd(), "assets/EBGaramond-Italic.ttf")),
    readFile(join(process.cwd(), "public/inkling-mascot-no-background.png")),
  ]);
  const mascotSrc = `data:image/png;base64,${mascotBuf.toString("base64")}`;

  const db = getDb();
  const [row] = await db
    .select({
      bookId: schema.books.id,
      title: schema.books.title,
      authorName: schema.authors.name,
      hue: schema.bookColours.hue,
      saturation: schema.bookColours.saturation,
      lightness: schema.bookColours.lightness,
      justification: schema.bookColours.justification,
    })
    .from(schema.books)
    .innerJoin(schema.authors, eq(schema.books.authorId, schema.authors.id))
    .leftJoin(
      schema.bookColours,
      and(eq(schema.bookColours.bookId, schema.books.id), eq(schema.bookColours.source, "blended")),
    )
    .where(eq(schema.books.id, id))
    .limit(1);

  if (!row) return brandFallback({ fraunces, garamondItalic });

  // Satori (the renderer behind ImageResponse) doesn't parse oklch(), which
  // is what the in-app `hueFor` helper produces. Plain hsl() is supported,
  // so we build it directly from the stored HSL components (or derive a
  // muted stand-in if the book has no colour yet).
  const swatchCss = hslForOg(row.bookId, row.hue, row.saturation, row.lightness);
  const justification = row.justification?.trim();
  const blotPath = BLOT_SHAPES[shapeForId(row.bookId)];

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
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          backgroundImage: `linear-gradient(120deg, ${swatchCss} 0%, ${swatchCss} 45%, #fbfaf6 70%, #fbfaf6 100%)`,
          opacity: 0.32,
        }}
      />

      <svg
        viewBox="0 0 120 120"
        width="560"
        height="560"
        style={{ position: "absolute", left: -120, top: 40, opacity: 0.5 }}
      >
        <path d={blotPath} fill={swatchCss} />
      </svg>

      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 96px",
          width: "100%",
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

        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 820 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: '"Fraunces", serif',
              fontSize: row.title.length > 32 ? 80 : 112,
              lineHeight: 1.02,
              letterSpacing: "-0.03em",
            }}
          >
            {row.title}
          </h1>
          <p
            style={{
              margin: 0,
              fontFamily: '"EB Garamond", serif',
              fontStyle: "italic",
              fontSize: 38,
              color: "#3a4060",
            }}
          >
            {row.authorName}
          </p>
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
                maxWidth: 600,
              }}
            >
              {justification ?? "a blot in the corpus"}
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

function hslForOg(bookId: string, h: number | null, s: number | null, l: number | null): string {
  if (h != null && s != null && l != null) return `hsl(${h} ${s}% ${l}%)`;
  // Deterministic muted stand-in so an uncoloured book still feels like
  // "its" hue rather than grey.
  let acc = 0;
  for (let i = 0; i < bookId.length; i++) acc = (acc * 31 + bookId.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(acc) % 360} 30% 60%)`;
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
        this blot has bled into the margin
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
