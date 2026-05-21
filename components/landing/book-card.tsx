import { cn } from "@/lib/utils";

type Book = {
  title: string;
  author: string;
  color: string;
  histogram?: number[];
};

const BARS = [
  0.4, 0.6, 0.3, 0.7, 0.5, 0.8, 0.45, 0.65, 0.35, 0.55, 0.7, 0.4, 0.6, 0.5, 0.75, 0.3, 0.55, 0.45,
  0.7, 0.5, 0.6, 0.4, 0.55, 0.65, 0.45,
];

export function BookCard({ book, className }: { book: Book; className?: string }) {
  const bars = book.histogram ?? BARS;
  return (
    <div
      className={cn(
        "group rounded-xl border border-border bg-card/80 p-4 shadow-[0_1px_0_rgba(0,0,0,0.02),0_12px_30px_-22px_rgba(40,30,80,0.25)] transition-shadow hover:shadow-[0_1px_0_rgba(0,0,0,0.02),0_18px_40px_-22px_rgba(40,30,80,0.35)]",
        className,
      )}
    >
      <div
        className="size-6 rounded-full shadow-[0_2px_8px_-2px_rgba(0,0,0,0.15)]"
        style={{ backgroundColor: book.color }}
      />
      <div className="mt-6">
        <div className="font-serif text-sm text-ink-deep">{book.title}</div>
        <div className="text-[11px] text-muted-foreground">{book.author}</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[9px] tracking-wide uppercase">
        {(["algo", "llm", "crowd", "blend"] as const).map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-accent/60 px-1.5 py-0.5 text-accent-foreground"
          >
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: book.color, opacity: tag === "blend" ? 1 : 0.7 }}
            />
            {tag}
          </span>
        ))}
      </div>
      <div className="mt-3 flex h-7 items-end gap-0.5">
        {bars.map((h, i) => {
          const key = `${book.title}-${i.toString(36)}-${h.toFixed(3)}`;
          return (
            <div
              key={key}
              className="flex-1 rounded-sm bg-ink-deep/40"
              style={{ height: `${h * 100}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}
