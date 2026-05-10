---
title: UltimateBuild optimizer algorithm recommendation
status: recommended
date: 2026-04-25
audience: implementation
priority: calculator-parity-first
---

# Optimizer Algorithm Recommendation

## Executive Recommendation

Build a deterministic exact optimizer around this architecture:

1. Generate legal calculated artifact candidate instances, not raw artifacts.
2. Search separately for each allowed container/backpack and result context.
3. Store candidate stats in a compact columnar matrix keyed by stat dimension.
4. Apply query-safe Pareto skyline pruning before search.
5. Use branch-and-bound as the primary exact search engine.
6. Use 3+3 meet-in-the-middle frontiers as a fast path and verification tool for capacity-6 searches when candidate frontiers are small enough.
7. Keep CP-SAT/MILP as an optional oracle or future server-side fallback, not the primary TypeScript path.
8. Recalculate every returned build with the exact final calculator before display.
9. Verify every pruning rule against brute force on small catalogs.

This is exact over the finite candidate domain selected by the query policy. "Finite candidate domain" is important: quality, rarity, level, selected additional stats, containers, duplicate policy, and market variant policy must be explicit inputs.

## Current Codebase Reality

Relevant current files:

- `packages/stalcraft-core/src/index.ts`
  - Calculates artifact stats, sums stats, checks danger limits, and derives stats.
  - Current `calculateArtifactStats` mixes artifact calculation and container protection. The target model should split this into artifact-panel candidate calculation and final build/result-panel calculation.
- `packages/stalcraft-optimizer/src/index.ts`
  - Current optimizer searches raw `Artifact[]` under one shared `artifactAssumption`.
  - It already has candidate dominance, branch-and-bound pruning, duplicate support, budget support, and top-result sorting.
  - It does not yet generate quality/rarity/level/additional-stat candidate instances.
- `packages/stalcraft-market/src/index.ts`
  - Current market package loads server-local credentials, pulls auction history, caches JSON, builds median maps, and treats missing/invalid history as `Infinity`.
  - It needs durable snapshots and latest-price materialization.
- `packages/stalcraft-data/src/index.ts`
  - Loads Wiki and EXBO-normalized data, including additional stats.
- `packages/stalcraft-nlp/src/index.ts`
  - Current prompts map explicit aliases to stat objectives.
  - It should add a movement composite objective so "fastest movement" means movement plus running speed.

Fixture coverage:

- `data/wiki-fixtures/artifact-calculator-source-truth.json` currently contains 41 artifact-panel source images, 3 build contexts, and 26 result-panel fixtures.
- Normalized Wiki data currently has 102 artifacts and 54 containers/backpacks.

## Problem Model

For a parsed query, solve:

```text
maximize objective(build)
subject to:
  selected container/backpack capacity
  legal artifact instances only
  duplicate policy
  exact final harmful stats <= caps
  total artifact price <= budget, when strict budget is set
  exact stat/result-context constraints
```

This is a small-capacity multidimensional knapsack/search problem with:

- bounded or unbounded item counts depending on duplicate legality;
- multiple hard resource dimensions: slot count, budget, harmful caps;
- one scalar objective by default;
- optional Pareto/top-K alternatives;
- nonlinear or context-sensitive final stats that must be verified by the exact calculator.

## Candidate Generation Model

Create a generator that emits:

```ts
type ArtifactCandidateInstance = {
  candidateId: string;
  artifactId: string;
  artifactName: string;
  level: number;              // 0..15 unless query narrows it
  quality: number;            // integer quality domain chosen by query policy
  rarity: ArtifactRarity;     // legal for quality and artifact
  selectedAdditionalStatKeys: string[];
  duplicateGroupKey: string;  // usually artifactId
  legalDuplicateLimit: number | 'container-capacity';
  artifactPanelStats: Record<StatKey, number>;
  price: number;              // Infinity when unknown under strict budget
  priceSource: PriceSourceSummary;
};
```

Generation steps:

1. Normalize allowed artifact IDs from data source policy.
2. Expand legal quality values:
   - MVP default remains current `artifactAssumption` for existing CLI compatibility.
   - Exact broad search supports integer quality values in the configured range.
   - Full `0..175` with no additional stats gives about `102 * 182 * 16 = 297,024` candidate instances before dominance pruning.
   - `100..175` gives about `102 * 82 * 16 = 133,824` before dominance pruning.
