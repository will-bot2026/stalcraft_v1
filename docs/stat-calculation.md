# STALCRAFT stat calculation notes

This document summarizes the calculation rules currently source-truthed against the live STALCRAFT Wiki calculator and local fixtures. Keep full precision internally and round only at display or fixture-comparison boundaries.

## Source-truth inputs

Primary reference files:

- `data/wiki-fixtures/artifact-calculator-source-truth.json`
- `docs/research/wiki-calculator-screenshot-parity.md`
- `docs/research/calculation-updates-running-log.md`
- `docs/research/live-current-build-q130-q160-sweep.md`
- `docs/research/live-q130-q160-missing-trait-sweep.md`

Most recent live sweeps used this controlled context:

```text
STALCRAFT Wiki calculator version: 4.4.2 where visible
Container: Berloga 6
Armor: none
Result panel context: Reaction to laceration
Varied: one artifact at a time
Baseline: non-varied artifacts reset to +0, Q100, Unordinary
```

## Quality, level, and positive stats

Normal positive/beneficial artifact stats scale linearly from the more-beneficial endpoint:

```ts
artifactValue = beneficialEndpoint * (quality / 100) * (1 + 2 * level / 100);
```

At level 0 this is simply:

```ts
artifactValue = beneficialEndpoint * (quality / 100);
```

This applies to standard positive stats such as:

```text
Bullet resistance
Explosion protection
Laceration protection
Movement speed
Running speed
Carry weight
Resistance to fire
Stamina
Vitality
Stamina regeneration
Health regeneration
Healing effectiveness when beneficial
Protection/resistance families
Reaction families
```

It also applies to beneficial negative values where the UI displays a negative number but the value is good, such as:

```text
Recoil reduction
Sway reduction
negative Temperature reduction
negative Radiation/Psy/Biological reductions when marked beneficial
```

Examples from live Q130/Q160 source truth:

```text
Coil Q130: Movement 1.56%, Running 2.08%, Carry 6.11, Resistance to fire 21.06
Coil Q160: Movement 1.92%, Running 2.56%, Carry 7.52, Resistance to fire 25.92
Tiny key Q130: Recoil -5.72%, Sway -7.93%
Tiny key Q160: Recoil -7.04%, Sway -9.76%
Whirlwind Q130: Temperature -0.25, Reaction to burns 1.43%
Whirlwind Q160: Temperature -0.31, Reaction to burns 1.76%
```

## Rarity thresholds

Exact threshold qualities can legally carry either adjacent rarity:

```text
0-99    Ordinary
100     Ordinary or Unordinary
101-114 Unordinary
115     Unordinary or Special
116-129 Special
130     Special or Rare
131-144 Rare
145     Rare or Exclusive
146-159 Exclusive
160     Exclusive or Legendary
161-174 Legendary
175     Legendary or Unique, where legal
```

Positive/beneficial stats do not change between the two legal rarities at the same quality. Harmful/downside endpoint stats can change.

Explicit quality inputs may be decimal percentages. Between exact thresholds, harmful/downside stats interpolate from the selected rarity band's improved endpoint back toward the worse endpoint using the actual quality value, not a rounded quality bucket. Example: a `0.85..1.00` harmful stat at Q124.5 Special is `0.945`, not `0.85` or `1.00`.

When a prompt names an exact rarity without an explicit quality, the web optimizer now evaluates every integer quality in that rarity's API `qlt`/`ptn` bracket (for example Special Q115..Q130) instead of collapsing the whole category to one endpoint. That keeps harmful stats tied to the artifact candidate's actual quality percentage.

## Harmful/downside endpoint behavior

For normal harmful/downside stats at exact threshold pairs, the value is chosen by rarity endpoint and does **not** quality-scale.

Observed threshold behavior:

```text
Q130 Special   => worse downside endpoint
Q130 Rare      => better downside endpoint
Q160 Exclusive => worse downside endpoint
Q160 Legendary => better downside endpoint
```

Examples:

