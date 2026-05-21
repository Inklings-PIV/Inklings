import { cn } from "@/lib/utils";

const SHAPES = [
  "M60,12 C75,8 92,20 88,34 C102,38 100,58 86,62 C95,78 78,92 62,86 C58,100 38,96 34,82 C18,86 8,68 20,58 C6,50 12,28 28,30 C30,18 46,12 60,12 Z",
  "M55,8 C74,10 86,24 80,38 C100,42 96,62 78,64 C92,82 70,92 60,80 C56,100 34,96 32,82 C12,80 8,58 22,52 C8,38 20,16 36,22 C42,8 50,8 55,8 Z",
  "M58,10 L70,18 L84,12 L80,30 L98,32 L84,46 L96,58 L80,62 L86,80 L68,78 L60,92 L50,80 L36,90 L34,72 L18,72 L26,58 L10,46 L26,42 L18,26 L36,28 L40,12 Z",
  "M62,14 C82,8 96,28 84,40 C98,52 92,72 76,68 C82,86 60,94 52,80 C40,96 22,84 28,68 C8,68 6,46 22,42 C12,24 32,12 46,20 C50,10 56,12 62,14 Z",
];

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
      className={cn("inline-block", className)}
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
