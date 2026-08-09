<div align="center">

<img src="public/inkling-mascot-no-background.png" alt="Inklings mascot, a purple ink drop with a face" width="220" />

# Inklings

### What color is Shakespeare?

**A stylometric atlas that turns writing style into colour, shape, and interaction.**

[Concept pitch (PDF)](public/piv-pitch.pdf) | [Run locally](#run-locally) | [Academic context](#academic-context)

</div>

## What Inklings does

Inklings makes literary style easier to see and compare. Each book becomes a blot on an interactive canvas. Its position comes from either classical stylometric features, a modern text embedding, or its hue. Its colour can show one of four readings:

- Algorithmic: derived from measurable writing features.
- LLM: a language model's interpretation of the book's style profile.
- Crowd: aggregated colour guesses from readers.
- Blend: a combined algorithmic and LLM reading.

The Inkwell keeps colour and layout as separate controls. Its canvas can show Algorithmic, LLM, or Blend colours; the Crowd reading remains available on the Blots pages.

## Main surfaces

| Route | What you can do |
|---|---|
| [`/inkwell`](http://localhost:3000/inkwell) | Pan and zoom through the corpus, switch between Classical, Modern, and By Hue layouts, display Algorithmic, LLM, or Blend colours, and inspect a book's fingerprint and nearest neighbours. |
| [`/blots`](http://localhost:3000/blots) | Browse books, search by title or author, run semantic "vibe" searches, compare fingerprints, and submit a Project Gutenberg ID for review. |
| [`/authors`](http://localhost:3000/authors) | Browse author "hands" and open an author profile that combines the books currently in the corpus. |
| [`/game`](http://localhost:3000/game) | Play Swatch, Wheel, or Twin rounds using book excerpts. Scores, streaks, and a lifetime leaderboard are tied to an anonymous scribe. Swatch and Wheel guesses also become crowd-colour votes. |
| [`/quill`](http://localhost:3000/quill) | Write in a Tiptap editor with live hue and paragraph readings, a stylometric fingerprint, nearest-author matches, a colour mixer with generated feel descriptions, targeted rewrites, inline diffs, version history, and Markdown export. |

The home page at [`/`](http://localhost:3000) explains the project and links to each main surface. A first-visit tour introduces the Inkwell, Blots, and Quill.

## How the corpus is built

1. The ingestion pipeline fetches public-domain metadata and text from Project Gutenberg.
2. `wink-nlp` extracts classical features, while OpenAI produces a 1536-dimensional embedding.
3. Inklings derives algorithmic and LLM colours, then stores a blended colour alongside them.
4. UMAP projects the corpus into Classical, Modern, and By Hue layouts.
5. Game votes are aggregated into the separate Crowd colour source.

The Quill analyses a writer's draft against the same ideas without adding it to the public corpus.

## Run locally

### Prerequisites

- Node.js 24.x
- pnpm 11 (the repository pins pnpm 11.0.9)
- A Postgres database with the `vector` extension, such as Neon
- OpenAI and Anthropic API keys

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure the environment

Copy the example file:

```bash
# macOS or Linux
cp .env.example .env.local

# PowerShell
Copy-Item .env.example .env.local
```

Set these required values in `.env.local`:

| Variable | Used for |
|---|---|
| `DATABASE_URL` | Application data, corpus features, layouts, game sessions, and optional Quill cloud saves |
| `OPENAI_API_KEY` | Text embeddings and semantic vibe search |
| `ANTHROPIC_API_KEY` | LLM colours, Quill hue readings, explanations, and rewrites |
| `SESSION_SECRET` | Signing the anonymous scribe cookie; must contain at least 32 characters |

Generate a session secret with Node:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"
```

`NEXT_PUBLIC_APP_URL` defaults to `http://localhost:3000`. The example file also documents the optional Inngest Cloud keys. Production data scripts use `DATABASE_URL_PROD`; moderator access can be configured with a comma-separated `MODERATOR_SCRIBE_IDS` list.

### 3. Prepare the database

Enable pgvector once in the database:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Apply the current Drizzle schema:

```bash
pnpm db:push
```

### 4. Add corpus data

Choose one seed path:

```bash
# Fast database and UI smoke test: one stub blot, with no provider calls
pnpm seed:tracer

# Complete local sample: ingest the curated 36-book corpus in this process
pnpm seed:direct
```

`seed:direct` fetches Gutenberg texts and calls both model providers. It creates real features, colours, layouts, and game excerpts, so use it when you want to exercise the whole application. To choose a different corpus size, run `pnpm seed:direct --top=100`.

### 5. Start the app

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Common commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Start the Next.js development server |
| `pnpm build` | Create a production build |
| `pnpm start` | Serve the production build |
| `pnpm check` | Run Biome formatting and lint checks |
| `pnpm check:fix` | Apply Biome's safe fixes and formatting |
| `pnpm typecheck` | Run TypeScript without emitting files |
| `pnpm test` | Run Vitest unit tests |
| `pnpm test:e2e` | Run Playwright end-to-end tests against a local dev server |
| `pnpm db:ping` | Check the database connection |
| `pnpm db:generate` | Generate a Drizzle migration from the schema |
| `pnpm db:migrate` | Apply generated migrations |
| `pnpm db:push` | Push the current schema directly to the configured database |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm seed:tracer` | Add one lightweight stub book for a smoke test |
| `pnpm seed:direct` | Run the complete local ingestion pipeline without Inngest |
| `pnpm seed:all` | Run the corpus seed through Inngest; the Next.js and Inngest dev servers must already be running |
| `pnpm ingest:book <id>` | Enqueue one Project Gutenberg ID through Inngest |

The `derive:*`, `recompute:*`, and `backfill:embeddings` scripts repair or refresh individual stages of an existing corpus. Most also have a `:prod` variant that targets `DATABASE_URL_PROD`.

## Project structure

```text
app/
  (tabs)/
    inkwell/          # Interactive corpus canvas
    blots/            # Book browsing, search, comparison, and detail pages
    authors/          # Author index and profiles
    game/             # Swatch, Wheel, and Twin game modes
    quill/            # Writing analysis and rewrite workspace
  admin/moderate/     # Review queue for Gutenberg submissions
  api/inngest/        # Inngest function endpoint
  page.tsx            # Project landing page
components/
  canvas/             # deck.gl canvas and controls
  blots/              # Book cards, comparison, and submissions
  game/               # Game controls and feedback animations
  quill/              # Editor, colour tools, explanations, and diffs
  tour/               # First-visit guide
  ui/                 # Shared UI primitives
lib/
  auth/               # Anonymous scribe sessions and moderator checks
  colour/             # Algorithmic, LLM, crowd, and blended colours
  db/                 # Drizzle schema and database client
  ingestion/          # Gutenberg metadata, text, and seed lists
  inngest/             # Background ingestion and recompute functions
  layout/              # UMAP projection helpers
  quill/               # Draft analysis, history, Markdown, and diff helpers
  stylometry/          # Classical features, embeddings, and valence
drizzle/migrations/    # SQL migrations
scripts/               # Seeding, ingestion, derivation, and recompute tools
tests/                 # Vitest unit tests and Playwright end-to-end tests
```

## Data and privacy

Visitors receive a signed anonymous scribe cookie. It connects game scores, colour votes, submissions, and optional Quill cloud saves without requiring an account.

Quill drafts stay in the browser's local storage by default. Cloud saving is opt-in from the Quill interface. The application does not provide email login or user profiles.

## Tech stack

- Next.js 16, React 19, TypeScript 6, and Node.js 24
- Tailwind CSS 4, Radix UI primitives, and Motion
- deck.gl 9 for the Inkwell and Tiptap 3 for the Quill
- winkNLP and UMAP.js for stylometry and projection
- Vercel AI SDK with OpenAI embeddings and Anthropic Claude
- Drizzle ORM, Neon Postgres, pgvector, and Inngest
- iron-session for anonymous scribes and Zod for runtime validation
- Biome, Vitest, Testing Library, and Playwright for project quality

## Academic context

Built for the **Praktikum Informationsvisualisierung (WP15 PVI)** at **LMU München**, Sommersemester 2026.

### Team

Alperen Adatepe, Jovana Dinic, Noel Huibers, Yannick Martin

## License

[MIT](LICENSE)
