import { cn } from "@/lib/utils";

const DIMENSIONS = [
  { label: "Lexical richness", value: 0.72 },
  { label: "Sentence length", value: 0.45 },
  { label: "Abstraction", value: 0.81 },
  { label: "Formality", value: 0.63 },
  { label: "Narrative pace", value: 0.38 },
] as const;

export function ProfileBars({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {DIMENSIONS.map((d, i) => (
        <div key={d.label} className="flex items-center gap-3 text-xs">
          <div className="w-28 text-muted-foreground">{d.label}</div>
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-accent">
            <div
              className="inklings-bar absolute inset-y-0 left-0 rounded-full bg-ink-deep"
              style={
                {
                  "--bar-w": `${Math.round(d.value * 100)}%`,
                  animationDelay: `${i * 90}ms`,
                } as React.CSSProperties
              }
            />
          </div>
          <div className="w-8 text-right tabular-nums text-ink-deep">{d.value.toFixed(2)}</div>
        </div>
      ))}
    </div>
  );
}