```text
Coil Temperature:
  Q130 Special   2.50
  Q130 Rare      2.13
  Q160 Exclusive 2.50
  Q160 Legendary 2.13

Chilly Burning:
  Q100 Unordinary -0.40
  Treat as an accumulation-family reducer: do not amplify it with container effectiveness and do not apply Berloga-style container protection to this beneficial negative value.

Snares Biological infection:
  Q130 Special   0.63
  Q130 Rare      0.53
  Q160 Exclusive 0.63
  Q160 Legendary 0.53

Cursed Rose Radiation:
  Q130 Special   1.25
  Q130 Rare      1.06
  Q160 Exclusive 1.25
  Q160 Legendary 1.06

Chilly Frost:
  Q130 Special   1.00
  Q130 Rare      0.85
  Q160 Exclusive 1.00
  Q160 Legendary 0.85
```

## Result-panel aggregation

Artifact panel and Result panel are different calculation layers.

- Artifact panel: one artifact instance, after quality/rarity/level/additional-stat calculations.
- Result panel: aggregate artifacts, apply container/armor/protection/effectiveness behavior, then calculate derived stats and context-specific stats.

For Berloga 6 harmful passthrough where confirmed:

```ts
harmfulPassthrough = 1 - 78.5 / 100; // 0.215
finalHarmful = sumArtifactHarmful * harmfulPassthrough;
```

Confirmed for radiation/temperature-style harmful loads in the Berloga 6 context. Biological infection has shown family-specific behavior in earlier Snares probes, so do not assume every harmful family uses the same passthrough until explicitly verified.

## Result context matters

The Wiki Result dropdown changes visible and derived stats. Treat it as an explicit calculation input, not merely a UI filter.

Known relevant contexts include:

```text
Reactions to Anomalies
Reaction to laceration
```

With `Reaction to laceration` selected, additional final stats such as Vitality, Stamina regeneration, and Reaction to laceration become visible and must be optimizer-visible.

## Selected additional stats

Selected additional stats are part of an artifact instance. They should be modeled separately from base stats.

Working rule from Cursed Rose selected-stat fixtures:

```ts
totalSelectedPositive = q100SameLevelSelectedTotal * (quality / 100)
```

Equivalent decomposition:

```ts
total = (basePositiveAtQ100SameLevel + selectedAdditionalAtQ100SameLevel) * (quality / 100)
```

Open work: exact legal unlocking/selection rules for all artifact additional stat slots. Until that is complete, optimizer modes should distinguish:

```ts
type AdditionalStatPolicy = 'none' | 'explicit-only' | 'optimize-unlocked';
```

Recommended current default:

- `none` for clean formula parity tests without selected stats.
- `explicit-only` for manual builds copied from the Wiki UI.
- `optimize-unlocked` only after all additional-stat legality is modeled and tested.

Current blocker: `docs/research/optimize-unlocked-source-truth-blocker.md` records the missing source truth for slot unlock/exclusivity rules. Until that evidence exists, `optimize-unlocked` must remain disabled.

## Special mechanic stats

Polyhedron has live source-truthed mechanic rows:

```text
Triggers when
Reduces damage by
Reload
Charge required to activate
```

These should be represented separately from always-on aggregate build stats unless a query explicitly asks to optimize triggered/mechanic behavior.

## Coverage from latest live sweeps

The latest source-truth sweeps now cover these displayed artifact stat families:

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

## Optimizer implication

The optimizer should search precomputed legal candidate instances, not raw artifact definitions:

```ts
type ArtifactCandidateInstance = {
  artifactId: string;
  artifactName: string;
  level: number;
  quality: number;
  rarity: ArtifactRarity;
  selectedAdditionalStatKeys: string[];
  calculatedArtifactPanelStats: Record<StatKey, number>;
  price: number; // Infinity when unknown under strict budget
};
```

Recommended fast/exact search plan:

1. Generate legal candidate instances with exact artifact-panel stats.
2. Partition search by container/backpack because harmful caps depend on protection/effectiveness.
3. Convert final harmful caps into raw per-container harmful budgets before search.
4. Apply safe dominance pruning only relative to the active query objective and hard constraints.
5. Use branch-and-bound DFS or 3+3 meet-in-the-middle for capacity-6 exact search.
6. Return top-K/Pareto alternatives.
7. Re-evaluate every returned build through the exact final calculator before displaying it.
8. Benchmark pruning against brute force on small fixture catalogs before trusting it.