3. Expand legal rarity values:
   - `0-99`: Ordinary.
   - `100`: Ordinary or Unordinary.
   - `101-114`: Unordinary.
   - `115`: Unordinary or Special.
   - `116-129`: Special.
   - `130`: Special or Rare.
   - `131-144`: Rare.
   - `145`: Rare or Exclusive.
   - `146-159`: Exclusive.
   - `160`: Exclusive or Legendary.
   - `161-174`: Legendary.
   - `175`: Legendary or Unique when legal.
4. Expand level values from query policy.
5. Expand selected additional stats by policy:
   - `none`: do not include selected additional stats.
   - `explicit-only`: include only user-provided selections.
   - `optimize-unlocked`: generate legal combinations only after slot unlock rules are source-truthed and tested.
6. Calculate artifact-panel stats with no container protection.
7. Attach market price for the candidate's best-known variant scope.

Do not generate selected-additional combinations from undocumented assumptions. Until legality is exact, `optimize-unlocked` must remain disabled by default.

## Movement Composite Objective

Users saying "fastest movement build" usually mean both:

- `stalker.artefact_properties.factor.speed_modifier` / Movement speed
- `stalker.artefact_properties.factor.sprint_speed_modifier` / Running speed

Recommended default objective:

```ts
movement_score = movement_speed + running_speed;
```

Reasons:

- Both stats are displayed as percentage-point movement modifiers.
- The score is transparent and easy to audit.
- It avoids silently optimizing only walking/combat movement when the user meant general speed.

Recommended parser behavior:

- "movement", "fastest movement", "fast build", "mobility" -> composite objective with both terms at weight `1`.
- "movement speed" when stated specifically -> movement speed only unless the prompt also says running/sprint.
- "running speed", "sprint speed" -> running speed only.

Supported alternatives:

- Sprint-heavy: `movement_score = 0.5 * movement_speed + 1.0 * running_speed`.
- Combat-movement: `movement_score = 1.0 * movement_speed + 0.25 * running_speed`.
- Lexicographic: maximize movement score first, then lower price, then lower harmful load, then deterministic candidate ID order.

Do not normalize by observed max by default. Normalization makes results change when the catalog or quality domain changes, which is bad for reproducibility.

## Harmful Cap and No-Damage Strategy

No-damage queries should compile to final harmful caps using the Wiki limits unless the user supplies stricter caps:

```ts
const defaultNoDamageCaps = {
  radiation: 0.5,
  biological: 0.5,
  psy: 0.5,
  temperature: 0.5,
  frost: 1,
};
```

Rules:

1. Enforce caps on unrounded final build values.
2. Never reject an artifact just because that artifact has a harmful value. Other artifacts may offset it.
3. Search per container/backpack because protection, effectiveness, and capacity change feasibility.
4. Search per result context because visible and derived final stats can change with context.
5. Use family-specific harmful aggregation specs from the calculator:
   - `protected-linear`: final contribution can be transformed by container passthrough.
   - `direct`: final contribution is additive after artifact calculation.
   - `derived`: only the final calculator may decide feasibility.
6. Prune early only when the proof is safe:
   - If all remaining candidates can no longer reduce a harmful dimension enough, prune.
   - If current price plus minimum possible remaining price exceeds budget, prune.
   - If current score plus optimistic remaining score cannot enter top-K, prune.
7. Always run `calculateFinalBuildStats(...)` on returned builds before display.

For proven protected-linear families under a container:

```ts
rawBudget = finalCap / (1 - container.protection / 100);
```

If protection is 100%, the protected positive harmful raw budget is effectively unbounded for that stat, but the final calculator must still verify the build.

Biological, psy, thermal, frost, and beneficial negative accumulation values should not be generalized by sign or stat-name substring. Use explicit stat-family metadata backed by fixtures.

## Budget and Price Integration

Budget constraints are strict by default:

- Container/backpack cost is excluded.
- Unknown or invalid artifact price under strict budget is `Infinity`, never `0`.
- Duplicate MVP cost is `medianUnitPrice * quantity`.
- Each result must expose region, price mode, sample count, snapshot age, and unknown/stale warnings.

Better duplicate pricing when API support exists:

1. Prefer active listing order book if available:
   - cost of quantity `q` = sum of the cheapest `q` available units for that exact variant.
2. If only history exists:
   - MVP: median * quantity.
   - Better: use p50 for one copy, p75/p90 for scarce duplicates, and expose the method.
