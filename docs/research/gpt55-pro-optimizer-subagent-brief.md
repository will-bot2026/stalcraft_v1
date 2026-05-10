# UltimateBuild GPT-5.5 Pro Subagent Brief

## Mission

Analyze UltimateBuild's STALCRAFT artifact/container calculator and optimizer problem end-to-end. The goal is to recommend and, where useful, prototype the best exact/practical algorithms for producing the best build under user constraints, while matching STALCRAFT Wiki calculator math locally.

This is **not** a Cursed Rose task. Cursed Rose was only a controlled probe for reverse-engineering formulas. The final system must handle all artifacts, all legal quality/rarity/level/additional-stat combinations, duplicate artifacts, swappable containers/backpacks, harmful caps, derived stats, and market budget constraints.

## Primary inputs for the subagent

Read these first:

1. Formula/source-truth notes:
   - `docs/research/wiki-calculator-screenshot-parity.md`
2. Source-truth fixture JSON:
   - `data/wiki-fixtures/artifact-calculator-source-truth.json`
3. Existing calculator/data code:
   - `packages/stalcraft-data/src/index.ts`
   - `packages/stalcraft-optimizer/src/` if present
   - `packages/stalcraft-market/src/` if present
4. Tests:
   - `tests/*.test.ts`
5. EXBO repo clone:
   - `<local-stalcraft-database-path>`

## Non-negotiable correctness rules

1. Calculator parity beats optimizer cleverness. Wrong fast answers are useless.
2. Keep full precision internally. Round only for display and fixture comparison.
3. Artifact-panel values and Result-panel values are different layers:
   - Artifact panel: one artifact instance, no container protection, no multi-artifact sum.
   - Result panel: sum artifacts, apply container protection/effectiveness, calculate derived stats.
4. Quality and rarity are independent inputs at hard thresholds.
5. Legal rarity generation must obey threshold/carry rules:
   - 0-99: Ordinary
   - 100: Ordinary or Unordinary; 101-114: Unordinary
   - 115: Unordinary or Special; 116-129: Special
   - 130: Special or Rare; 131-144: Rare
   - 145: Rare or Exclusive; 146-159: Exclusive
   - 160: Exclusive or Legendary; 161-174: Legendary
   - 175: Legendary or Unique, if Unique is legal in this artifact context
6. Harmful stat caps must be enforced on unrounded final values, not display-rounded values.
7. Unknown/invalid market price under strict budget must be treated as `Infinity`, never free.
8. Duplicate artifacts are allowed; duplicate pricing is median price × quantity for MVP.
9. Container/backpack cost is excluded from budget.
10. Market API credentials are local/server-only and must never be exposed, logged, committed, or bundled.

## Confirmed calculator behavior from screenshots

### Positive base stats

Positive artifact stats scale linearly with quality and level:

```ts
positiveStat = strongestValue * (quality / 100) * (1 + 2 * level / 100)
```

Artifact-panel fixture examples for Cursed Rose:

```text
Level 0, Q100: Bullet 11.60, Explosion 8.90
Level 5, Q100: Bullet 12.76, Explosion 9.79
Level 10, Q100: Bullet 13.92, Explosion 10.68
```

### Selected additional stats

Selected additional stats materially change candidate stats and must be modeled on the artifact instance. For Cursed Rose L15 Q100 with selected:

```text
Bullet resistance
Explosion protection
Stamina regeneration
```

Observed:

```text
Bullet resistance     20.15
Explosion protection  15.47
Stamina regeneration   3.77%
```

Selected-stat total output scales linearly with quality:

```text
Q145: Bullet 29.22, Explosion 22.43, Stamina 5.47%
Q147: Bullet 29.62, Explosion 22.74, Stamina 5.54%
Q160: Bullet 32.24, Explosion 24.75, Stamina 6.03%
Q165: Bullet 33.25, Explosion 25.53, Stamina 6.22%
```

Working model:

