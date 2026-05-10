# Live Market MVP Notes

Status: implementation plan only. No deploy, account setup, secret handling, or STALCRAFT API calls in this pass.

## Current repo shape

- The SvelteKit app is `apps/web`.
- The only route today is `apps/web/src/routes/+page.server.ts` plus `+page.svelte`; it returns hard-coded demo data and does not read secrets.
- `apps/web/svelte.config.js` uses `@sveltejs/adapter-auto`.
- Market persistence already exists in `packages/stalcraft-market` with local SQLite tables for `market_pull`, `auction_history_sample`, `artifact_price_snapshot`, and `latest_artifact_price`.
- Strict-budget unknown handling already exists: `priceForStrictBudget(undefined | 0)` returns `Infinity`, and `latestPriceMapForOptimizer` maps invalid latest prices to `Infinity`.
- The normalized artifact universe currently has 102 artifacts in `data/normalized/artifacts.json`.

## Is a `+page.server` action enough?

Yes for the MVP, if the optimizer request stays simple and short-lived.

Use `+page.server.ts` as the first implementation point:

- `load` reads display defaults and snapshot metadata.
- A named/default form action accepts the prompt, budget, container, and region.
- The action reads a static market snapshot, builds a strict price map, runs the optimizer server-side, and returns the ranked result to the page.

This is enough because the MVP does not need a public JSON API, auth, background jobs, or cross-client programmatic access. Add `src/routes/api/optimize/+server.ts` later only when another client needs a stable API contract or the UI moves away from SvelteKit form actions.

Keep this server-only. Do not import STALCRAFT OAuth/client code, `node:sqlite`, or credential-loading code into the web route.

## Export local SQLite to static JSON

Add a small export script in a later code pass, for example `scripts/export-market-snapshot.ts`, with a package script such as:

```sh
pnpm market:export-snapshot -- --db .cache/market.sqlite --region NA --out apps/web/static/market/latest-NA.json
```

The script should:

- Open local SQLite through `createSQLiteMarketStore(dbPath)`.
- Query `queryLatestArtifactPrices({ region: 'NA', stalePolicy: 'keep-valid' })` or `mark-unknown` depending on chosen UX.
- Write compact, public JSON to `apps/web/static/market/latest-NA.json`.
- Include `schemaVersion`, `region`, `generatedAt`, `strictBudgetUnknownPolicy: "Infinity"`, `variantScope`, aggregate counts, and `items`.
- Include per item: `itemId`, `variantKey`, `medianPrice`, `sampleCount`, `snapshotAt`, `staleAfter`, `valid`, and `unknownReason`.
- Write missing or invalid prices as `valid: false` with no usable price. Do not write `0` as a fallback for strict-budget use.

This snapshot is safe to commit because it contains derived public market data only, not credentials or raw auth responses.

## Live web route read path

For the static MVP, read `/market/latest-NA.json` from `apps/web/static`; do not call STALCRAFT APIs from Vercel.

Recommended route behavior:

- In the server action, fetch/read the static JSON snapshot and validate the schema.
- Convert rows to `LatestArtifactPrice[]`.
- Use `latestPriceMapForOptimizer(latest, { strictBudget: true })`.
- Pass that price map into optimizer constraints when `maxBudget` is present.
- Treat missing snapshot, invalid JSON, stale rows under a `mark-unknown` policy, and missing item IDs as unknown.
- Unknown prices under strict budget are `Infinity` and therefore excluded by budget pruning, never counted as free.
- Return snapshot metadata to the UI: region, generated time, stale count, unknown count, and sample count.

If the optimizer action wraps the snapshot behind an endpoint, keep it read-only and cacheable. Still do not fan out live STALCRAFT auction requests per user request.

## Vercel settings

Project settings:

- Root directory: repo root.
- Install command: `pnpm install --frozen-lockfile`.
- Build command: `pnpm --filter @ultimatebuild/web build`.
- Framework preset: SvelteKit.
- Node runtime: current Vercel-supported Node runtime for the web app. Local market pulls use Node 22 `node:sqlite`, but that path should stay outside Vercel.

Adapter:

- `adapter-auto` should work for the MVP. Vercel documents that SvelteKit's `adapter-auto` detects Vercel and installs/uses the Vercel adapter at build time.
- Prefer adding `@sveltejs/adapter-vercel` later for version stability, faster CI, and explicit runtime/config control.
- Do not switch adapters as part of the market MVP unless deployment output or runtime settings require it.

Hobby/free-tier caveats checked against Vercel docs on 2026-04-25:

- Hobby cron jobs are limited to once per day with hourly scheduling precision, so they are a poor fit for precise or retry-heavy market pulls.
- Hobby includes limited monthly function usage: 1,000,000 invocations, 100 GB-hours duration, 4 CPU-hours active CPU, and 360 GB-hours provisioned memory.
- Static file uploads are limited to 100 MB per deployment on Hobby.
- Vercel functions have bounded duration/memory and an ephemeral filesystem. Do not use them as a durable SQLite host.
- If Vercel Blob is considered later, treat it as small read-mostly object storage and account for Hobby storage/transfer/operation limits.

## First-week market pull policy

Keep STALCRAFT API pulls outside Vercel on a trusted local machine, GitHub Actions job, or small worker.

For the first week with 102 artifacts:

- Pull only the 102 normalized artifact IDs for `NA`.
- Use history limit `200`.
- Use a persistent cache dir, for example `.cache/stalcraft-market`.
- Use serial requests or very low concurrency. The current `pullMarketToSQLite` loop is serial; keep it that way initially.
- Add a 3-5 second delay between item history requests before the first live sweep, or manually chunk the item list into groups of 10-15 with a 60-120 second pause between chunks.
- If the API returns 429/5xx, stop the sweep, keep the previous known-good snapshot, and retry later with smaller chunks.
- Use `staleHours: 168` for weekly freshness unless a shorter market freshness target is explicitly needed.

This is intentionally conservative: 102 artifacts at 3 seconds each is roughly 5-6 minutes of request spacing, which is acceptable for an external worker and avoids making Vercel user traffic part of API usage.

## Verification

Before deploying:

- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm test`
- `pnpm web:check`
- `pnpm web:build`

After adding the export script:

- Run a credential-free fixture pull.
- Export a test snapshot.
- Validate that `apps/web/static/market/latest-NA.json` has no secrets and has `strictBudgetUnknownPolicy: "Infinity"`.
- Add/run tests for snapshot shape, stale/unknown handling, and optimizer exclusion of unknown strict-budget prices.

After Vercel deploy:

- Confirm the static snapshot is reachable at `/market/latest-NA.json`.
- Submit an optimizer request with a strict budget and confirm unpriced artifacts are excluded.
- Confirm Vercel logs do not include STALCRAFT credentials, local credential paths, raw OAuth responses, or live STALCRAFT API calls.

## Sources

- Vercel SvelteKit docs: https://vercel.com/docs/beginner-sveltekit
- Vercel Hobby plan: https://vercel.com/docs/plans/hobby
- Vercel platform limits: https://vercel.com/docs/v2/platform/limits
- Vercel function limits: https://vercel.com/docs/functions/limitations
- Vercel cron usage and pricing: https://vercel.com/docs/cron-jobs/usage-and-pricing
