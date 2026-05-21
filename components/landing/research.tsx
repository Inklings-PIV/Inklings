"use client";

import { useState } from "react";
import { GITHUB_URL } from "@/components/site-nav";

/* ----------------------------- Abstract --------------------------- */

export function Abstract() {
  return (
    <section className="border-b border-border bg-ink-paper-aged/30">
      <div className="mx-auto max-w-[1400px] px-6 py-20 md:py-28">
        <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
          <div>
            <div className="text-[11px] tracking-widest text-ink-bleed uppercase">Abstract</div>
            <h2 className="mt-3 font-serif text-4xl leading-[1.05] tracking-tight text-ink-deep">
              Stylometric atlases for human readers.
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-4 text-xs text-muted-foreground">
              <Meta label="Lens" value="Style → colour" />
              <Meta label="Source" value="Public domain" />
              <Meta label="Signals" value="Algo · LLM · Crowd" />
              <Meta label="Status" value="In progress" />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card/70 p-8 font-serif text-[15px] leading-relaxed text-ink-deep">
            <p>
              Computational stylometry has long been able to tell two authors apart, but its outputs
              (n-gram tables, principal components, embedding distances) rarely reach the reader who
              would benefit from them most. <em>Inklings</em> proposes a perception-first
              translation of stylometric features into <strong>colour</strong>,{" "}
              <strong>shape</strong>, and direct <strong>interaction</strong>.
            </p>
            <p className="mt-4">
              Each author becomes a blot: hue encodes a perceptual style profile blended from
              algorithmic, language-model, and crowd signals; silhouette encodes a five-axis
              fingerprint; canvas position reflects projection-based similarity. Four interlocking
              surfaces (<em>The Inkwell</em>, <em>The Blots</em>, <em>The Blotting Game</em>, and{" "}
              <em>The Quill</em>) let readers and writers explore, annotate, and steer style as a
              sensory object.
            </p>
            <p className="mt-4">
              We contribute (1) a multi-source style-to-colour mapping that triangulates
              algorithmic, LLM, and human signals; (2) a crowd-fed evaluation loop that turns
              stylistic agreement into open data; (3) an editor that surfaces stylistic shift as
              colour drift, with diff-style suggestions toward a chosen hue.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <div className="text-[9px] tracking-widest text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 font-serif text-sm text-ink-deep">{value}</div>
    </div>
  );
}

/* ------------------------------ Method ---------------------------- */

const STAGES = [
  {
    id: "corpus",
    title: "Corpus",
    body: "Public-domain literary works ingested from Project Gutenberg, cleaned, and tokenised. Per-book and per-author groupings.",
    tag: "01 · data",
  },
  {
    id: "features",
    title: "Features",
    body: "Classical stylometry (lexical richness, sentence length, abstraction, formality, narrative pace) computed alongside neural sentence embeddings.",
    tag: "02 · signal",
  },
  {
    id: "projection",
    title: "Projection",
    body: "UMAP over normalised feature vectors yields the canvas. Two parallel layouts (Classical, Modern) plus a hue-only embedding.",
    tag: "03 · layout",
  },
  {
    id: "mapping",
    title: "Hue mapping",
    body: "Style → OKLCH hue via three pipelines: algorithmic mapping, LLM judgment, crowd consensus. A weighted blend yields the default ink.",
    tag: "04 · perception",
  },
  {
    id: "surfaces",
    title: "Surfaces",
    body: "The atlas is fed into four interactive surfaces: Inkwell (atlas), Blots (per-book), Blotting Game (crowd loop), Quill (editor).",
    tag: "05 · interface",
  },
];