```ts
totalSelectedPositive = q100SameLevelSelectedTotal * (quality / 100)
```

Equivalent decomposition:

```ts
total = (basePositiveAtQ100SameLevel + selectedAdditionalAtQ100SameLevel) * (quality / 100)
```

Open item: verify selected-additional contribution across levels and artifacts, not only Cursed Rose L15.

### Harmful / negative stats

Harmful stats do not use the positive quality/level formula. Cursed Rose radiation observations:

```text
Q100 Ordinary:    artifact Radiation 1.25
Q100 Unordinary:  artifact Radiation 1.13
Q130 Special:     artifact Radiation 1.25
Q130 Rare:        artifact Radiation 1.06
Q145 Rare:        artifact Radiation 1.25
Q145 Exclusive:   artifact Radiation 1.06
Q160 Exclusive:   artifact Radiation 1.25
Q160 Legendary:   artifact Radiation 1.06
Q147 Exclusive:   artifact Radiation 1.09
Q165 Legendary:   artifact Radiation 1.13
Q175 Legendary:   artifact Radiation 1.25
```

The exact harmful formula is still under investigation. Treat harmful calculations as separate from positive stats and fixture-test every derived rule.

### Result-panel harmful protection

For Berloga 6 protection `78.5%`, passthrough is:

```ts
harmfulPassthrough = 1 - 78.5 / 100 = 0.215
```

Confirmed Result-panel behavior:

```ts
finalHarmful = sum(artifactPanelHarmfulStats) * harmfulPassthrough
```

Use full precision, then round display.

Examples:

```text
Q130 Special artifact radiation 1.25 -> final Radiation 0.48
Q130 Rare artifact radiation 1.06 -> final Radiation 0.44
Q145 Rare artifact radiation 1.25 -> final Radiation 0.48
Q145 Exclusive artifact radiation 1.06 -> final Radiation 0.44
Q160 Exclusive artifact radiation 1.25 -> final Radiation 0.48
Q160 Legendary artifact radiation 1.06 -> final Radiation 0.44
```

## Current full-build test context

The current full-build fixture context:

```text
Container:
Berloga — 6 Container
capacity: 6
protection: 78.5%
effectiveness: 100%

Armor:
none selected

Artifacts:
1. Cycle +0 100%
2. Wicked Hedgehog +0 100%
3. Coil +0 100%
4. Static +0 100%
5. Snares +0 100%
6. Cursed Rose +15 100%
   selected additional stats:
   - Bullet resistance
   - Explosion protection
   - Stamina regeneration
```

Observed final visible baseline includes:

```text
Movement speed           2.40%
Running speed            3.25%
Stamina                 29.30%
Carry weight             4.70
Biological infection    -4.80
Psy-emissions           -1.28
Temperature              0.21
```

Additional Snares baseline clarification from the project owner:

```text
All artifacts in the current Snares probe build are level 0, quality 100, Unordinary rarity.
Cursed Rose is +0 in this baseline, not +15 as in the earlier Cursed Rose threshold tests.
```

Snares Q100/L0/Unordinary artifact panel:

```text
Movement speed            0.70%
Running speed             0.95%
Laceration protection    17.40
Biological infection      0.56   harmful positive accumulation
Psy-emissions            -1.28   beneficial reduction, shown green
```

Result category note: the visible dropdown is `Reactions to Anomalies`; `Reaction to laceration` is a final stat inside that category and should be exposed as a possible objective/result stat.

New result-selection finding: when `Reaction to laceration` is selected in the result dropdown/filter, the panel shows additional/changed derived stats:

```text
Effective health:       122.80   vs 121.70 in base Reactions to Anomalies
Vitality:                 0.90%   newly visible
Stamina regeneration:     0.90%   newly visible
Reaction to laceration:   0.90%
```

Therefore the result dropdown/filter should be modeled as a selectable reaction/outcome context, not only a visual filter. Natural-language prompts may target either the final stat (`reaction_to_laceration`) or a selected reaction context.

