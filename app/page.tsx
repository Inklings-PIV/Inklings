import Link from "next/link";
import { Blot } from "@/components/landing/blot";
import { BookCard } from "@/components/landing/book-card";
import { GameMock } from "@/components/landing/game-mock";
import { InkwellMock } from "@/components/landing/inkwell-mock";
import { Mascot3D } from "@/components/landing/mascot-3d";
import { ProfileBars } from "@/components/landing/profile-bars";
import { QuillMock } from "@/components/landing/quill-mock";
import { Abstract, CorpusStats, MethodPipeline, References } from "@/components/landing/research";
import { SiteFooter } from "@/components/site-footer";
import { ArrowIcon } from "@/components/site-nav";

const BOOKS = [
  { title: "Mrs Dalloway", author: "Virginia Woolf", color: "oklch(0.72 0.12 200)" },
  { title: "The Sun Also Rises", author: "Ernest Hemingway", color: "oklch(0.66 0.17 240)" },
  { title: "1984", author: "George Orwell", color: "oklch(0.7 0.14 250)" },
  { title: "Ficciones", author: "Jorge Luis Borges", color: "oklch(0.72 0.16 55)" },
  { title: "Beloved", author: "Toni Morrison", color: "oklch(0.68 0.16 10)" },
  { title: "Invisible Cities", author: "Italo Calvino", color: "oklch(0.7 0.14 160)" },
  { title: "The Trial", author: "Franz Kafka", color: "oklch(0.66 0.16 280)" },
  {
    title: "The Passion According to G.H.",
    author: "Clarice Lispector",
    color: "oklch(0.72 0.15 340)",
  },
];

