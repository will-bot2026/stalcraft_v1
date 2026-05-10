# Vercel Readiness

Status: assessment only. Do not deploy from this pass.

## Current frontend

- App: `apps/web`, SvelteKit with `@sveltejs/adapter-auto`.
- Current UI is an MVP shell. It is not yet the polished the project owner/Google Stitch design.
- Server load route only returns static defaults and example prompt. No secrets are read by the web app today.
- Static item icons live under `apps/web/static/item-icons` and are safe for Vercel static serving.

## Recommended Vercel project settings

- Root directory: repo root.
- Install command: `pnpm install --frozen-lockfile`.
- Build command: `pnpm --filter @ultimatebuild/web build`.
- Framework preset: SvelteKit.
- Output: SvelteKit/Vite build output managed by the adapter.

`@sveltejs/adapter-auto` should work on Vercel for a basic SvelteKit app. Add `@sveltejs/adapter-vercel` later if the app needs Vercel-specific runtime controls, ISR/edge choices, or clearer production parity.

## Safe on Vercel

- SvelteKit page rendering and static asset serving.
- Short server-only optimizer requests if the request stays within serverless CPU/time limits and imports only local TypeScript/data modules.
- Read-only normalized data bundled with the app.

## Not Vercel-safe as currently designed

- Market SQLite writes. Vercel serverless filesystems are ephemeral and not a durable SQLite host.
- Weekly market pulls against STALCRAFT API if they require long execution, retries, large item sweeps, or durable local cache writes.
- Any code path that reads `./.env.local`; that path is local-only and must never be assumed in Vercel.

## Recommended architecture

- Deploy the SvelteKit frontend on Vercel after the polished UI is ready.
- Keep market pulls in an external worker, local cron, GitHub Actions job, or a small VPS job that writes to durable storage.
- For production market data, use a hosted database or object snapshot that Vercel reads, rather than writing SQLite inside serverless functions.
- Keep STALCRAFT API credentials only in the external worker environment. If Vercel later needs read-only API access, add Vercel env vars explicitly and keep all calls in `+server.ts`/server-only modules.

## Blockers before production deploy

- Polished frontend design is not implemented yet.
- No production optimizer endpoint contract exists yet.
- No hosted durable market data store is selected.
- Need final secret scan to confirm market/API modules are not imported into browser bundles.
- Need Vercel project confirmation for Node version. The market SQLite adapter uses Node 22 `node:sqlite` and is for local/server jobs, not browser bundles.

## Local readiness commands

- `pnpm --filter @ultimatebuild/web check`
- `pnpm --filter @ultimatebuild/web build`
- `pnpm typecheck`
- `pnpm test -- --runInBand`