Snares Q100/L0 Ordinary vs Unordinary changed `Biological infection` but did not change positives or Psy-emissions:

```text
Ordinary biological:   artifact 0.63 -> final -4.74
Unordinary biological: artifact 0.56 -> final -4.80
```

This biological delta does not follow the same `delta * Berloga passthrough` pattern seen for Cursed Rose Radiation, so the optimizer/calculator should treat harmful stat families separately until fixture-proven.

Snares Q115/L0/Unordinary quality probe:

```text
Movement speed           0.80%
Running speed            1.09%
Laceration protection   20.01
Biological infection     0.63
Psy-emissions           -1.47
```

Snares Q115/L0/Special threshold counterpart:

```text
Movement speed           0.80%
Running speed            1.09%
Laceration protection   20.01
Biological infection     0.53
Psy-emissions           -1.47
```

Q115 Result panel with `Reaction to laceration` selected:

```text
Unordinary final Biological infection: -4.74
Special final Biological infection:    -4.83
Other visible final stats unchanged.
```

This confirmed another precision rule: do not use rounded displayed Q100 values as formula bases. Example: displayed `0.70 * 1.15 = 0.805`, which would round to `0.81`, but Wiki shows `0.80`; therefore the hidden Q100 movement base is slightly below displayed `0.70` (about `0.69565` if Q115 display is treated as exact). Same issue appears for Biological infection (`0.56 * 1.15` would show `0.64`, but Wiki shows `0.63`). Candidate generation must use raw source/full-precision bases or fitted hidden bases, not displayed fixture values.

Biological threshold behavior is structurally like Cursed Rose radiation (second rarity improves the harmful stat), but final-result math differs from radiation: artifact biological delta `0.10` produced displayed final improvement about `0.09`, not `0.10 * 0.215`.

Upcoming screenshots will use Snares to probe Psy-emissions.

## Optimization problem definition

Given:

- user natural-language prompt converted into objective weights/constraints;
- container/backpack selection or allowed container set;
- artifact catalog;
- legal quality ranges;
- legal rarity/quality threshold/carry rules;
- level constraints;
- selected/optimized additional stat policy;
- harmful final caps;
- market budget constraints;
- duplicate artifact policy;

find the best build(s):

```text
maximize weighted objective score
subject to:
  artifact count <= container capacity
  legal artifact instances
  final harmful stats <= caps
  total artifact cost <= budget, if budget provided
  other user constraints
```

Default harmful caps:

```json
{
  "radiation": 0.5,
  "biological": 0.5,
  "psy": 0.5,
  "temperature": 0.5,
  "frost": 1
}
```


## April 2026 live formula coverage update

Additional live STALCRAFT Wiki source truth was collected after the original brief. Read these before algorithm work:

1. `docs/research/live-current-build-q130-q160-sweep.md`
   - Current-build broad sweep: Static, Wicked Hedgehog, Chilly, Cycle, Snares, Cursed Rose.
   - 24 scenarios: Q130 Special/Rare + Q160 Exclusive/Legendary.
2. `docs/research/live-q130-q160-missing-trait-sweep.md`
   - Coil closure plus minimal missing display-trait coverage.
   - Additional live artifacts: Coil, Polyhedron, Mirror, Eye of the Storm, Magma, Fossil, Bismuth, Acid Crystal, Inside Out Rose, Spectral Crystal, Tiny key, Leech, Whirlwind.

### Live source-truth coverage now includes these artifact-panel display stat families

```text
Bioinfection protection
Biological infection
Bleeding
Bleeding protection
Bullet resistance
Burning
Carry weight
Charge required to activate
Explosion protection
Frost
Healing effectiveness
Health regeneration
Laceration protection
Movement speed
Periodic healing
Psy-emission protection
Psy-emissions
Radiation
Radiation protection
Reaction to burns
Reaction to chemical burns
Reaction to electricity
Reaction to laceration
Recoil
Reduces damage by
Reload
Resistance to electricity
Resistance to fire
Running speed
Stability
Stamina
Stamina regeneration
Sway
Temperature
Thermal protection
Triggers when
Vitality
```

