import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Inklings — what color is Shakespeare?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand-mark OG card. Renders once at build time (no per-request data
// here), so this becomes a static asset the first time it's hit.
export default async function Image() {
  // EB Garamond/Fraunces are the brand faces; Satori needs them as TTF
  // (woff2 isn't supported), so we ship the raw files alongside the
  // next/font Google loaders. The mascot is a PNG embedded via base64 —
  // Satori's <img> happily accepts a data: URL.
  const [fraunces, garamondItalic, mascotBuf] = await Promise.all([
    readFile(join(process.cwd(), "assets/Fraunces-Bold.ttf")),
    readFile(join(process.cwd(), "assets/EBGaramond-Italic.ttf")),
    readFile(join(process.cwd(), "public/inkling-mascot-no-background.png")),
  ]);
  const mascotSrc = `data:image/png;base64,${mascotBuf.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding: "72px 96px",
        background: "#fbfaf6",
        color: "#1a1830",
        fontFamily: '"EB Garamond", serif',
        position: "relative",
      }}
    >
      {/* Mascot, oversized, anchored top-right and bleeding off. */}
      {/** biome-ignore lint/performance/noImgElement: Satori only renders the raw HTML <img>, not next/image */}
      <img
        src={mascotSrc}
        alt=""
        style={{ position: "absolute", right: -40, top: -20, width: 560, height: 560 }}
      />

      {/* Content column on the left. */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "60%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/** biome-ignore lint/performance/noImgElement: Satori only renders the raw HTML <img> */}
          <img src={mascotSrc} alt="" style={{ width: 56, height: 56 }} />
          <span
            style={{
              fontFamily: '"Fraunces", serif',
              fontSize: 40,
              letterSpacing: "-0.02em",
            }}
          >
            Inklings
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: '"Fraunces", serif',
              fontSize: 108,
              lineHeight: 1.02,
              letterSpacing: "-0.03em",
            }}
          >
            What colour is Shakespeare?
          </h1>
          <p
            style={{
              margin: 0,
              fontFamily: '"EB Garamond", serif',
              fontStyle: "italic",
              fontSize: 32,
              color: "#3a4060",
            }}
          >
            A canvas of authors, in shape and in hue.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            color: "#3a4060",
          }}
        >
          <span>LMU München · PVI SoSe 2026</span>
          <span style={{ fontFamily: '"Fraunces", serif', letterSpacing: "-0.01em" }}>
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
