# Vercel Free-Tier Market Plan

Status: recommendation for a Vercel Hobby/free-tier deployment. This is intentionally a low-cost, low-call architecture; it does not require UI changes yet.

Limit snapshot checked against official Vercel docs on 2026-04-25:

- Hobby cron jobs can run no more often than once per day, with hourly scheduling precision.
- Hobby includes 1,000,000 function invocations, 100 GB-hours function duration, 4 CPU-hours active CPU, and 360 GB-hours provisioned memory.
- Hobby static file uploads are limited to 100 MB per deployment.
- Vercel Blob Hobby includes 1 GB/month storage, 10 GB/month data transfer, 10,000 simple operations, and 2,000 advanced operations; Hobby cannot buy overage and loses Blob access until the window resets if limits are exceeded.

## Recommended MVP architecture

Use Vercel only for the SvelteKit web app and read-only market data. Do market pulls outside Vercel, write a compact JSON snapshot, and deploy that snapshot with the app or fetch it from read-only object storage.

Recommended MVP:

1. Run `pnpm market:pull` manually or weekly from a trusted machine/GitHub Actions job.
2. Store the durable working database outside Vercel as SQLite on that machine/job workspace.
3. Export only the latest price rows needed by the optimizer into a static JSON snapshot.
4. Commit the snapshot into the repo under a future path such as `apps/web/static/market/latest-NA.json`, or publish it to a public/read-only object URL.
5. Let SvelteKit read the static JSON snapshot. Never write market SQLite files from Vercel functions.

This fits the current code shape: `packages/stalcraft-market` already records pull attempts, stores auction history samples, computes `latest_artifact_price`, carries freshness metadata, and treats unknown strict-budget prices as `Infinity` through `latestPriceMapForOptimizer`.

## Weekly/manual data flow

Manual pull flow:

1. Choose a bounded item universe for the region, starting with artifacts the optimizer can actually emit.
2. Run a local/server pull with cache reuse:

   ```sh
   pnpm market:pull -- --db .cache/market.sqlite --region NA --items item_a,item_b --cache-dir .cache/stalcraft-market --limit 200
   ```

3. Inspect the JSON summary only: pull id, region, item count, sample count, and snapshot count.
4. Export latest prices from SQLite to a compact JSON snapshot. Add a small script for this when implementing the deployment path.
5. Commit the generated snapshot, or upload it to object storage with a stable URL.
6. Deploy the SvelteKit app normally on Vercel.

Fixture/test pull flow stays credential-free:

```sh
pnpm market:pull -- --db .cache/market.sqlite --fixture fixtures/market.json
```

The snapshot should include enough metadata for the UI and optimizer:

- `region`
- `generatedAt`
- `staleAfter`
- `strictBudgetUnknownPolicy: "Infinity"`
- `variantScope`
- per item: `itemId`, `variantKey`, `medianPrice`, `sampleCount`, `snapshotAt`, `staleAfter`, `valid`, `unknownReason`

## Storage options ranked

1. Static JSON snapshot in the repo or static object URL.
   - Best Hobby/free MVP.
   - Zero runtime writes, no database connection limit, no Vercel cron requirement, cheap CDN reads.
   - Keep the deployed snapshot comfortably below Vercel's 100 MB Hobby static-file upload limit.
   - Repo commit is simplest and most reproducible. Object storage avoids repository churn if snapshots become large.
   - Tradeoff: updates require a commit/deploy or object upload.

2. GitHub Actions artifact plus commit/pull request.
   - Good if weekly automation is desired without Vercel cron.
   - A scheduled action can run the pull, reuse an Actions cache for history JSON, export a snapshot, and open/commit a change.
   - Keep STALCRAFT credentials only in GitHub Actions secrets. Do not print env contents or credential file paths in logs.
   - Tradeoff: free Actions quotas and scheduled-job reliability apply; generated commits can add noise.

3. Local cron upload.
   - Good low-cost option if one trusted local machine or small server is already available.
   - Run the pull weekly with a persistent `.cache/stalcraft-market`, export JSON, and upload to a stable object URL or commit through a bot account.
   - Tradeoff: depends on that machine staying available.

4. Vercel Blob.
   - Reasonable only if the free allowance and pricing fit the expected snapshot size and read traffic.
   - Current Hobby inclusion is small but workable for a compact snapshot: 1 GB/month storage, 10 GB/month data transfer, 10,000 simple operations, and 2,000 advanced operations.
   - Use it as read-mostly object storage from Vercel, not as a place where user requests trigger market refreshes.
   - Tradeoff: Hobby cannot purchase overage; if Blob limits are exceeded, access pauses until the usage window resets.

5. Turso, Neon, or Supabase free tier.
   - Better once ad hoc queries, admin dashboards, or multi-region snapshots matter.
   - Turso is the closest conceptual match for SQLite-style latest-price reads, but current code uses Node 22 `node:sqlite`, so a hosted driver/data access layer would still be new work.
   - Neon/Supabase provide Postgres free tiers with stronger hosted semantics but require schema migration from SQLite and connection-pooling discipline from serverless.
   - Tradeoff: more moving parts than the MVP, free tiers can sleep, throttle, or change limits.

## Safe SvelteKit reads on Vercel

The app should read market data as static, read-only data:

- Preferred MVP: fetch `/market/latest-NA.json` from `apps/web/static` or import a generated JSON module at build time if the file is small enough.
- Use a server-only loader or endpoint if the optimizer runs server-side and should avoid shipping the entire snapshot to the browser.
- Use static/CDN cache headers for snapshots. If an endpoint wraps the JSON, return `Cache-Control` with a long shared cache TTL plus a controlled revalidation window.
- Validate snapshot shape before use. Invalid, missing, stale, or unpriced items must be represented as unknown and excluded under strict budget.
- Preserve current strict-budget behavior: unknown/stale prices resolve to `Infinity`, never `0`.
- Surface `region`, `snapshotAt`/`generatedAt`, age, `sampleCount`, and stale/unknown status in UI when market pricing is used.
- Important caveat: the current market snapshot is still artifact-ID-only, not quality/level-specific pricing. The optimizer can choose better Q/level variants, but market cost does not rise for those upgrades until variant-aware market prices are added. That is the next real pricing accuracy blocker.

Do not import pull code, OAuth code, `node:sqlite`, or local credential loading into browser bundles. Any future server-only market reader should stay separate from `createDefaultMarketClient`.

## API-call minimization

Use a deliberately small pull policy:

- Item universe: start with artifact IDs that the optimizer can actually choose, then split by region. Do not sweep unrelated item database entries.
- Batching/concurrency: keep live history request concurrency low. The current helper uses batches of 5; that is a reasonable ceiling until API limits are known.
- Cache reuse: always use `--cache-dir` for live pulls so repeated manual/weekly runs reuse unchanged item history where acceptable.
- TTL/staleness: set `staleAfter` explicitly. Weekly pulls can use `168` hours as the default; stale snapshots should be visible to users and strict budget should treat stale/unknown prices as unavailable if the selected policy is `mark-unknown`.
- History depth: use a fixed `--limit` such as `200` unless a narrower sample proves stable enough.
- Manual refresh guard: any future admin refresh should require authentication, rate limits, a cooldown, a bounded item set, and a background worker outside user request paths.
- Failure behavior: keep the previous known-good snapshot if a pull fails, but mark the new attempt as failed in the durable pull log.

Do not design a public Vercel endpoint that fans out live STALCRAFT auction history calls per user request. That would multiply API traffic by user traffic and make failures part of the interactive path.

## Vercel settings and env vars

Project settings:

- Root directory: repo root.
- Install command: `pnpm install --frozen-lockfile`.
- Build command: `pnpm --filter @ultimatebuild/web build`.
- Framework preset: SvelteKit.
- Node version: use a current Vercel-supported Node runtime for the web app. The local SQLite market pull path requires Node 22, but it should not run inside Vercel functions.

MVP env vars:

- No STALCRAFT credentials in Vercel for the static-snapshot MVP.
- Optional `PUBLIC_MARKET_SNAPSHOT_URL` only if the app reads a public object-store URL instead of bundled static JSON.
- Optional server-only `MARKET_SNAPSHOT_URL` if a SvelteKit server endpoint fetches the object-store snapshot.

External worker/GitHub Actions env vars:

- `STALCRAFT_CLIENT_ID`
- `STALCRAFT_CLIENT_SECRET`
- Optional non-secret pull configuration such as region, item list path, history limit, cache directory, and output path.

Credential values must not be printed, committed, or exposed to browser code.

## What not to do on Vercel Hobby

- Do not write SQLite market databases from Vercel functions.
- Do not rely on Vercel's ephemeral filesystem for durable cache or pull state.
- Do not run long weekly market sweeps in Vercel functions.
- Do not add frequent Vercel cron jobs. If cron is used at all on Hobby, keep it daily or less frequent and only for a simple trigger/health check, not the pull itself.
- Do not expose a public refresh endpoint.
- Do not make user optimizer requests call STALCRAFT auction history live.
- Do not bundle local credential loading or OAuth client-secret code into the web app.
- Do not treat unknown, invalid, missing, or stale strict-budget prices as free.

## Phase plan

MVP:

- Add a snapshot export script that reads `latest_artifact_price` from local SQLite and writes compact JSON.
- Commit `apps/web/static/market/latest-NA.json` or publish the same JSON to a stable object URL.
- Add a server-only/read-only market snapshot loader for the optimizer path.
- Display snapshot freshness, sample count, and stale/unknown status when market budget is active.
- Keep pulls manual or weekly outside Vercel.

Better hosted data:

- Move snapshots to object storage if repo churn or file size becomes annoying.
- Move latest prices to Turso/Postgres only when query needs exceed simple JSON lookup.
- Add schema/version fields to snapshots before supporting multiple regions or variant scopes.

Admin refresh:

- Add authenticated admin-only refresh controls only after the worker exists outside Vercel request handling.
- The admin action should enqueue or trigger a bounded external job, then show job status from durable storage.
- Keep a cooldown and preserve the last known-good snapshot on failure.

## Minimal package/script/docs changes recommended

No app UI code needs to change for this planning pass.

Recommended next small code changes:

- Add `scripts/export-market-snapshot.ts` to export `latest_artifact_price` from SQLite to JSON.
- Add `pnpm market:export-snapshot -- --db .cache/market.sqlite --region NA --out apps/web/static/market/latest-NA.json`.
- Add a tiny schema/version field to the exported JSON so future readers can reject incompatible snapshots.
- Add focused tests for snapshot export shape and strict-budget stale/unknown handling when the web reader is implemented.

Until those are added, deployment can still proceed with static normalized app data and without market pricing in production.

## Sources

- Vercel Cron Jobs usage and pricing: https://vercel.com/docs/cron-jobs/usage-and-pricing
- Vercel Hobby plan included usage: https://vercel.com/docs/plans/hobby
- Vercel platform limits: https://vercel.com/docs/v2/platform/limits
- Vercel Blob usage and pricing: https://vercel.com/docs/vercel-blob/usage-and-pricing
