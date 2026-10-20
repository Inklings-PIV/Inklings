# Dependency maintenance and regression evidence

Updated 2026-10-21 from baseline `40205810d61c926079205f3a9f48da304dd42aca`. The delegated implementation agent prepared the updates in an isolated worktree, then reached a usage limit before its final handoff. The parent inspected the saved changes, addressed independent QA feedback, and completed fresh verification. No production database, model-provider account, or GitHub issue/PR state was changed.

## Result

All 52 original direct dependencies/devDependencies were inventoried against the npm registry's stable `latest` tags. Of the 51 retained packages, 41 manifest versions changed and 10 were already current. Removed `@types/diff`, because `diff` supplies its own declarations. Upgraded pnpm separately from 11.0.9 to 12.14.0. The final `pnpm outdated --format json` reports only `@types/node`: intentionally kept on the latest Node 24 line to match the supported runtime.

Major changes include AI SDK 7 / provider adapters 4, iron-session 9, Motion 14, TypeScript 7, Vitest 5, jsdom 30, Testing Library jest-dom 7, dotenv 18, and pnpm 12. Next is 16.4.2 and React/ReactDOM are 19.3.1. This is a broad update and should be reviewed with the integration limits below in mind.

Kept Node 24 LTS, tightening the engine to `>=24.15.0 <25` because jsdom 30 requires that patch floor on Node 24. The installed Node 24.21.0 passes all final local checks. The implementation agent also recorded passing types, units and production build on Node 26.12.0, but Node's release index listed 26 as non-LTS at review time; no runtime-major migration is bundled here. Aligned `@types/node` from the old mismatched 25.x to 24.19.2. Dependabot ignores only future major Node type upgrades until the runtime is intentionally upgraded.

## Maintenance changes

- `.github/dependabot.yml`: weekly npm/pnpm and GitHub Actions updates. Group Next/React, AI SDK, Tiptap, and Tailwind families to avoid incompatible partial updates. No automatic merge behavior was added. pnpm uses Dependabot's `npm` ecosystem.
- `.github/workflows/ci.yml`: updated existing Actions, and added typecheck, production build, Chromium installation and desktop/mobile public-page smoke. Preserve failed browser traces/artifacts for seven days. This workflow is configured and locally linted; it has not been executed on GitHub in this task or made a required branch-protection check.
- Migrated Biome's changed configuration schema/preset property using its migration output.
- Renamed Vitest config to `.mts` and used `import.meta.dirname` for explicit ESM configuration.
- Removed duplicate/obsolete package.json build-policy settings; kept the existing explicit build allowlist in `pnpm-workspace.yaml`.
- Updated README runtime/package-manager and TypeScript prerequisites.
- Corrected the stale browser assertion: the existing landing page stays at `/`; it does not redirect to `/inkwell`. Product routing was not changed to accommodate a test.

## Dependency overrides and exceptions

`esbuild` and `postcss` overrides now select patched current ranges. The esbuild override crosses Drizzle Kit's declared 0.x range, so a DB-free TypeScript-config/schema-generation smoke was run successfully: 12 tables, SQL output in temporary directories only. This validates config loading/generation, not live migration behavior. Retain that limitation when reviewing future upgrades.

A narrowly scoped `fflate@0.7.4: 0.7.5` override updates the old loaders.gl pin for its malformed ZIP64 handling fix. Exact-version release-age exceptions for seven selected current packages were added by pnpm when attempting the explicitly requested latest updates. Other versions retain pnpm's default age protection. Those exact-version exceptions can be removed once the default age has elapsed.

## New compatibility checks

The original 228 tests remain. Ten additional tests exercise real dependencies at controlled boundaries:

- Anthropic structured output and text generation, and OpenAI embedding order/model, replacing only HTTP transport with local responses. No paid calls.
- iron-session cookie-store save/load/destroy.
- Actual `NextRequest`/`NextResponse` proxy transport: missing cookie, stale cookie recovery, existing valid cookie, a cookie sealed by iron-session 8, and metadata bypass. The DB mock throws if the proxy unexpectedly accesses it.
- The real Tiptap editor mounts and replaces a passage while preserving surrounding prose.

