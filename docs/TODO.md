# UltimateBuild Optimizer TODO

Status from the 2026-04-25 implementation slices.

## Completed in this pass

1. Returned builds from generated candidate instances now run exact final verification through `calculateFinalBuildStats` before entering optimizer results.
   - Candidate instances are rehydrated with artifact metadata and assumptions.
   - Result stats and scores are replaced with exact final-build values at result insertion.
   - `finalVerificationCount` is reported in optimizer stats and benchmark output.

2. Added a guarded capacity-6 3+3 meet-in-the-middle fast path.
   - Enabled only for capacity 6 when the post-skyline candidate count and estimated partial frontier are below conservative in-code limits.
   - Generates partial multisets for slot counts 0..3 and joins compatible 3+3 halves.
   - Uses deterministic partial-frontier pruning within compatibility-equivalent boundary groups.
   - Falls back to branch-and-bound outside the configured candidate/frontier thresholds.
   - Covered by brute-force oracle tests for raw artifact compatibility mode and generated candidate instances.

3. Added optimizer benchmark command.
   - Run with `pnpm benchmark:optimizer`.
   - Emits machine-readable JSON for one raw artifact scenario and one generated candidate-instance scenario.
   - Reports candidate count, skyline-pruned count, partial-pruned count, runtime, visited leaves/nodes, final verification count, search strategy, and best build summary.

4. Hardened `optimize-unlocked`.
   - `generateArtifactCandidates({ additionalStatPolicy: 'optimize-unlocked' })` now throws a clear error instead of silently returning empty or unsourced combinations.
   - Tests assert this mode remains disabled until fixture-backed unlock rules exist.

5. Added SQLite market persistence and manual pull wiring.
   - Uses Node 22 `node:sqlite` as the local synchronous SQLite adapter.
   - `packages/stalcraft-market` can migrate a DB, record pull attempts and failures, insert raw history samples, compute snapshots, upsert latest artifact prices, and query latest prices for optimizer maps.
   - `pnpm market:pull -- --db <path> --fixture <fixture.json>` supports credential-free local/test pulls.
   - Live pulls remain server/local-only through `createDefaultMarketClient`; do not import market pull code into browser bundles.

6. Added a real normalized-data optimizer benchmark.
   - `pnpm benchmark:optimizer:real` runs a deterministic sampled benchmark over real normalized artifacts/containers.
   - Reports artifact count considered, generated candidates, optimizer candidate/pruning stats, runtime, visited nodes/leaves, final verification count, search strategy, best score, and budget/market-data mode.

7. Market pricing policy status.
   - The market snapshot now includes artifact, rarity/color bracket, and `qlt.N|level.M` acquisition-price rows for optimizer-visible pricing.
   - Roll/exact studied-stat rows remain out of the optimizer market map; generated roll assumptions belong to candidate generation, not acquisition cost.
   - Current guard tests cover level-aware bucket pricing and ensure optimizer-facing market rows do not expose exact-roll `q###|l#|rarity.*`, `ptn`, `bonus`, or raw `api:` keys.

8. Added Vercel readiness assessment.
   - See `docs/deployment/vercel-readiness.md`.
   - Current frontend can build as a SvelteKit app, but polished UI, optimizer endpoint contract, and durable market storage remain production work.

9. Documented the `optimize-unlocked` source-truth blocker.
   - See `docs/research/optimize-unlocked-source-truth-blocker.md`.
   - Current local data/docs prove selected stats affect calculations, but not legal slot unlock/exclusivity rules.

## Remaining optimizer work

1. Productionize market pulls.
   - Current SQLite persistence is local/server-job ready and fixture-tested.
   - Next step: choose where weekly pulls run outside Vercel serverless and where durable price snapshots are hosted for the web app.
   - Add live API integration tests only if safe mocked HTTP fixtures are available; do not require live STALCRAFT credentials in CI.
   - Keep the bundled static snapshot guarded so optimizer-visible rows stay roll-free while preserving level-aware acquisition pricing.

2. Source-truth `optimize-unlocked` additional-stat generation.
   - Keep the mode disabled until artifact additional-stat slot unlock rules are fixture-backed.
   - Add legal combination generation only after those unlock rules are known.

3. Broaden optimizer validation after UI/product decisions.
   - Current tests cover brute-force oracle fixtures and the real-data benchmark covers a deterministic normalized-data subset.
   - Add heavier manual benchmarks only after expected runtime and target query shapes are known.
