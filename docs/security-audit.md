# UltimateBuild Security Audit and Remediation Notes

Date: 2026-05-10

Scope: public `stalcraft_v1` handoff tree, including the SvelteKit app, local scripts, packages, static/generated assets, deployment docs/config, environment handling, and dependency posture.

## Summary

The original audit found no critical issues. The public handoff tree has been remediated for the high/medium/low findings that were applicable before publishing:

- Public feedback submission was removed and regression-tested as absent.
- Market snapshot loading is module-cached to avoid parsing the large JSON snapshot on every SSR request.
- Dependency manifests use pinned versions and a pinned `packageManager`.
- Web code imports side-effect-free pricing helpers instead of the market package barrel that contains credential/OAuth/SQLite job code.
- Security headers are set through `apps/web/src/hooks.server.ts`.
- Public handoff sanitization removed owner markers, local machine paths, private planning files, and player-owner source fields from the generated market snapshot.

## High Findings

### High 1 — Public page load could force repeated large JSON parse and optimizer work

Status: **Fixed in this tree.**

What changed:

- `apps/web/src/routes/+page.server.ts` now caches the parsed `/market/latest-NA.json` snapshot in module scope for a bounded TTL.
- Concurrent requests share one in-flight snapshot load instead of each fetching/parsing independently.
- The static market snapshot receives cache headers from `apps/web/src/hooks.server.ts`.

Residual note:

- The bundled snapshot is still intentionally large because it is used as read-only market data. For a production-scale public deployment, the next improvement is a compact optimizer-only snapshot generated during export.

### High 2 — Removed feedback endpoint remained reachable

Status: **Fixed in this tree.**

What changed / verified:

- `apps/web/src/routes/u-/f/+server.ts` is absent.
- The page no longer contains the feedback form or obfuscated feedback route.
- Tests assert the client does not contain Telegram Bot API strings, feedback env names, or the removed route.

Operational requirement:

- If an older deployment ever had feedback env vars configured, remove them from the hosting provider before redeploying this public tree.

## Medium Findings

### Medium 1 — Market snapshot is stale but still usable as old market history

Status: **Mitigated/documented.**

What changed / current policy:

- UI copy distinguishes `Fresh`, `Old`, and `Unknown` market data.
- Recommendation copy states that old rows are historical market data, not current live quotes.
- The snapshot metadata is public and explicit about generation time and staleness.

Production recommendation:

- Refresh `apps/web/static/market/latest-NA.json` before any serious public launch, or generate a production snapshot that marks stale rows unknown.

### Medium 2 — Floating `latest` package specs

Status: **Fixed in this tree.**

What changed:

- Root and web `package.json` files use explicit dependency versions/ranges rather than `latest`.
- Root `package.json` declares `packageManager: pnpm@10.33.2`.

### Medium 3 — Web route imported market barrel containing credential/OAuth/SQLite code

Status: **Fixed in this tree.**

What changed:

- New side-effect-free module: `packages/stalcraft-market/src/pricing-helpers.ts`.
- `apps/web/src/routes/+page.server.ts` imports quality/rarity helpers from `pricing-helpers.ts`, not from the market package barrel.
- Credential/OAuth/SQLite market-pull code remains available for local/operator jobs but is no longer pulled into the web route through that helper import.

## Low Findings

### Low 1 — Missing explicit browser security headers

Status: **Fixed in this tree.**

What changed:

- Added `apps/web/src/hooks.server.ts` with:
  - Content-Security-Policy
  - `frame-ancestors 'none'` and `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Content-Type-Options: nosniff`
  - conservative `Permissions-Policy`

### Low 2 — Deployment docs stale relative to current architecture

Status: **Mitigated in public handoff.**

What changed:

- Public setup docs avoid private machine paths and real secret values.
- Deployment guidance says STALCRAFT credentials belong only in trusted local/worker environments, not in the public web app or committed files.
- Supabase is documented as optional future infrastructure, not a current requirement.

## Public Handoff Sanitization

Removed or neutralized before public repo creation:

- Git history and `.git` metadata from the source repo.
- Hermes/private planning directory.
- Owner marker string in `packages/stalcraft-core/src/index.ts`.
- Local absolute paths such as private home/cache/project locations.
- Player-owner fields from market snapshot `sourceFields` and embedded API `variantKey` metadata.
- Feedback/Telegram route and env references from app source.

## Verification Commands

Recommended checks for this tree:

```bash
pnpm install --frozen-lockfile
pnpm --filter @ultimatebuild/web check
pnpm exec vitest run tests/web.test.ts --reporter=dot
pnpm typecheck
pnpm web:build
git diff --check
```

`pnpm audit` should be run in a networked environment. The earlier local audit attempt could not resolve `registry.npmjs.org` from the isolated environment.