Browser smoke covers landing content/navigation links, legal-page client navigation, horizontal overflow, and hydrated theme controls plus guide replay/dismissal. It runs on desktop Chromium and an emulated Pixel 7. It intentionally avoids database-backed tabs and paid provider calls. Guide replay tests the first step through its existing event interface without navigating to a DB route; this is not a complete tour test or a real-device accessibility audit.

## Verification

Fresh parent checks on the final implementation, Node 24.21.0 / pnpm 12.14.0:

| Check | Result |
| --- | --- |
| Frozen dependency install | PASS |
| Biome | PASS, 182 files before adding this Markdown report |
| TypeScript | PASS |
| Unit/component tests | PASS, 37 files / 238 tests |
| Production build | PASS, Next 16.4.2 / Turbopack, offline dummy credentials |
| Production desktop/mobile browser smoke | PASS, 6 checks (3 workflows × 2 viewports) |
| Drizzle config/schema generation | PASS, 12 tables, temporary SQL output, no DB connection |
| GitHub Actions syntax (`actionlint`) | PASS |
| Dependabot configuration JSON schema | PASS |
| Stable-version inventory (`pnpm outdated`) | Only intentionally aligned `@types/node` differs from latest major |

An intermediate browser attempt reported a missing client-reference manifest on `/impressum` and missing generated `/500` output. A subsequent clean sequential production build/start run passed the then-four checks; the parent independently repeated build/start with the expanded smoke set. The intermediate artifact failure's root cause was not established. It is recorded rather than attributed to a specific package without evidence.

AI SDK 7 still supports the application's `generateObject` API but emits a deprecation warning recommending `generateText` with an output setting. Leave that behavioral migration as a focused follow-up with the adapter tests; warnings were not suppressed to make the suite look clean.

## Remaining package advisories

The audit changed from **81 findings** (3 critical, 29 high, 40 moderate, 9 low) to **2 findings** (0 critical, 1 high, 1 moderate). These are pnpm's advisory counts for each resolved tree, not a count of exploitable application endpoints. `pnpm audit` still exits 1 because two findings remain.

| Package | Severity | Remaining path and decision |
| --- | --- | --- |
| `image-size@0.7.5` | High | deck.gl → loaders.gl textures/texture-compressor. [ICNS parser denial of service, GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr); patched in 2.0.3+. A cross-major global override would change the consuming API and was not forced. |
| `sprintf-js@1.0.3` | Moderate | texture-compressor → argparse. [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c); registry audit lists no patched release. |

The application uses deck.gl's orthographic/vector/text rendering rather than an ICNS upload feature, but full exploit reachability was not established. Do not claim the advisories are harmless or fixed. A sensible next dependency-focused change is replacing the umbrella `deck.gl` dependency with the specific core/layers/react packages actually used, then validating WebGL behavior and comparing the resolved tree/bundle. That removes unused loader scope more safely than overriding incompatible transitive majors blindly.

## What passing checks do not prove

No configured disposable Postgres/pgvector or real provider credentials were available. The following remain unverified end-to-end: migrations against an existing database, pgvector query plans, actual Inngest Cloud registration/retries, all game flows, WebGL rendering after the upgrade, cloud draft persistence, provider failure/retry behavior and live model compatibility. The adapter tests exercise successful wire responses, not every production provider contract. Mobile browser emulation is not a physical device or screen-reader test.

The first-party game authorization/race/validation bugs, AI admission controls, fresh author-link failure, mobile atlas detail access, and draft integrity findings in the repository reviews are baseline product defects. Dependency upgrades do not fix them. Review and address those separately rather than treating green builds or fewer package advisories as an application security clearance.

## Complete direct-package inventory

Versions below are manifest values; current registry tags were captured at review time. Node types are the only retained major exception. Dependency removal is recorded explicitly.