3. If market prices are not quality/additional-stat-aware:
   - store `variantScope = 'artifact-id-only'`;
   - surface "price is artifact-level, not quality-aware";
   - never pretend a Q175 +15 price is known if the API only returned generic item history.

## Recommended Market Storage

Use SQLite for the local/server MVP. Move to Postgres when UltimateBuild becomes a multi-user hosted service.

Why SQLite first:

- Single local file, easy backups, no separate service.
- Good enough for weekly snapshots and fast indexed lookups.
- Works with current local/server-only credential model.
- Supports partial and covering indexes.

Why not JSON as the long-term store:

- JSON cache is useful for raw response caching.
- It is weak for weekly snapshots, freshness queries, duplicate statistics, and indexed budget lookups.

Why Postgres later:

- Better concurrent writes/reads.
- Materialized latest-price views can be refreshed concurrently.
- BRIN indexes are useful for very large append-only history tables by time.

### SQLite Schema

```sql
CREATE TABLE market_pull (
  run_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  region TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  error TEXT,
  api_base_url TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE auction_history_sample (
  sample_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES market_pull(run_id),
  region TEXT NOT NULL,
  item_id TEXT NOT NULL,
  variant_key TEXT NOT NULL DEFAULT 'artifact-id-only',
  observed_at TEXT,
  price INTEGER NOT NULL,
  amount INTEGER,
  raw_json TEXT NOT NULL
);

CREATE TABLE artifact_price_snapshot (
  snapshot_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES market_pull(run_id),
  region TEXT NOT NULL,
  item_id TEXT NOT NULL,
  variant_key TEXT NOT NULL DEFAULT 'artifact-id-only',
  sample_count INTEGER NOT NULL,
  min_price INTEGER,
  p25_price INTEGER,
  median_price INTEGER,
  p75_price INTEGER,
  p90_price INTEGER,
  mean_price REAL,
  last_seen_at TEXT,
  valid INTEGER NOT NULL,
  unknown_reason TEXT,
  snapshot_at TEXT NOT NULL
);

CREATE TABLE latest_artifact_price (
  region TEXT NOT NULL,
  item_id TEXT NOT NULL,
  variant_key TEXT NOT NULL DEFAULT 'artifact-id-only',
  sample_count INTEGER NOT NULL,
  min_price INTEGER,
  median_price INTEGER,
  p75_price INTEGER,
  p90_price INTEGER,
  valid INTEGER NOT NULL,
  unknown_reason TEXT,
  snapshot_at TEXT NOT NULL,
  stale_after TEXT NOT NULL,
  source_run_id TEXT NOT NULL,
  PRIMARY KEY (region, item_id, variant_key)
);
```

Recommended SQLite indexes:

```sql
CREATE INDEX idx_history_region_item_time
  ON auction_history_sample(region, item_id, observed_at DESC);

CREATE INDEX idx_snapshot_region_item_time
  ON artifact_price_snapshot(region, item_id, snapshot_at DESC);

CREATE INDEX idx_latest_valid_region_item
  ON latest_artifact_price(region, item_id, variant_key, median_price)
  WHERE valid = 1 AND median_price IS NOT NULL;
```

If using Postgres later:

- B-tree on `(region, item_id, variant_key)` for lookups.
- B-tree on `(region, median_price)` for budget prefilters.
- BRIN on append-only `auction_history_sample.observed_at`.
- Materialized view or table for latest prices; `REFRESH MATERIALIZED VIEW CONCURRENTLY` requires a unique index covering all rows.

## Market Pull Workflow

Default schedule:

- Weekly automatic pull per enabled region.
- Manual admin trigger for immediate refresh.
- Rate-limit and batch API calls with deterministic retry/backoff.
- Store raw responses without credentials.
- Write a `market_pull` row for every attempt, successful or failed.
- Build `artifact_price_snapshot` rows from the pull.
- Replace `latest_artifact_price` transactionally after a successful snapshot.

Credentials:

- Keep `./.env.local` local/server-only.
- Never log client secret, bearer token, or raw env content.
- Do not bundle credentials into web assets or test fixtures.

User-facing freshness:

```ts
type PriceFreshness = {
  region: 'NA' | 'EU' | 'SEA' | 'RU';
  snapshotAt: string;
  ageHours: number;
  stale: boolean;
  strictBudgetUnknownPolicy: 'Infinity';
  variantScope: 'artifact-id-only' | 'quality-aware' | 'quality-additional-aware';
};
```

