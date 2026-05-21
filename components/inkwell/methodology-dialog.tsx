"use client";

import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const METHODOLOGY_PDF = "/methodology.pdf";

const LAYOUTS = [
  {
    name: "Classical",
    body: "Books placed by classical stylometric similarity. Features used: top-150 function-word frequencies, sentence-length statistics (mean, std, p50, p90), MTLD lexical diversity, and per-1000-words punctuation density. Vectors are z-scored across the corpus, then projected to 2D with UMAP (seeded so the layout is reproducible).",
  },
  {
    name: "Modern",
    body: "Books placed by semantic embedding similarity. Each book's text is chunked and averaged with OpenAI's text-embedding-3-small (1536 dimensions), then projected to 2D with the same UMAP pipeline. Modern mode foregrounds topic and content; Classical foregrounds style.",
  },
  {
    name: "By Hue",
    body: "Books with similar colours cluster together. The hue vectors (algorithmic + LLM + crowd, blended) are projected to 2D with UMAP — so two books with very different styles can sit next to each other if they feel the same colour.",
  },
];

const SOURCES = [
  {
    name: "Algorithmic",
    body: "Hue mapped deterministically from the classical feature vector — sentiment polarity drives hue, lexical richness drives saturation, sentence rhythm drives lightness. Cheap, fast, reproducible.",
  },
  {
    name: "LLM",
    body: "Claude reads excerpts plus the algorithmic prior and judges the book's hue with a written justification. Slower and costs tokens, but captures a perceptual layer the algorithm misses.",
  },
  {
    name: "Crowd",
    body: "The trimmed mean of hues that scribes assign in the Blotting Game. Outliers filtered, recent votes weighted. Reflects the colour readers actually feel on the page.",
  },
  {
    name: "Blended",
    body: "A weighted combination of algorithmic + LLM + crowd, recomputed nightly. The default hue shown when no source is selected explicitly.",
  },
];

export function MethodologyDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <Info className="size-3.5" />
          Methodology
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl text-ink-deep">Methodology</DialogTitle>
          <DialogDescription>
            How the Inkwell decides where every blot sits and what colour it is.
          </DialogDescription>
        </DialogHeader>

        <section className="mt-2">
          <h3 className="text-[11px] tracking-widest text-ink-bleed uppercase">How layouts work</h3>
          <dl className="mt-3 space-y-4">
            {LAYOUTS.map((l) => (
              <div key={l.name}>
                <dt className="font-serif text-base text-ink-deep">{l.name}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{l.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-6">
          <h3 className="text-[11px] tracking-widest text-ink-bleed uppercase">
            How hue sources work
          </h3>
          <dl className="mt-3 space-y-4">
            {SOURCES.map((s) => (
              <div key={s.name}>
                <dt className="font-serif text-base text-ink-deep">{s.name}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <DialogFooter className="mt-4 sm:justify-start">
          <a
            href={METHODOLOGY_PDF}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-deep underline-offset-4 hover:text-ink-bleed hover:underline"
          >
            Read the full methodology (PDF) →
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
