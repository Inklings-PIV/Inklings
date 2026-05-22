import { BLOT_SHAPES as SHAPES } from "@/lib/canvas/blot-shapes";
import { cn } from "@/lib/utils";

const SPLATTER_DOTS = [
  { cx: 10, cy: 22, r: 2.5, o: 0.55 },
  { cx: 108, cy: 30, r: 2, o: 0.5 },
  { cx: 104, cy: 96, r: 3, o: 0.55 },
  { cx: 18, cy: 100, r: 2.8, o: 0.5 },
  { cx: 60, cy: 4, r: 1.4, o: 0.45 },
  { cx: 96, cy: 12, r: 1.6, o: 0.4 },
];

export type BlotProps = {
  color: string;
  size?: number;
  shape?: number;
  splatter?: boolean;
  className?: string;
  rotate?: number;
  opacity?: number;
};

export function Blot({
  color,
  size = 64,
  shape = 0,
  splatter = true,
  className,
  rotate = 0,
  opacity = 1,
}: BlotProps) {
  const path = SHAPES[shape % SHAPES.length];
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      overflow="visible"
      className={cn("inline-block overflow-visible", className)}
      style={{ transform: `rotate(${rotate}deg)`, opacity }}
    >
      {splatter &&
        SPLATTER_DOTS.map((d) => (
          <circle key={`${d.cx}-${d.cy}`} cx={d.cx} cy={d.cy} r={d.r} fill={color} opacity={d.o} />
        ))}
      <path d={path} fill={color} />
    </svg>
  );
}