Warn at 8 days old. Mark stale at 14 days old unless manually configured.

## Search Data Structures

Use query-scoped columnar arrays after candidate generation:

```ts
type CandidateMatrix = {
  candidateIds: string[];
  artifactIds: string[];
  duplicateGroupKeys: string[];
  qualities: Uint16Array;
  levels: Uint8Array;
  rarityCodes: Uint8Array;
  prices: Float64Array;
  scoreTerms: Float64Array[];       // one column per objective/stat term
  constraintTerms: Float64Array[];  // harmful caps, hard min/max terms
  exactStatsByCandidate: Map<string, Record<StatKey, number>>;
};
```

Why columnar:

- Search hot paths repeatedly sum the same dimensions.
- Typed arrays reduce allocation compared with nested maps.
- Metadata can stay in normal arrays/maps outside the hot loop.

Keep the exact stat record for final verification and result display. The columnar matrix is an acceleration layer, not the source of truth.

## Query-Safe Skyline Pruning

A candidate `A` dominates `B` only for the active query if all are true:

- `A` is at least as good on every objective dimension.
- `A` is no worse on every hard cap/max dimension.
- `A` is no worse on every hard min dimension after sign normalization.
- `A.price <= B.price` when budget or price tie-breaks are active.
- `A` has the same slot cost and compatible duplicate legality.
- `A` is strictly better in at least one compared dimension.

Dominance must be computed after container/context-specific transformations when those transformations affect compared dimensions.

Do not prune on dimensions that are not included in the query, constraints, final verification requirements, or tie-break policy. If a future UI wants to show broad alternatives, include those stats in the Pareto dimensions for that run.

## Primary Search: Exact Branch-and-Bound

Recommended baseline implementation:

```text
search(candidates, capacity, duplicatePolicy):
  sort candidates by deterministic score/price/harmful/id order
  maintain min-heap of top K complete builds
  recursively choose counts or slot candidates
  prune by:
    score upper bound
    budget lower bound
    harmful recoverability bound
    duplicate/legal count limits
  verify each complete build with final calculator
```

Use a count-vector recursion for duplicate-allowed searches:

- variable `x_i` is count of candidate `i`;
- `0 <= x_i <= capacity` unless duplicate legality is stricter;
- `sum(x_i) <= capacity`.

Use binary recursion when duplicates are disallowed.

Safe bounds to precompute:

- `bestScoreByRemainingSlots[r]`
- `cheapestPriceByRemainingSlots[r]`
- `bestPossibleReductionByHarmfulDimension[r]`
- `bestPossibleIncreaseByHardMinDimension[r]`

For top-K:

- Keep exact score, final stats, price, and candidate identity.
- Tie-break deterministically:
  1. score descending;
  2. total price ascending;
  3. total harmful load ascending for no-damage dimensions;
  4. lexicographic candidate identity.

## Fast Path: Meet-in-the-Middle Frontiers

For capacity 6, use a 3+3 split when the candidate count after skyline pruning is below a configured threshold.

Algorithm:

1. Generate all legal left partial multisets of sizes `0..3`.
2. Generate all legal right partial multisets of sizes `0..3`.
3. Store partial vectors: score, price, harmful vector, candidate IDs.
4. Skyline-prune partials within each slot count.
5. Join left/right partials where total slot count is legal and constraints pass.
6. Keep top-K by deterministic order.
7. Final-verify through exact calculator.

Use this as:

- a production fast path for small/medium query domains;
- a correctness oracle for branch-and-bound on medium domains;
- a benchmark target.

Raw combination count explains why pruning is required:

```text
102 candidates, capacity 6 with replacement: C(107,6) = 1,807,245,622 complete builds
102 candidates, 3-combo half frontier:        C(104,3) = 182,104 partials
500 candidates, 3-combo half frontier:        C(502,3) = 20,958,500 partials
```

The 3+3 split is useful because capacity is tiny, but it must be guarded by frontier-size limits.

## CP-SAT and MILP

Use CP-SAT/MILP for experiments and regression oracles, not the first production implementation.

Pros:

- Natural model for integer candidate counts, capacity, budget, and linear harmful caps.
- Good independent verifier for small/medium linearized cases.
- CP-SAT can prove optimal/feasible/infeasible statuses.