### Formula rules supported by the live sweeps

For normal displayed artifact-panel stats at level 0:

```ts
if (stat.isPositive) {
  // beneficial positive: e.g. Bullet resistance, Movement speed, Carry weight
  // beneficial negative: e.g. Recoil, Sway, negative Temperature reduction
  artifactValue = moreBeneficialEndpoint(stat.min, stat.max) * quality / 100;
} else {
  // harmful / downside threshold stats do not quality-scale at exact threshold pairs
  artifactValue = rarityEndpoint(stat.min, stat.max, rarity);
}
```

Rarity endpoint behavior at tested thresholds:

```text
Q130 Special and Q160 Exclusive => worse downside endpoint
Q130 Rare and Q160 Legendary   => better downside endpoint
```

Examples:

```text
Coil Temperature: Q130 Special 2.50, Q130 Rare 2.13, Q160 Exclusive 2.50, Q160 Legendary 2.13
Tiny key Bleeding protection: Q130 Special -18.80%, Q130 Rare -15.98%, Q160 Exclusive -18.80%, Q160 Legendary -15.98%
Acid Crystal Vitality: Q130 Special -8.00%, Q130 Rare -6.80%, Q160 Exclusive -8.00%, Q160 Legendary -6.80%
```

Result-panel harmful stats under Berloga 6 continue to obey:

```ts
finalHarmful = sum(artifactPanelHarmfulStats) * (1 - 78.5 / 100)
```

Use exact unrounded values internally and round only for display.

### Known special handling / open calculator notes

- Rubik was attempted in the live missing-trait sweep, but in the tested baseline the Wiki Artifact panel showed no visible rows. Do not treat Rubik as formula proof until its UI/state requirements are understood.
- Polyhedron has special/mechanic rows: `Triggers when`, `Reduces damage by`, `Reload`, `Charge required to activate`. These are source-truthed in `live-q130-q160-missing-trait-sweep.md`, but should be modeled separately from always-on build stats unless product requirements say to optimize triggered effects.
- Selected additional stats remain a separate dimension. Earlier Cursed Rose selected-stat tests confirm selected positives scale with quality, but legal additional-stat selection/unlocking still needs its own exact model before `optimize-unlocked` becomes default.

### Optimizer performance direction

The optimizer subagent should not brute-force raw artifacts directly. It should:

1. Precompute legal `ArtifactCandidateInstance` values with exact artifact-panel stats and price.
2. Partition search by container/backpack because harmful caps depend on protection/effectiveness.
3. Convert harmful final caps into per-container raw harmful budgets before DFS/meet-in-the-middle.
4. Apply safe per-slot candidate dominance pruning for the active objective/constraints.
5. Use meet-in-the-middle over 3+3 slots or branch-and-bound DFS for capacity-6 exact search.
6. Return top-K/Pareto alternatives, then independently re-evaluate final stats with the exact calculator before displaying.
7. Benchmark against brute force on tiny fixture catalogs before trusting pruning.

## Candidate instance model

Optimizer should search over calculated candidate instances, not raw artifacts:

```ts
type ArtifactCandidateInstance = {
  artifactId: string;
  artifactName: string;
  level: number;
  quality: number;
  rarity: ArtifactRarity;
  selectedAdditionalStatKeys: string[];
  calculatedArtifactPanelStats: Record<StatKey, number>;
  price: number; // Infinity if unknown under strict budget
};
```

Additional-stat policy:

```ts
type AdditionalStatPolicy =
  | 'none'
  | 'explicit-only'
  | 'optimize-unlocked';
```

Recommended default now:

- `explicit-only` for manual UI builds;
- `none` for formula parity tests where additional stats are not selected;
- `optimize-unlocked` only after legal additional-stat slots/options are known and tested.

