<div align="center">

<img src="public/inkling-mascot-no-background.png" alt="Inklings mascot — a purple ink-drop with a face" width="220" />

# Inklings

### What color is Shakespeare?

**A canvas of authors, in shape and in hue.**

Inklings translates *writing style* into **color, shape, and interaction** — so readers and writers can *see* a literary identity instead of decoding a table of numbers.

[Concept pitch (PDF)](public/piv-pitch.pdf) · [LMU PVI · SoSe 2026](#academic-context)

</div>

---

## The problem

Writing style is famously hard to describe. Existing **stylometry** tools spit out tables of token ratios, type/token, mean sentence length, function-word frequencies — accurate, but numeric and inaccessible. Readers and writers alike struggle to *see* what makes Woolf feel like Woolf, or where a draft drifts away from the voice it was reaching for.

## The core idea

> We translate writing style into **color, shape & interaction.**

- **Color** — every author/book gets a hue (algorithmic, LLM, crowd, blended) that summarises tone, rhythm, and lexical fingerprint.
- **Shape** — a 2D layout (classical stylometry vs. modern embeddings) positions every work in a navigable canvas.
- **Interaction** — a daily *guessing game* and a live *write-and-watch-the-hue* editor make stylistic difference something you do, not something you read about.

## Features

| Tab | What it is | What you do there |
|---|---|---|
| **The Inkwell** | A pannable canvas of every blot. Switch between *Classical* shape, *Modern* embedding shape, and *Colour* layouts (over-classical, over-modern, by-hue). | Explore literary identity — pan, zoom, click a blot to read its hand. |
| **The Blots** | Per-book detail cards with the four hues (Algorithmic, LLM, Crowd, Blended) and a stylometric fingerprint. | Examine one book at a time. |
| **The Blotting Game** | A daily stylistic guessing game in three modes — *Smudge → Swatch*, *Smudge → Wheel*, *Twin Smudges*. Every guess feeds the crowd ink. | Play. Build a streak. Push the crowd consensus. |
| **The Quill** | A Tiptap editor with a live hue read-out, plus a *target* mode that suggests nudges toward a chosen colour. | Write — and watch small edits shift your stylistic hue. |

## Tech stack

- **Framework** — Next.js **16** (App Router, RSC) on Node **24** · React **19**
- **Styling** — Tailwind **v4** · shadcn/ui (radix) · `tw-animate-css` · custom OKLCH ink palette
- **Editor** — Tiptap **3** (`@tiptap/react`, `@tiptap/starter-kit`)
- **Canvas** — `deck.gl` **9** for the Inkwell map · `motion` for transitions
- **NLP / Stylometry** — `wink-nlp` + `wink-eng-lite-web-model` · `umap-js` for 2D projection
- **AI** — Vercel AI SDK **v6** (`@ai-sdk/anthropic`, `@ai-sdk/openai`) for LLM hue assignment & Quill nudges
- **State / data** — TanStack Query **v5** · Zustand **v5** · `next-safe-action` server actions
- **DB** — Drizzle ORM on **Neon Postgres** with `pgvector` (HNSW index on 1536-d embeddings)
- **Jobs** — Inngest for ingestion pipelines
- **Auth** — `iron-session` (anonymous-first scribes, optional email upgrade)
- **Validation / config** — Zod **v4** · `@t3-oss/env-nextjs`
- **Quality** — Biome (lint + format) · Vitest + Testing Library · Playwright (e2e)

## Quickstart

```bash
pnpm install
cp .env.example .env.local   # fill DATABASE_URL, OPENAI_API_KEY, ANTHROPIC_API_KEY
pnpm db:push                 # apply Drizzle schema to Neon
pnpm seed:tracer             # seed a starter corpus
pnpm dev                     # http://localhost:3000 → /inkwell
```

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Next dev server |
| `pnpm build` / `pnpm start` | Production build & serve |
| `pnpm check` / `pnpm check:fix` | Biome check (lint + format) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest unit tests |
| `pnpm test:e2e` | Playwright e2e |
| `pnpm db:generate` / `db:migrate` / `db:push` / `db:studio` | Drizzle Kit |
| `pnpm db:ping` | Sanity-check the DB connection |
| `pnpm seed:tracer` | Seed the corpus tracer |

## Project structure

```
app/
  (tabs)/
    inkwell/   — canvas of all blots (shape & colour layouts)
    blots/     — per-book detail
    game/      — daily Blotting Game (swatch / wheel / twin)
    quill/     — write-and-watch-the-hue editor
  api/inngest  — ingestion pipeline endpoint
  layout.tsx · page.tsx · globals.css
components/
  canvas/      — deck.gl canvas shell
  landing/     — blot, profile-bars, book-card, inkwell-mock
  ui/          — shadcn primitives
  tabs-nav.tsx · providers.tsx
lib/
  db/          — Drizzle schema (authors, books, features, layout, colours, votes, game, quill, contributions)
  inngest/     — pipeline functions
  auth/        — iron-session scribes
  env.ts       — typed env (@t3-oss/env-nextjs)
drizzle/migrations/
scripts/seed-tracer.ts
tests/{unit,e2e}/
```

## Data model (high-level)

`scribes` (anonymous-first users) → vote on hues, play games, write Quill samples.
`authors` → `books` → `book_features` (classical JSON + 1536-d embedding) → `book_layout` (per mode/version) + `book_colours` (per source: algorithmic / LLM / crowd / blended). `colour_votes` feed the crowd source. `game_sessions`/`game_rounds` log every Blotting Game guess. `contributions` queue user-submitted Gutenberg IDs for moderation.

## Academic context

Built as a semester project for the **Praktikum Informationsvisualisierung (WP15 PVI)** at **LMU München**, *Sommersemester 2026*.

### Team

Alperen Adatepe · Jovana Dinic · Nayun Gao · Noel Huibers · Yannick Martin

## License

MIT — see [LICENSE](LICENSE).