Cons:

- CP-SAT requires integer coefficients, so decimal stats need scaling.
- Official OR-Tools language support does not fit the current all-TypeScript package as cleanly as native search.
- Final STALCRAFT result calculations include context-specific and derived behavior that should remain in the TypeScript parity calculator.
- Shipping a solver adds install, deployment, and debugging cost.

Recommended use:

- `scripts/optimizer-experiments/cp-sat-oracle.*` later, probably Python, for offline validation only.

## Alternatives Considered

| Approach | Decision | Reason |
|---|---|---|
| Raw brute force over complete builds | Reject as production default | Exact but too slow beyond tiny catalogs. Current 102 artifacts at capacity 6 already yields about 1.8B multisets with replacement. |
| Greedy or beam search | Reject for exact mode | Fast but can miss the optimum under harmful caps, budget, and duplicate interactions. |
| Dynamic programming by rounded stat buckets | Reject for parity-critical path | Rounding/discretization can change feasibility and ranking. |
| Branch-and-bound only | Accept as primary | Exact, deterministic, simple to integrate, and already partially present. Needs stronger bounds and candidate-instance support. |
| Meet-in-the-middle only | Accept as fast path | Very strong for capacity 6 after pruning, but memory can explode for large candidate domains. |
| CP-SAT/MILP primary solver | Defer | Strong external solver, but adds dependency and integer scaling issues; best as oracle/fallback. |
| Evolutionary/metaheuristic multi-objective search | Reject for core | Not independently exact. Could be a UI suggestion tool later, never the source of truth. |
| Full Pareto frontier for every query | Defer to explicit mode | Potentially huge. Use scalar objective by default and return compact Pareto alternatives on request. |

## Implementation Phases

### Phase 1: Calculator Boundary Cleanup

Files:

- `packages/stalcraft-core/src/index.ts`
- `tests/core.test.ts`
- fixture tests under `tests/`

Work:

- Add explicit artifact-panel calculation with no container protection.
- Add final build/result-panel calculation that applies container/backpack behavior.
- Add `ResultContext`.
- Add harmful aggregation metadata per stat family.
- Preserve existing tests, then migrate tests to the clearer two-layer API.

### Phase 2: Candidate Instance Generator

Files:

- `packages/stalcraft-optimizer/src/index.ts`
- possibly new `packages/stalcraft-optimizer/src/candidates.ts`
- `packages/stalcraft-data/src/index.ts`
- `packages/stalcraft-nlp/src/index.ts`

Work:

- Implement legal rarity generation.
- Implement candidate instance expansion by quality, level, rarity, additional-stat policy.
- Add duplicate legality fields.
- Add movement composite objective parsing.
- Add tests for exact threshold dual rarity and selected-additional policy.

### Phase 3: Exact Search Upgrade

Files:

- `packages/stalcraft-optimizer/src/index.ts`
- maybe new `branchBound.ts`, `skyline.ts`, `meetInMiddle.ts`
- `tests/optimizer.test.ts`
- `tests/branch-bound.test.ts`

Work:

- Move search to `CandidateMatrix`.
- Implement query-safe skyline pruning.
- Implement harmful recoverability bounds.
- Keep deterministic top-K heap.
- Add MITM frontier fast path for capacity 6/7.
- Add brute-force comparison tests on tiny synthetic catalogs.

### Phase 4: Market Store

Files:

- `packages/stalcraft-market/src/index.ts`
- new migration/schema files under `packages/stalcraft-market/`
- CLI/admin entry under `apps/cli/` or `scripts/`
- `tests/market.test.ts`
- `tests/market-api.test.ts`
- `tests/market-optimizer-integration.test.ts`

Work:

- Add SQLite store.
- Persist weekly snapshots and latest materialized prices.
- Add admin/manual refresh command.
- Add stale/unknown price metadata.
- Keep current JSON cache as raw API response cache if useful.

### Phase 5: UX/API Integration

Files:

- `apps/cli/src/index.ts`
- `apps/cli/src/response.ts`
- `apps/web/src/routes/+page.server.ts`
- web UI files as needed

Work:

- Return result metadata: objective formula, exactness, price snapshot, stale warnings, no-damage caps.
- Show movement score components separately.
- Show why a build is feasible: final harmful values vs caps.

## Tests Needed

Correctness:

- Artifact-panel fixtures from `artifact-calculator-source-truth.json`.
- Result-panel fixtures for container/context behavior.
- Legal rarity generator at every threshold and between thresholds.
- Candidate generator excludes illegal additional stats under `none` and `explicit-only`.
- Candidate generator includes duplicate candidates only where legal.
- Unknown price under strict budget is `Infinity`.
- No-damage caps use unrounded final stats.
- Movement composite maps "fastest movement" to movement + running.

Search exactness:

- Brute force vs branch-and-bound on tiny catalogs, duplicate allowed and disallowed.
- Brute force vs MITM on tiny catalogs.
- Branch-and-bound vs MITM on medium generated catalogs.
- Property tests for dominance:
  - removing dominated candidates never changes the exact best build;
  - dominance includes price when budget is active;
  - dominance includes all active harmful caps.
- Harmful recoverability tests where a harmful prefix is saved by a later reducer.

Performance benchmarks:

- Candidate count by query policy.
- Skyline candidate count.
- Time to first valid build.
- Time to exact top-1 and top-K.
- Visited nodes, score-bound prunes, budget prunes, harmful prunes.
- MITM partial count and frontier count.
- Final verification count.
- Memory for candidate matrix and partial frontiers.

Suggested benchmark scenarios:

1. Current Q100 +0 102-artifact catalog, Berloga 6, movement composite, no budget.
2. Same with strict no-damage caps.
3. Same with strict budget using latest price map.
4. Q100..175, level 0 only, no additional stats.
5. Full Q100..175, levels 0..15, no additional stats, with skyline pruning.
6. Synthetic adversarial catalog where many candidates are nondominated.

## Expected Scale

For one fixed Q100 +0 assumption:

- Candidates: about 102 before pruning.
- Complete duplicate-allowed capacity-6 multisets: about 1.8B raw.
- MITM 3-combo frontier before pruning: about 182K partials.

For Q100..175 and levels 0..15:

- Candidates: about 134K before additional stats and pruning.
- Complete brute force is not practical.
- Candidate skyline pruning must collapse most dominated quality/rarity/level variants for simple objectives.
- If quality-aware prices make many variants nondominated, the query needs narrower policy or solver-backed long-running mode.

For additional stats:

- Candidate growth is multiplicative by legal selected-stat combinations.
- `optimize-unlocked` must wait until slot legality is known and benchmarked.

## Research Sources

- Horowitz and Sahni's knapsack partition work is the classic meet-in-the-middle basis for cutting subset/knapsack enumeration from full-set scale to half-set frontiers: https://cise.ufl.edu/~sahni/papers/computingPartitions.pdf
- Lawler's K-best discrete optimization procedure is the classic reference for exact top-K enumeration framing: https://pubsonline.informs.org/doi/10.1287/mnsc.18.7.401
- Recent knapsack surveys classify multiple, multidimensional, multiobjective, and related knapsack variants as a broad combinatorial optimization family: https://www.sciencedirect.com/science/article/pii/S0305054821003889
- Recent Pareto-pruning review notes that full Pareto sets can become too large and motivates producing a focused representative subset: https://www.sciencedirect.com/science/article/pii/S0360835222000924
- OR-Tools CP-SAT docs confirm CP-SAT is suited to integer programming and requires integer-scaled constraints: https://developers.google.com/optimization/cp/cp_solver
- STALCRAFT API docs state the API is early beta, OAuth-based, region-tied, and endpoints may change: https://eapi.stalcraft.net/index.html and https://eapi.stalcraft.net/overview.html
- STALCRAFT API authentication docs cover client credentials and secret handling: https://eapi.stalcraft.net/auth.html
- STALCRAFT item database docs confirm EXBO item IDs are opaque/case-sensitive and the public item database is pushed when the game updates: https://eapi.stalcraft.net/items.html
- SQLite query-planner docs motivate explicit indexes, including multi-column/covering indexes: https://www.sqlite.org/queryplanner.html
- PostgreSQL docs support B-tree for equality/range lookups and BRIN for large physically ordered tables: https://www.postgresql.org/docs/17/indexes-types.html
- PostgreSQL materialized view docs describe refresh behavior and concurrent refresh requirements: https://www.postgresql.org/docs/current/sql-refreshmaterializedview.html
- Apache Arrow JS docs summarize the benefits of columnar in-memory layouts for analytics-style scans: https://arrow.apache.org/js/current/