export default function LandingPage() {
  return (
    <div className="relative overflow-x-hidden">
      <Hero />
      <Abstract />
      <Problem />
      <CoreIdea />
      <MethodPipeline />
      <SurfaceInkwell />
      <SurfaceBlots />
      <SurfaceGame />
      <SurfaceQuill />
      <StylometricFingerprint />
      <CorpusStats />
      <References />
      <SiteFooter />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */
function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      {/* decorative blots */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-12 -left-24 opacity-50 inklings-drift">
          <Blot color="oklch(0.7 0.15 60)" size={260} shape={1} />
        </div>
        <div
          className="absolute top-32 right-1/3 opacity-30 inklings-drift"
          style={{ animationDelay: "2s" }}
        >
          <Blot color="oklch(0.65 0.16 200)" size={140} shape={2} />
        </div>
        <div
          className="absolute -bottom-20 -right-16 opacity-40 inklings-drift"
          style={{ animationDelay: "4s" }}
        >
          <Blot color="oklch(0.55 0.2 290)" size={320} shape={3} />
        </div>
      </div>

      <div className="mx-auto grid max-w-[1400px] items-center gap-10 px-6 py-20 md:py-28 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <h1 className="font-serif text-[14vw] leading-[1.05] tracking-tight text-ink-deep sm:text-[110px] md:text-[140px]">
            <span className="inline-block bg-gradient-to-br from-ink-deep via-ink-bleed to-purple-600 bg-clip-text pb-[0.2em] text-transparent">
              Inklings
            </span>
          </h1>
          <p className="mt-6 max-w-xl font-serif text-2xl leading-snug text-ink-deep sm:text-3xl">
            What color is <span className="italic">Shakespeare?</span>
          </p>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            We translate writing style into <strong className="text-ink-deep">color</strong>,{" "}
            <strong className="text-ink-deep">shape</strong> &amp;{" "}
            <strong className="text-ink-deep">interaction</strong>. A stylometric atlas you can see,
            play, and write into.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/inkwell"
              className="group inline-flex items-center gap-2 rounded-md bg-ink-deep px-5 py-3 text-sm font-medium text-ink-paper transition-transform hover:-translate-y-px hover:bg-ink-bleed"
            >
              Enter the Inkwell
              <ArrowIcon />
            </Link>
            <Link
              href="/game"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card/70 px-5 py-3 text-sm font-medium text-ink-deep backdrop-blur transition-colors hover:bg-accent"
            >
              Play the Blotting Game
            </Link>
            <Link
              href="/quill"
              className="inline-flex items-center gap-2 rounded-md px-5 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Open the Quill →
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <Blot color="oklch(0.72 0.16 30)" size={18} shape={0} splatter={false} />
              authors as blots
            </span>
            <span className="flex items-center gap-2">
              <Blot color="oklch(0.7 0.14 150)" size={18} shape={1} splatter={false} />
              stylometric profiles
            </span>
            <span className="flex items-center gap-2">
              <Blot color="oklch(0.65 0.18 260)" size={18} shape={2} splatter={false} />
              crowd-fed consensus
            </span>
          </div>
        </div>

        {/* mascot */}
        <div className="relative mx-auto grid w-full max-w-[420px] place-items-center">
          {/* halo */}
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 rounded-full opacity-40 blur-3xl inklings-pulse"
            style={{
              background:
                "conic-gradient(from 0deg, oklch(0.75 0.18 30), oklch(0.72 0.18 90), oklch(0.7 0.18 150), oklch(0.68 0.18 220), oklch(0.7 0.18 290), oklch(0.75 0.18 30))",
            }}
          />
          {/* satellite blots */}
          <div
            className="pointer-events-none absolute -top-2 -left-2 inklings-float"
            style={{ animationDelay: "0.4s" }}
          >
            <Blot color="oklch(0.7 0.18 30)" size={50} shape={0} />
          </div>
          <div
            className="pointer-events-none absolute top-12 -right-4 inklings-float"
            style={{ animationDelay: "1.4s" }}
          >
            <Blot color="oklch(0.7 0.16 140)" size={42} shape={2} />
          </div>
          <div
            className="pointer-events-none absolute -bottom-2 left-6 inklings-float"
            style={{ animationDelay: "2.2s" }}
          >
            <Blot color="oklch(0.66 0.18 250)" size={62} shape={3} />
          </div>
          <div
            className="pointer-events-none absolute bottom-10 -right-6 inklings-float"
            style={{ animationDelay: "3.0s" }}
          >
            <Blot color="oklch(0.7 0.18 320)" size={36} shape={1} />
          </div>
          <Mascot3D
            src="/inkling-mascot-no-background.png"
            alt="Inklings mascot, a friendly purple ink droplet"
            size={420}
            eager
            className="relative"
          />
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Problem                                                             */
/* ------------------------------------------------------------------ */
function Problem() {
  const items = [
    {
      title: "Writing style is hard to describe",
      body: "We say a sentence is dense, dreamy, clipped, or baroque, but the words slip the moment we try to compare.",
    },
    {
      title: "Stylometry tools are numeric & inaccessible",
      body: "Tables of n-gram frequencies and PCA dimensions hide what readers actually feel on the page.",
    },
    {
      title: "Readers & writers struggle to see style",
      body: "Without a shared sensory language, stylistic similarity stays an inkling, never a picture.",
    },
  ];
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-[1400px] px-6 py-20 md:py-28">
        <SectionHeading eyebrow="The problem">A canvas for something invisible.</SectionHeading>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {items.map((it, i) => (
            <div
              key={it.title}
              className="relative rounded-xl border border-border bg-card/70 p-6 shadow-[0_1px_0_rgba(0,0,0,0.02),0_18px_40px_-30px_rgba(40,30,80,0.25)]"
            >
              <div className="absolute -top-3 -left-3 grid size-9 place-items-center rounded-full border border-border bg-background font-serif text-sm text-ink-deep">
                {String(i + 1).padStart(2, "0")}
              </div>
              <Sparkle className="size-5 text-ink-bleed" />
              <h3 className="mt-3 font-serif text-xl text-ink-deep">{it.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 2 L13.8 9.2 L21 11 L13.8 12.8 L12 20 L10.2 12.8 L3 11 L10.2 9.2 Z" />
      <path d="M19 3 L19.8 5.2 L22 6 L19.8 6.8 L19 9 L18.2 6.8 L16 6 L18.2 5.2 Z" opacity="0.6" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Core idea                                                           */
/* ------------------------------------------------------------------ */
function CoreIdea() {
  return (
    <section className="relative border-b border-border bg-ink-paper-aged/30">
      <div className="mx-auto max-w-[1400px] px-6 py-20 md:py-28">
        <SectionHeading eyebrow="The core idea">
          We translate writing style into <span className="text-ink-bleed">color</span>,{" "}
          <span className="text-ink-bleed">shape</span> &amp;{" "}
          <span className="text-ink-bleed">interaction</span>.
        </SectionHeading>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground">
          Each author becomes a blot. Its hue tells you what their prose feels like, its silhouette
          encodes a numeric fingerprint, and its place on the canvas surfaces neighbours you didn't
          know you had.
        </p>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          <IdeaCard
            label="Color"
            title="A hue is a feeling."
            body="From numeric stylometrics to a single perceptual color: warm and grounded, sharp and cold, dreamy and slow."
          >
            <div className="relative h-32 overflow-hidden rounded-lg border border-border">
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(90deg, oklch(0.72 0.18 30), oklch(0.72 0.18 90), oklch(0.7 0.18 150), oklch(0.68 0.18 220), oklch(0.7 0.18 290))",
                }}
              />
              <div className="absolute inset-x-3 bottom-2 flex justify-between text-[10px] tracking-wide text-white/90 uppercase">
                <span>warm</span>
                <span>fresh</span>
                <span>cold</span>
                <span>dreamy</span>
              </div>
            </div>
          </IdeaCard>

          <IdeaCard
            label="Shape"
            title="A silhouette is a signature."
            body="Lexical richness, sentence length, abstraction: the points of the blot bend to match a profile no two authors share."
          >
            <div className="grid h-32 grid-cols-4 place-items-center rounded-lg border border-border bg-background/50">
              <Blot color="oklch(0.5 0.16 30)" size={64} shape={0} />
              <Blot color="oklch(0.5 0.16 150)" size={64} shape={1} />
              <Blot color="oklch(0.5 0.16 240)" size={64} shape={2} />
              <Blot color="oklch(0.5 0.16 310)" size={64} shape={3} />
            </div>
          </IdeaCard>

          <IdeaCard
            label="Interaction"
            title="A page is a conversation."
            body="Pan the inkwell. Guess a hue. Write a line and watch its color shift. Style stops being a thing you talk about."
          >
            <div className="relative grid h-32 place-items-center overflow-hidden rounded-lg border border-border bg-background/50">
              <div
                className="absolute inset-0 inklings-spin-slow"
                style={{
                  background:
                    "conic-gradient(from 0deg, oklch(0.78 0.18 30), oklch(0.78 0.18 90), oklch(0.78 0.18 150), oklch(0.78 0.18 220), oklch(0.78 0.18 290), oklch(0.78 0.18 30))",
                  maskImage:
                    "radial-gradient(circle, transparent 35%, black 36%, black 70%, transparent 71%)",
                  WebkitMaskImage:
                    "radial-gradient(circle, transparent 35%, black 36%, black 70%, transparent 71%)",
                }}
              />
              <div className="relative grid size-10 place-items-center rounded-full bg-ink-deep text-ink-paper">
                <Cursor />
              </div>
            </div>
          </IdeaCard>
        </div>
      </div>
    </section>
  );
}

function IdeaCard({
  label,
  title,
  body,
  children,
}: {
  label: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/80 p-6 shadow-[0_1px_0_rgba(0,0,0,0.02),0_18px_40px_-30px_rgba(40,30,80,0.25)]">
      <div className="text-[10px] tracking-widest text-ink-bleed uppercase">{label}</div>
      <h3 className="mt-2 font-serif text-2xl text-ink-deep">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Cursor() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5 3 L19 12 L12 13 L9 20 Z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */
function SectionHeading({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] tracking-widest text-ink-bleed uppercase">{eyebrow}</div>
      <h2 className="mt-3 max-w-3xl font-serif text-4xl leading-[1.05] tracking-tight text-ink-deep sm:text-5xl md:text-6xl">
        {children}
      </h2>
    </div>
  );
}

function SurfaceWrap({
  index,
  name,
  tagline,
  description,
  href,
  ctaLabel,
  capabilities,
  visual,
  flip = false,
  swatch,
}: {
  index: string;
  name: string;
  tagline: string;
  description: string;
  href: string;
  ctaLabel: string;
  capabilities: string[];
  visual: React.ReactNode;
  flip?: boolean;
  swatch: string;
}) {
  return (
    <section className="border-b border-border">
      <div className="mx-auto max-w-[1400px] px-6 py-20 md:py-28">
        <div
          className={`grid gap-12 lg:grid-cols-2 ${flip ? "lg:[&>div:first-child]:order-2" : ""}`}
        >
          <div>
            <div className="flex items-baseline gap-3">
              <span className="font-serif text-sm text-ink-bleed">{index}</span>
              <span className="text-[11px] tracking-widest text-muted-foreground uppercase">
                feature
              </span>
            </div>
            <h2 className="mt-3 flex items-baseline gap-4 font-serif text-5xl leading-tight tracking-tight text-ink-deep sm:text-6xl">
              <span
                aria-hidden="true"
                className="size-3 rounded-full"
                style={{ backgroundColor: swatch }}
              />
              {name}
            </h2>
            <p className="mt-3 font-serif text-xl text-ink-bleed italic">{tagline}</p>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
              {description}
            </p>
            <ul className="mt-6 space-y-2 text-sm text-ink-deep">
              {capabilities.map((c) => (
                <li key={c} className="flex items-start gap-3">
                  <span
                    className="mt-1.5 inline-block size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: swatch }}
                  />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
            <Link
              href={href}
              className="mt-8 inline-flex items-center gap-2 rounded-md bg-ink-deep px-4 py-2.5 text-sm font-medium text-ink-paper transition-transform hover:-translate-y-px hover:bg-ink-bleed"
            >
              {ctaLabel} <ArrowIcon />
            </Link>
          </div>
          <div className="lg:max-w-none">{visual}</div>
        </div>
      </div>
    </section>
  );
}

function SurfaceInkwell() {
  return (
    <SurfaceWrap
      index="01"
      name="The Inkwell"
      tagline="explore literary identity through color"
      description="A pan-and-zoom atlas of authors. Each blot's position reflects stylistic similarity, color encodes a perceptual profile, and a side panel reveals the stylometric fingerprint and nearest neighbours of whoever you tap."
      href="/inkwell"
      ctaLabel="Open the Inkwell"
      swatch="oklch(0.65 0.18 280)"
      capabilities={[
        "Three projection modes: classical stylometry, modern embeddings, pure colour.",
        "Hover a blot to preview the author; click to pin a full profile.",
        "Stylometric profile bars: lexical richness, sentence length, abstraction, formality, narrative pace.",
        "Nearest-neighbour list ranked by stylistic distance.",
      ]}
      visual={
        <div className="space-y-4">
          <InkwellMock />
          <AuthorProfilePreview />
        </div>
      }
    />
  );
}

function AuthorProfilePreview() {
  return (
    <div className="rounded-xl border border-border bg-card/80 p-5 shadow-[0_1px_0_rgba(0,0,0,0.02),0_18px_40px_-30px_rgba(40,30,80,0.25)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Blot color="oklch(0.4 0.18 290)" size={44} shape={2} />
          <div>
            <div className="font-serif text-lg text-ink-deep">Virginia Woolf</div>
            <div className="text-[11px] text-muted-foreground">1882–1941 · English writer</div>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
              A pioneer of modernist literature, Woolf's stream-of-consciousness style and deep
              exploration of inner life redefined the novel in the twentieth century.
            </p>
          </div>
        </div>
        <div className="text-[10px] tracking-widest text-muted-foreground uppercase">
          selected blot
        </div>
      </div>

      <div className="mt-5 grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="text-[10px] tracking-widest text-muted-foreground uppercase">
            stylometric profile
          </div>
          <div className="mt-3">
            <ProfileBars />
          </div>
        </div>
        <div>
          <div className="text-[10px] tracking-widest text-muted-foreground uppercase">
            nearest neighbours
          </div>
          <ul className="mt-3 space-y-1.5 text-xs">
            {[
              { name: "James Joyce", d: 0.08 },
              { name: "Marcel Proust", d: 0.11 },
              { name: "T.S. Eliot", d: 0.14 },
              { name: "Franz Kafka", d: 0.16 },
              { name: "Samuel Beckett", d: 0.18 },
            ].map((n) => (
              <li key={n.name} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-ink-deep">
                  <Blot color="oklch(0.5 0.16 290)" size={12} shape={0} splatter={false} />
                  {n.name}
                </span>
                <span className="tabular-nums text-muted-foreground">{n.d.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SurfaceBlots() {
  return (
    <SurfaceWrap
      index="02"
      name="The Blots"
      tagline="every book is a swatch"
      description="A browseable grid of works. Each card resolves four parallel readings (algorithmic, language-model, crowd, and the consensus blend) so you can argue with the data and watch it answer back."
      href="/blots"
      ctaLabel="Browse the Blots"
      flip
      swatch="oklch(0.7 0.16 200)"
      capabilities={[
        "Four colour readings per book: algorithm, LLM, crowd, blend.",
        "Stylistic histogram at a glance: distinctive lexical bands per work.",
        "Filter by era, language, genre, or stylistic neighbourhood.",
        "Click into any blot for full provenance: which signals voted which hue.",
      ]}
      visual={
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {BOOKS.map((b) => (
            <BookCard key={b.title} book={b} />
          ))}
        </div>
      }
    />
  );
}

function SurfaceGame() {
  return (
    <SurfaceWrap
      index="03"
      name="The Blotting Game"
      tagline="a daily stylistic guessing game"
      description="Read a passage. Pick the hue you think it bleeds. Every guess feeds the consensus ink. Over time the crowd teaches the system what readers actually feel, and the system teaches you what your eye keeps missing."
      href="/game"
      ctaLabel="Play the Blotting Game"
      swatch="oklch(0.7 0.18 30)"
      flip
      capabilities={[
        "Three modes: Smudge → Swatch, Smudge → Wheel, Twin Smudges.",
        "Daily streaks and seasonal leaderboards keep readers coming back.",
        "Every guess is anonymous training data for the crowd channel.",
        "Reveal screen shows author, algorithmic colour, and the crowd's mean hue.",
      ]}
      visual={<GameMock />}
    />
  );
}

function SurfaceQuill() {
  return (
    <SurfaceWrap
      index="04"
      name="The Quill"
      tagline="watch small edits shift your stylistic hue"
      description="A writing surface with a live readout. Type freely and your prose surfaces a colour. Pick a target hue and the Quill suggests gentle edits (softened intensity, grounded imagery, paced calm) and shows them as a side-by-side diff."
      href="/quill"
      ctaLabel="Open the Quill"
      swatch="oklch(0.7 0.13 145)"
      capabilities={[
        "Live hue readout updates as you type.",
        "Choose a target colour to receive directional nudges, never rewrites.",
        "Side-by-side or inline diff highlights what changed and why.",
        "Each suggestion is labelled with the stylistic dimension it shifts.",
      ]}
      visual={<QuillMock />}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Stylometric fingerprint                                             */
/* ------------------------------------------------------------------ */
function StylometricFingerprint() {
  const dims = [
    {
      label: "Lexical richness",
      body: "Type–token ratio over rolling windows. Higher = wider vocabulary in fewer words.",
      color: "oklch(0.7 0.18 30)",
    },
    {
      label: "Sentence length",
      body: "Mean and variance. Hemingway clips, James spirals; both visible at a glance.",
      color: "oklch(0.7 0.18 90)",
    },
    {
      label: "Abstraction",
      body: "Concrete vs. abstract ratio drawn from psycholinguistic norms. Calvino floats; Carver lands.",
      color: "oklch(0.7 0.18 150)",
    },
    {
      label: "Formality",
      body: "Register signals (contractions, modals, latinate roots) fused into a single axis.",
      color: "oklch(0.7 0.18 220)",
    },
    {
      label: "Narrative pace",
      body: "Verbs per clause, scene–summary ratio. The tempo a reader actually feels.",
      color: "oklch(0.7 0.18 290)",
    },
  ];
  return (
    <section className="border-b border-border bg-ink-paper-aged/40">
      <div className="mx-auto max-w-[1400px] px-6 py-20 md:py-28">
        <SectionHeading eyebrow="Under the blot">A five-dimensional fingerprint.</SectionHeading>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground">
          Every author and every book gets the same five-axis read. We map those numbers to colour
          and shape so the differences become something you can <em>see</em>, not just compute.
        </p>

        <div className="mt-14 grid gap-4 md:grid-cols-5">
          {dims.map((d, i) => (
            <div
              key={d.label}
              className="rounded-xl border border-border bg-card/80 p-5 shadow-[0_1px_0_rgba(0,0,0,0.02),0_18px_40px_-30px_rgba(40,30,80,0.25)]"
            >
              <div className="flex items-center gap-2">
                <Blot color={d.color} size={28} shape={i % 4} splatter={false} />
                <div className="text-[10px] tracking-widest text-muted-foreground uppercase">
                  axis {String(i + 1).padStart(2, "0")}
                </div>
              </div>
              <div className="mt-3 font-serif text-lg text-ink-deep">{d.label}</div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{d.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Footer lives in components/site-footer.tsx and renders from the root layout. */