export function MethodPipeline() {
  const [active, setActive] = useState<string>("corpus");
  const stage = (STAGES.find((s) => s.id === active) ?? STAGES[0]) as (typeof STAGES)[number];
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-[1400px] px-6 py-20 md:py-28">
        <div className="text-[11px] tracking-widest text-ink-bleed uppercase">Method</div>
        <h2 className="mt-3 max-w-3xl font-serif text-4xl leading-[1.05] tracking-tight text-ink-deep sm:text-5xl">
          From corpus to canvas, in five stages.
        </h2>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground">
          A pipeline that keeps the numeric guts and the perceptual surface honest about each other.
          Tap a stage to read its role.
        </p>

        <div className="mt-12 overflow-x-auto">
          <ol className="flex min-w-max items-stretch gap-3">
            {STAGES.map((s, i) => (
              <li key={s.id} className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => setActive(s.id)}
                  className={`relative min-w-[180px] rounded-xl border p-4 text-left transition-all ${
                    active === s.id
                      ? "border-ink-deep bg-ink-deep text-ink-paper shadow-lg"
                      : "border-border bg-card/70 text-ink-deep hover:-translate-y-0.5 hover:shadow-md"
                  }`}
                >
                  <div
                    className={`text-[10px] tracking-widest uppercase ${
                      active === s.id ? "text-ink-paper/70" : "text-muted-foreground"
                    }`}
                  >
                    {s.tag}
                  </div>
                  <div className="mt-2 font-serif text-lg">{s.title}</div>
                </button>
                {i < STAGES.length - 1 && (
                  <div className="grid w-8 place-items-center text-muted-foreground">
                    <Arrow />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-8 rounded-xl border border-border bg-card/70 p-6">
          <div className="text-[10px] tracking-widest text-ink-bleed uppercase">{stage.tag}</div>
          <div className="mt-2 font-serif text-2xl text-ink-deep">{stage.title}</div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {stage.body}
          </p>
        </div>
      </div>
    </section>
  );
}

function Arrow() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

/* ----------------------------- Corpus ----------------------------- */

const CORPUS = [
  { value: "1,248", label: "Authors" },
  { value: "6,914", label: "Works" },
  { value: "412 M", label: "Tokens" },
  { value: "5", label: "Style axes" },
  { value: "3", label: "Hue sources" },
];

export function CorpusStats() {
  return (
    <section className="border-b border-border bg-ink-paper-aged/30">
      <div className="mx-auto max-w-[1400px] px-6 py-20 md:py-28">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_2fr]">
          <div>
            <div className="text-[11px] tracking-widest text-ink-bleed uppercase">Corpus</div>
            <h2 className="mt-3 font-serif text-4xl leading-[1.05] tracking-tight text-ink-deep">
              An atlas drawn from public-domain prose.
            </h2>
            <p className="mt-4 max-w-md text-base text-muted-foreground">
              Built on Project Gutenberg and an open extension set. Targets v1 corpus by July 2026,
              growing toward multilingual coverage and reader-contributed annotations.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {CORPUS.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-border bg-card/80 p-5 transition-transform hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="font-serif text-3xl tracking-tight text-ink-deep">{s.value}</div>
                <div className="mt-1 text-[10px] tracking-widest text-muted-foreground uppercase">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------- References --------------------------- */

const REFERENCES = [
  {
    cite: "Burrows, J. (2002). 'Delta': a measure of stylistic difference and a guide to likely authorship.",
    journal: "Literary and Linguistic Computing 17(3), 267–287.",
  },
  {
    cite: "McInnes, L., Healy, J., Melville, J. (2018). UMAP: Uniform Manifold Approximation and Projection.",
    journal: "Journal of Open Source Software 3(29).",
  },
  {
    cite: "Reimers, N., Gurevych, I. (2019). Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks.",
    journal: "EMNLP 2019.",
  },
  {
    cite: "Lindbloom, B. (2003). Useful Color Equations: perceptual colour spaces and difference metrics.",
    journal: "brucelindbloom.com.",
  },
  {
    cite: "Albers, J. (1963). Interaction of Color.",
    journal: "Yale University Press.",
  },
];

export function References() {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-[1400px] px-6 py-20 md:py-28">
        <div className="grid gap-10 lg:grid-cols-[1fr_1fr]">
          <div>
            <div className="text-[11px] tracking-widest text-ink-bleed uppercase">References</div>
            <h2 className="mt-3 font-serif text-4xl leading-[1.05] tracking-tight text-ink-deep">
              Standing on prior ink.
            </h2>
            <ul className="mt-6 space-y-4 text-sm text-ink-deep">
              {REFERENCES.map((r) => (
                <li key={r.cite} className="border-l-2 border-ink-bleed/60 pl-4">
                  <div className="font-serif">{r.cite}</div>
                  <div className="text-xs text-muted-foreground italic">{r.journal}</div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-[11px] tracking-widest text-ink-bleed uppercase">Project</div>
            <h3 className="mt-3 font-serif text-2xl text-ink-deep">Links</h3>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center justify-between rounded-xl border border-border bg-card/70 px-4 py-3 text-sm transition-colors hover:bg-accent"
              >
                <span className="font-serif text-ink-deep">GitHub repository</span>
                <span className="font-mono text-[11px] text-muted-foreground">↗</span>
              </a>
              <a
                href="/piv-pitch.pdf"
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center justify-between rounded-xl border border-border bg-card/70 px-4 py-3 text-sm transition-colors hover:bg-accent"
              >
                <span className="font-serif text-ink-deep">Pitch deck (PDF)</span>
                <span className="font-mono text-[11px] text-muted-foreground">↗</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