## Algorithm research questions for GPT-5.5 Pro

Find the best practical algorithm(s), not just textbook brute force.

### 1. Candidate generation

- How many candidate instances are produced under realistic ranges?
- Should quality be continuous integer 0-175, or only market-observed qualities, or user-constrained bands?
- How to encode exact-threshold dual rarity choices efficiently?
- How to avoid generating illegal additional-stat combinations?

### 2. Dominance pruning

Design safe dominance rules for multi-objective constrained search.

A candidate A can dominate B only if, for the active query:

- A is >= B on all desired objective stats;
- A is <= B on all harmful capped stats;
- A is <= B in price when budget applies;
- A is not worse on any mandatory constraint dimension;
- A is strictly better in at least one dimension.

Need care: an artifact worse alone may become useful in combination if it has complementary harmful stats or price.

### 3. Exact search for small/medium candidate sets

Evaluate:

- combinations with replacement, capacity 6;
- branch-and-bound sorted by objective upper bound;
- recursive DFS with incremental final stat/harmful/budget pruning;
- top-K beam with exact verification fallback;
- meet-in-the-middle: split capacity 6 into 3+3, build Pareto frontiers, join frontiers;
- integer programming / CP-SAT feasibility if a solver dependency is acceptable locally.

### 4. Multi-objective handling

The user may ask for:

```text
maximize movement speed
maximize running speed while keeping radiation under 0.5
maximize carry weight and vitality under 5 million
```

Need strategy for:

- weighted scalar objective;
- lexicographic objectives;
- hard minimum/maximum constraints;
- returning Pareto frontier/top-N alternatives, not only one result.

### 5. Harmful caps and protections

Search should prune as early as possible, but final harmful values depend on container protection. For each container candidate:

```ts
rawHarmfulSum = sum(artifact harmful)
finalHarmful = rawHarmfulSum * (1 - protection / 100)
```

Need decide whether to:

- search per-container separately;
- normalize harmful caps into artifact-panel raw caps per container first;
- precompute candidate harmful vectors.

### 6. Price/budget integration

- Budget excludes container/backpack cost.
- Unknown price = Infinity under strict budget.
- Duplicate pricing = median × quantity for MVP.
- Need pruning by cumulative lower-bound price.

### 7. Performance benchmark design

Recommend scripts/tests that measure:

- candidate count by settings;
- pruned candidate count;
- time to first valid build;
- time to exact best build;
- top-K generation time;
- memory usage;
- correctness against brute force on small subsets.

### 8. Verification strategy

Every algorithmic shortcut must be validated against:

- screenshot formula fixtures;
- brute-force exhaustive search on tiny fixture catalogs;
- property tests for dominance/pruning safety;
- known CLI smoke prompts.

## Expected subagent deliverables

1. Written algorithm recommendation with tradeoffs.
2. Concrete implementation plan for UltimateBuild.
3. Optional prototype scripts in `scripts/optimizer-experiments/`.
4. Benchmark design and expected thresholds.
5. List of calculator gaps still blocking fully exact optimization.
6. Suggested tests to prove exactness.

## Suggested subagent prompt

```text
You are GPT-5.5 Pro working as an optimization/calculator research agent for UltimateBuild, a local STALCRAFT artifact build optimizer. Read docs/research/wiki-calculator-screenshot-parity.md and data/wiki-fixtures/artifact-calculator-source-truth.json first. Then inspect the TypeScript calculator/optimizer code and tests. Your task is to recommend the best exact/practical algorithmic approach for searching all legal artifact/container combinations under objectives, harmful caps, budget constraints, duplicate artifacts, quality/rarity/level variants, and selected additional stats. You may write prototype scripts under scripts/optimizer-experiments/ if useful. Do not expose credentials. Preserve calculator parity. Produce a report at docs/research/optimizer-algorithm-recommendation.md and include verification/benchmark plans.
```
