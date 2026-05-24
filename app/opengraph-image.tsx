import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BLOT_SHAPES } from "@/lib/canvas/blot-shapes";

export const alt = "Inklings — what color is Shakespeare?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand-mark OG card. Renders once at build time (no per-request data
// here), so this becomes a static asset the first time it's hit.
export default async function Image() {
  // Bundled in /assets — see #42 commit. EB Garamond/Fraunces are the
  // brand faces; Satori needs them as TTF (woff2 isn't supported), so we
  // ship the raw files alongside the next/font Google loaders.
  const [fraunces, garamondItalic] = await Promise.all([
    readFile(join(process.cwd(), "assets/Fraunces-Bold.ttf")),
    readFile(join(process.cwd(), "assets/EBGaramond-Italic.ttf")),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "80px 96px",
        background: "#fbfaf6",
        color: "#1a1830",
        fontFamily: '"EB Garamond", serif',
        position: "relative",
      }}
    >
      {/* Soft dot grid in the background, matching globals.css. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(58, 64, 96, 0.18) 1px, transparent 0)",
          backgroundSize: "28px 28px",
          display: "flex",
        }}
      />

      {/* Decorative blot bleeding off the right edge. */}
      <svg
        viewBox="0 0 120 120"
        width="520"
        height="520"
        style={{
          position: "absolute",
          right: -90,
          top: 60,
          opacity: 0.22,
        }}
      >
        <path d={BLOT_SHAPES[0]} fill="#6a7fb8" />
      </svg>

      {/* Top row — brand mark. */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, zIndex: 1 }}>
        <svg viewBox="0 0 120 120" width="64" height="64">
          <path d={BLOT_SHAPES[0]} fill="#1a1830" />
        </svg>
        <span
          style={{
            fontFamily: '"Fraunces", serif',
            fontSize: 44,
            letterSpacing: "-0.02em",
          }}
        >
          Inklings
        </span>
      </div>

      {/* Headline. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, zIndex: 1 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: '"Fraunces", serif',
            fontSize: 128,
            lineHeight: 1.02,
            letterSpacing: "-0.03em",
            maxWidth: 920,
          }}
        >
          What colour is Shakespeare?
        </h1>
        <p
          style={{
            margin: 0,
            fontFamily: '"EB Garamond", serif',
            fontStyle: "italic",
            fontSize: 36,
            color: "#3a4060",
            maxWidth: 820,
          }}
        >
          A canvas of authors, in shape and in hue. Stylometry turned into colour, shape, and play.
        </p>
      </div>

      {/* Footer — attribution + URL. */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 22,
          color: "#3a4060",
          zIndex: 1,
        }}
      >
        <span>LMU München · PVI SoSe 2026</span>
        <span style={{ fontFamily: '"Fraunces", serif', letterSpacing: "-0.01em" }}>
          inklings.app
        </span>
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
