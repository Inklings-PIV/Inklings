import { BLOT_SHAPES } from "@/lib/canvas/blot-shapes";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  // 28px in the nav, scales up cleanly. Width auto-derives from height.
  height?: number;
};

// Single inline-SVG wordmark: organic blot mark on the left, "Inklings" set
// in Fraunces on the right. Both ride `currentColor`, so the same vector
// works on the light paper and the dark canvas without a second asset.
//
// Width is intentionally generous (260 units) — Satori/SVG layout is
// width-driven and "Inklings" in Fraunces needs the room.
export function BrandWordmark({ className, height = 28 }: Props) {
  const width = Math.round((height * 260) / 60);
  return (
    <svg
      role="img"
      aria-label="Inklings"
      viewBox="0 0 260 60"
      width={width}
      height={height}
      className={cn("overflow-visible", className)}
    >
      {/* Splatter dots around the blot. */}
      <g transform="translate(2 2) scale(0.45)">
        <circle cx="10" cy="22" r="2.2" fill="currentColor" opacity="0.55" />
        <circle cx="108" cy="30" r="1.8" fill="currentColor" opacity="0.5" />
        <circle cx="104" cy="96" r="2.6" fill="currentColor" opacity="0.55" />
        <circle cx="18" cy="100" r="2.4" fill="currentColor" opacity="0.5" />
        <path d={BLOT_SHAPES[0]} fill="currentColor" />
      </g>
      <text
        x="68"
        y="44"
        fill="currentColor"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: "40px",
          letterSpacing: "-0.02em",
        }}
      >
        Inklings
      </text>
    </svg>
  );
}
