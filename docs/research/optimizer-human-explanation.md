# Optimizer Explanation for the project owner

## What Problem We Are Solving

UltimateBuild should answer prompts like:

```text
I want the fastest movement build.
Maximize movement under 5 million while taking no environmental damage.
```

The hard part is that the best build is not just "pick the six best speed artifacts." The calculator has to account for container/backpack capacity, container protection, artifact quality, rarity, level, selected additional stats, harmful stats, duplicate artifacts, and market budget. A build that looks strong on speed can become invalid because it crosses radiation, biological, psy, temperature, or frost thresholds.

The most important rule stays the same: calculator parity comes first. A fast optimizer that gives the wrong STALCRAFT Wiki result is not useful.

## Why Brute Force Alone Is Not Enough

Brute force is fine for tiny tests and should remain our proof tool. It is the simplest way to verify that smarter pruning did not change the answer.

It is not enough for real searches. With the current 102 Wiki artifacts and a 6-slot container, allowing duplicates creates about 1.8 billion raw six-artifact combinations at just one quality and level. If we also search many qualities, rarities, levels, and selected additional stats, the raw count becomes far too large.

So the optimizer still examines the complete legal search space, but it should skip branches only when we can prove they cannot beat the current best or cannot become legal.

## Algorithms Considered

Brute force:

Exact and simple, but too slow except for small catalogs and tests.

Greedy or beam search:

Fast, but not exact. It can miss builds where a cheaper or safer artifact makes the whole build better.

Branch and bound:

Exact when bounds are safe. This should be the main search engine. It explores possible builds but cuts off branches that cannot win.

Meet in the middle:

Very useful for 6-slot containers. Instead of building every 6-artifact combination directly, build 3-artifact partials, prune them, then join compatible halves. This is a strong fast path, but it can use too much memory if the candidate list is huge.

Pareto frontier pruning:

Safe when it only compares dimensions the query actually cares about: objective stats, harmful caps, budget, and required constraints. If candidate A is no worse than candidate B in every relevant way and better in at least one way, B can be dropped.

CP-SAT/MILP solvers:

Useful as an independent oracle later, especially for linear versions of the problem. Not the best first production path because the project is TypeScript, the calculator has STALCRAFT-specific behavior, and solver models need integer scaling.

## Recommended Hybrid Solution

Use a deterministic exact hybrid:

1. Generate legal artifact candidate instances first.
2. Search separately for each container/backpack because capacity and protection change the answer.
3. Search with the selected result context because the Wiki result dropdown can change derived stats.
4. Store candidate stats in fast arrays for the search loop.
5. Remove safely dominated candidates for the active query.
6. Run exact branch-and-bound as the main search.
7. Use 3+3 meet-in-the-middle for capacity-6 searches when the candidate frontier is small enough.
8. Recalculate every returned build with the exact final calculator before showing it.
9. Compare branch-and-bound and meet-in-the-middle against brute force on small catalogs.

This gives us the right balance: exact results, deterministic behavior, and practical speed.

## Movement Speed and Running Speed

In STALCRAFT, users casually saying "movement speed" usually care about both:

- Movement speed
- Running speed

The default should be:

```text
movement score = Movement speed + Running speed
```

That is simple, transparent, and uses the same percentage-point units for both stats.

If someone asks specifically for "running speed" or "sprint speed," optimize only Running speed. If someone asks for combat movement, we can use a different preset later, such as mostly Movement speed with a smaller Running speed weight.

The final answer should always show both components, not only the combined score.

## How No-Damage Thresholds Work

"No environmental damage" means the final build result must stay under harmful limits such as:

```text
Radiation <= 0.5
Biological infection <= 0.5
Psy-emissions <= 0.5
Temperature <= 0.5
Frost <= 1.0
```

These checks must happen after the full build is calculated with the selected container/backpack. A single artifact with a bad harmful stat is not automatically invalid because another artifact may offset it.

The optimizer can prune early only when it is mathematically safe. For example, if the current partial build plus the best possible remaining reducers still cannot get under a harmful cap, that branch can be stopped. Otherwise it must keep searching.

## How Budget and Market Prices Fit In

The optimizer should use market prices as another hard constraint:

```text
sum artifact prices <= user budget
```

Rules:

- Container/backpack cost is excluded for now.
- Unknown price under strict budget is Infinity, never free.
- Duplicate artifacts can be priced as median price times quantity for MVP.
- If better listing data becomes available, duplicate cost should become the cost of buying the required number of copies.
- If prices are not quality-aware, the UI must say so.

Use weekly automatic market pulls by default, plus a manual admin refresh. Every result should show the market region, price snapshot date, price age, and whether prices are stale.

## Recommended Price Storage

Use SQLite first.

It is the best fit for a local/server MVP: one file, easy to back up, fast indexed lookups, and no database server to manage. Keep raw API response caching if useful, but store real weekly price snapshots in SQLite.

Store:

- every market pull attempt;
- raw auction history samples;
- computed per-artifact price snapshots;
- a latest-price table for fast optimization;
- sample count, median, min, p75/p90, snapshot time, stale time, and unknown reason.

Move to Postgres later if UltimateBuild becomes a multi-user hosted app with concurrent writes and many users.

## Final User Experience

A good answer should look like:

```text
Best movement build under 5,000,000, NA prices
Container: Berloga 6
Price snapshot: 2026-04-22, 3 days old
No-damage caps: passed

Movement score: 14.00
Movement speed: 5.95%
Running speed: 8.05%
Total price: 4,820,000

Artifacts:
1. ...
2. ...
```

It should also show harmful stats versus caps:

```text
Radiation: 0.45 / 0.50
Temperature: 0.18 / 0.50
Frost: 0.85 / 1.00
```

If prices are stale or not quality-aware, say that clearly beside the result.

## What Has To Be Built Next

1. Split artifact-panel calculation from final build/result-panel calculation.
2. Add a legal candidate-instance generator for quality, rarity, level, and additional-stat policy.
3. Add the movement composite objective to prompt parsing.
4. Upgrade the optimizer from raw artifacts to candidate instances.
5. Add safe skyline pruning and stronger branch-and-bound bounds.
6. Add meet-in-the-middle as a capacity-6 fast path and test oracle.
7. Add SQLite market snapshots and latest-price lookup.
8. Add brute-force verification tests for small catalogs.
9. Add benchmarks that report candidate counts, pruned counts, runtime, memory, and final verification count.

The key idea is simple: calculate every candidate exactly, prune only when the proof is safe, search deterministically, and verify final builds through the same calculator that matches the Wiki.

