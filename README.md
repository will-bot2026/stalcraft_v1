# UltimateBuild

UltimateBuild is a STALCRAFT artifact build calculator and optimizer. It turns build goals such as movement speed, vitality, healing, damage resistance, harmful accumulation caps, duplicate artifact rules, container choice, and market budget into legal artifact loadouts with final stat output.

The project is built around one principle: calculator correctness comes before search speed. Optimizer candidates must be evaluated by the calculator before they are shown, because a fast recommendation is not useful if it does not match STALCRAFT/Wiki behavior.

## Quick Start

Use the agent quickstart script for a repeatable local setup:

```bash
scripts/agent-quickstart.sh
```

The script checks Node and pnpm, installs dependencies with the lockfile, runs practical checks, and then prints the local dev server command. To start the SvelteKit web server from the script:

```bash
scripts/agent-quickstart.sh --dev
```

The web app runs from `apps/web` through pnpm filtering:

```bash
pnpm --filter @ultimatebuild/web dev
```

## Common Commands

```bash
pnpm install --frozen-lockfile
pnpm web:check
pnpm test
pnpm typecheck
pnpm web:build
pnpm optimize -- "best movement speed under 0.5 radiation"
```

Market maintenance commands are local/server jobs, not browser code:

```bash
pnpm market:pull -- --db .cache/market.sqlite --region NA --items item_a,item_b --additional --days 30
pnpm market:export-snapshot -- --db .cache/market.sqlite --region NA --out apps/web/static/market/latest-NA.json
```

Live market pulls require STALCRAFT API credentials in the local worker environment. Do not commit credential files or secret values.

## Project Layout

```text
apps/cli/                         CLI wrapper around the optimizer
apps/web/                         SvelteKit web app and static market snapshot
packages/stalcraft-core/          stat calculation and container protection logic
packages/stalcraft-data/          normalized STALCRAFT artifact/container/stat catalogs
packages/stalcraft-market/        STALCRAFT auction history import, SQLite store, snapshot export helpers
packages/stalcraft-nlp/           prompt/objective parsing helpers
packages/stalcraft-optimizer/     candidate generation, pruning, scoring, and final verification
data/normalized/                  Wiki-normalized project data used by the app
data/normalized-exbo/             EXBO-regenerated comparison data
data/wiki-fixtures/               calculator source-truth fixtures
docs/                             calculation, research, deployment, and project notes
reports/data-diff/                generated EXBO-vs-Wiki comparison reports
scripts/                          data, market, benchmark, asset, and agent setup utilities
tests/                            Vitest coverage for calculator, optimizer, market, CLI, and web behavior
```

## How The Pieces Connect

`packages/stalcraft-data` loads normalized artifact, container, and stat catalogs. `packages/stalcraft-core` calculates artifact panel stats and final build stats after container effectiveness/protection. `packages/stalcraft-nlp` maps user wording to optimizer objectives and constraints. `packages/stalcraft-optimizer` generates legal artifact/container candidates, prunes them, scores them, and verifies the final result through the calculator.

The CLI in `apps/cli` calls those packages directly for terminal usage. The SvelteKit app in `apps/web` uses server-side route logic in `apps/web/src/routes/+page.server.ts` to load the static market snapshot, parse form input, run optimization, and render the result in `+page.svelte`.

Market data is intentionally separated from interactive user requests. `packages/stalcraft-market` and the `scripts/market:*` commands can pull auction history into local SQLite and export `apps/web/static/market/latest-NA.json`. The web app reads that JSON snapshot as read-only data; it does not write SQLite or fan out live STALCRAFT API calls per user request.

## Deployment Notes

Vercel should build the web app from the repository root:

- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm --filter @ultimatebuild/web build`
- Framework preset: SvelteKit
- Root directory: repository root

For the current static-snapshot architecture, Vercel does not need STALCRAFT API credentials. Keep live market pulls in a trusted local job, GitHub Actions workflow, small VPS, or another external worker, then publish a compact JSON snapshot for the web app to read.

Supabase is not required by the current code. If a future deployment uses Supabase, use it as hosted storage/database infrastructure for market snapshots or admin tooling, keep service-role keys server-only, and expose only public anon keys that are intentionally safe for browser use. Do not add secret values to this repo.

## Agent Guide

Open `agent.html` in a browser for an agent-oriented onboarding guide covering local setup, dependencies, Vercel, Supabase, market snapshots, and verification. The same quickstart script is documented there:

```bash
scripts/agent-quickstart.sh --dev
```

## Accuracy References

See `docs/stat-calculation.md` for stat formula notes and `docs/research/optimizer-algorithm-recommendation.md` for optimizer design research. Deployment planning lives under `docs/deployment/`.