| Package | Before | After | Decision |
| --- | --- | --- | --- |
| `@ai-sdk/anthropic` | `^3.0.78` | `^4.0.84` | Upgrade stable version |
| `@ai-sdk/openai` | `^3.0.64` | `^4.0.98` | Upgrade stable version |
| `@neondatabase/serverless` | `^1.1.0` | `^1.2.0` | Upgrade stable version |
| `@t3-oss/env-nextjs` | `^0.13.11` | `^0.13.11` | Already current |
| `@tanstack/react-query` | `^5.100.11` | `^5.104.5` | Upgrade stable version |
| `@tiptap/pm` | `^3.23.4` | `^3.32.0` | Upgrade stable version |
| `@tiptap/react` | `^3.23.4` | `^3.32.0` | Upgrade stable version |
| `@tiptap/starter-kit` | `^3.23.4` | `^3.32.0` | Upgrade stable version |
| `ai` | `^6.0.185` | `^7.0.147` | Upgrade stable version |
| `class-variance-authority` | `^0.7.1` | `^0.7.1` | Already current |
| `clsx` | `^2.1.1` | `^2.1.1` | Already current |
| `deck.gl` | `^9.3.2` | `^9.4.0` | Upgrade stable version |
| `diff` | `^9.0.0` | `^9.0.0` | Already current |
| `drizzle-orm` | `^0.45.2` | `^0.45.4` | Upgrade stable version |
| `fast-xml-parser` | `^5.8.0` | `^5.11.2` | Upgrade stable version |
| `inngest` | `^4.4.0` | `^4.25.0` | Upgrade stable version |
| `iron-session` | `^8.0.4` | `^9.0.1` | Upgrade stable version |
| `lucide-react` | `^1.16.0` | `^1.60.0` | Upgrade stable version |
| `motion` | `^12.39.0` | `^14.4.0` | Upgrade stable version |
| `next` | `16.2.6` | `16.4.2` | Upgrade stable version |
| `next-safe-action` | `^8.5.2` | `^8.7.3` | Upgrade stable version |
| `next-themes` | `^0.4.6` | `^0.4.6` | Already current |
| `radix-ui` | `^1.4.3` | `^1.8.1` | Upgrade stable version |
| `react` | `19.2.6` | `19.3.1` | Upgrade stable version |
| `react-dom` | `19.2.6` | `19.3.1` | Upgrade stable version |
| `sonner` | `^2.0.7` | `^2.0.8` | Upgrade stable version |
| `tailwind-merge` | `^3.6.0` | `^3.7.0` | Upgrade stable version |
| `tw-animate-css` | `^1.4.0` | `^1.4.0` | Already current |
| `umap-js` | `^1.4.0` | `^1.4.0` | Already current |
| `wink-eng-lite-web-model` | `^1.8.1` | `^1.8.1` | Already current |
| `wink-nlp` | `^2.4.0` | `^2.4.0` | Already current |
| `zod` | `^4.4.3` | `^4.6.7` | Upgrade stable version |
| `zustand` | `^5.0.13` | `^5.0.15` | Upgrade stable version |
| `@biomejs/biome` | `^2.4.15` | `^2.5.15` | Upgrade stable version |
| `@playwright/test` | `^1.60.0` | `^1.64.1` | Upgrade stable version |
| `@tailwindcss/postcss` | `^4.3.0` | `^4.3.3` | Upgrade stable version |
| `@testing-library/dom` | `^10.4.1` | `^10.4.2` | Upgrade stable version |
| `@testing-library/jest-dom` | `^6.9.1` | `^7.0.1` | Upgrade stable version |
| `@testing-library/react` | `^16.3.2` | `^16.3.3` | Upgrade stable version |
| `@types/diff` | `^8.0.0` | `removed` | Remove redundant declarations; diff provides types |
| `@types/node` | `^25.9.0` | `^24.19.2` | Align with Node 24 runtime; latest major 26 intentionally held |
| `@types/react` | `^19.2.14` | `^19.3.0` | Upgrade stable version |
| `@types/react-dom` | `^19.2.3` | `^19.3.0` | Upgrade stable version |
| `@vitejs/plugin-react` | `^6.0.2` | `^6.1.2` | Upgrade stable version |
| `cross-env` | `^10.1.0` | `^10.1.0` | Already current |
| `dotenv` | `^17.4.2` | `^18.0.8` | Upgrade stable version |
| `drizzle-kit` | `^0.31.10` | `^0.31.11` | Upgrade stable version |
| `jsdom` | `^29.1.1` | `^30.1.3` | Upgrade stable version |
| `tailwindcss` | `^4.3.0` | `^4.3.3` | Upgrade stable version |
| `tsx` | `^4.22.2` | `^4.23.15` | Upgrade stable version |
| `typescript` | `^6.0.3` | `^7.0.2` | Upgrade stable version |
| `vitest` | `^4.1.6` | `^5.0.5` | Upgrade stable version |
| `pnpm` | `pnpm@11.0.9` | `12.14.0` | Upgrade stable package manager |
