# STALCRAFT Wiki Calculator Formula Notes

This is the single source of truth for manually observed Wiki calculator behavior that UltimateBuild must reproduce. It is intentionally fixture-oriented so a subagent can turn each observation into tests before changing calculator or optimizer code.

## Purpose

UltimateBuild must be able to calculate any artifact/container build locally, with the same variables the Wiki/game calculator uses:

- artifact identity
- artifact level
- artifact quality
- artifact rarity
- selected additional stats
- container/backpack capacity, protection, effectiveness
- harmful-stat limits
- budget/market constraints
- optimizer objective weights

These screenshots are not about optimizing Cursed Rose specifically. Cursed Rose is just a controlled probe artifact for deriving formula behavior.

## Complexity note

The build-search problem is a combinatorial optimization problem. With duplicate artifacts, swappable containers, multiple objective terms, harmful caps, budget caps, quality/rarity/level variants, and selectable additional stats, the search space grows rapidly. This is in the family of NP-style combinatorial problems; exact brute force can become impractical as variables expand.

Practical implication for UltimateBuild:

1. Keep calculator math exact and deterministic.
2. Generate artifact candidate instances from all relevant variables.
3. Prune aggressively before search.
4. Use branch-and-bound / Pareto dominance / meet-in-the-middle / dynamic programming-style frontiers where applicable.
5. Preserve proof fixtures so solver shortcuts cannot silently change correctness.

A dedicated GPT-5.5 Pro subagent brief now exists at:

`docs/research/gpt55-pro-optimizer-subagent-brief.md`

That brief consolidates the formula findings, source-truth fixture paths, optimization problem definition, algorithm research questions, and expected deliverables for the later algorithm-design agent.

## Artifact-panel vs Result-panel distinction

All screenshots captured here are **Artifact panel** values unless stated otherwise.

Artifact panel means:

1. calculate one artifact's displayed stats from level/quality/rarity/additional stat selections;
2. do **not** apply container protection;
3. do **not** sum multiple artifacts;
4. do **not** enforce final build harmful caps yet.

Final build / Result panel must later:

1. calculate every selected artifact instance;
2. sum selected artifacts;
3. apply container protection to protected harmful stats;
4. enforce harmful caps;
5. calculate final derived stats and budget.

## Captured fixtures

### Cursed Rose, quality 100, unordinary, level progression

| Screenshot | Level | Quality | Rarity | Additional stats | Bullet resistance | Explosion protection | Radiation | Stamina regeneration |
|---|---:|---:|---|---|---:|---:|---:|---:|
| `img_1a60fd8c341a.jpg` | 0 | 100 | Unordinary | none | 11.60 | 8.90 | 1.13 | — |
| `img_f87b8fe89398.jpg` | 5 | 100 | Unordinary | none | 12.76 | 9.79 | 1.13 | — |
| `img_3571952a35c6.jpg` | 10 | 100 | Unordinary | none | 13.92 | 10.68 | 1.13 | — |
| `img_380bffcb78bc.jpg` | 15 | 100 | Unordinary | Bullet resistance, Explosion protection, Stamina regeneration | 20.15 | 15.47 | 1.13 | 3.77% |

Formula evidence from level progression:

```ts
positiveBaseStatAtQuality100 = base * (1 + 2 * level / 100)
```

Observed:

```text
Bullet resistance:
11.60 * 1.10 = 12.76
11.60 * 1.20 = 13.92

Explosion protection:
8.90 * 1.10 = 9.79
8.90 * 1.20 = 10.68
```

Radiation remains constant at `1.13` across these level changes in the Artifact panel. Do not apply the positive level multiplier blindly to harmful/negative stats.

The level 15 / Q100 screenshot includes selected additional stats. Base-only expected level 15 positive values would be:

```text
Bullet resistance:    11.60 * 1.30 = 15.08
Explosion protection:  8.90 * 1.30 = 11.57
```

Observed with selected additional stats:

```text
Bullet resistance:    20.15
Explosion protection: 15.47
Stamina regeneration: 3.77%
```

So additional stats materially change the artifact candidate and must be modeled explicitly. At Q100/L15 the selected additional-stat contribution appears to be:

```text
Bullet resistance additional:     20.15 - 15.08 = 5.07
Explosion protection additional:  15.47 - 11.57 = 3.90
Stamina regeneration additional:  3.77%
```

The level-15 quality progression below shows that the *total selected-additional-stat output* scales linearly with quality.

### Cursed Rose, level 0, quality/rarity progression

| Screenshot | Level | Quality | Rarity shown | Additional stats | Bullet resistance | Explosion protection | Radiation |
|---|---:|---:|---|---|---:|---:|---:|
| `img_2c8e510a4252.jpg` | 0 | 100 | Ordinary | none | 11.60 | 8.90 | 1.25 |
| `img_1a60fd8c341a.jpg` | 0 | 100 | Unordinary | none | 11.60 | 8.90 | 1.13 |
| `img_c9a0f740dca4.jpg` | 0 | 115 | Unordinary | none | 13.34 | 10.23 | 1.25 |
| `img_d68d5f528fb9.jpg` | 0 | 130 | Special | none | 15.08 | 11.57 | 1.25 |
| `img_69b3f83fc8bc.jpg` | 0 | 145 | Rare | none | 16.82 | 12.90 | 1.25 |
| `img_f7e777dded29.jpg` | 0 | 160 | Exclusive | none | 18.56 | 14.24 | 1.25 |
| `img_b65a8a9dc271.jpg` | 0 | 175 | Legendary | none | 20.30 | 15.58 | 1.25 |

Quality-scaling evidence for positive stats at level 0:

```text
Bullet resistance:
11.60 * 1.15 = 13.34
11.60 * 1.30 = 15.08
11.60 * 1.45 = 16.82
11.60 * 1.60 = 18.56
11.60 * 1.75 = 20.30

Explosion protection:
8.90 * 1.15 = 10.235 -> displayed 10.23/10.24 depending Wiki rounding/truncation
8.90 * 1.30 = 11.57
8.90 * 1.45 = 12.905 -> displayed 12.90/12.91 depending Wiki rounding/truncation
8.90 * 1.60 = 14.24
8.90 * 1.75 = 15.575 -> displayed 15.58
```

Working formula for positive base stats:

```ts
positiveStat = baseMax * (quality / 100) * (1 + 2 * level / 100)
```

At level 0 this reduces to:

```ts
positiveStat = baseMax * (quality / 100)
```

Radiation behavior is different and depends on rarity/quality selection independently from positive stats:

```text
Q100 Ordinary:    1.25
Q100 Unordinary:  1.13
Q115 Unordinary:  1.25
Q130 Special:     1.25
Q145 Rare:        1.25
Q160 Exclusive:   1.25
Q175 Legendary:   1.25
```

Important: the two Q100 screenshots prove `rarity` is not just a display color. At the same `quality=100`, changing rarity from Ordinary to Unordinary leaves positive stats unchanged but changes Radiation from `1.25` to `1.13`. UltimateBuild must model `quality` and `rarity` as independent inputs/constraints, especially for harmful stats.

This suggests harmful/negative stat calculation is rarity/quality-band based and not simply `Q / 100` from the displayed Q100 value. Existing reverse-engineered negative-stat formula remains the candidate implementation, but it must be checked against these fixtures.

### Cursed Rose, level 15, quality/rarity progression with selected additional stats

All screenshots in this set use selected additional stats:

```text
Bullet resistance
Explosion protection
Stamina regeneration
```

| Screenshot | Level | Quality | Rarity shown | Additional stats | Bullet resistance | Explosion protection | Radiation | Stamina regeneration |
|---|---:|---:|---|---|---:|---:|---:|---:|
| `img_380bffcb78bc.jpg` | 15 | 100 | Unordinary | Bullet resistance, Explosion protection, Stamina regeneration | 20.15 | 15.47 | 1.13 | 3.77% |
| `img_25cd934b07da.jpg` | 15 | 115 | Unordinary | Bullet resistance, Explosion protection, Stamina regeneration | 23.17 | 17.79 | 1.25 | 4.34% |
| `img_591ef752e654.jpg` | 15 | 130 | Special | Bullet resistance, Explosion protection, Stamina regeneration | 26.20 | 20.11 | 1.25 | 4.90% |
| `img_e98d3e29d3d4.jpg` | 15 | 130 | Special | Bullet resistance, Explosion protection, Stamina regeneration | 26.20 | 20.11 | 1.25 | 4.90% |
| `img_eec789d8469e.jpg` | 15 | 130 | Rare | Bullet resistance, Explosion protection, Stamina regeneration | 26.20 | 20.11 | 1.06 | 4.90% |
| `img_7075c21a7277.jpg` | 15 | 145 | Rare | Bullet resistance, Explosion protection, Stamina regeneration | 29.22 | 22.43 | 1.25 | 5.47% |
| `img_a520c90c4e5f.jpg` | 15 | 160 | Exclusive | Bullet resistance, Explosion protection, Stamina regeneration | 32.24 | 24.75 | 1.25 | 6.03% |
| `img_6fa75aa111d9.jpg` | 15 | 147 | Exclusive | Bullet resistance, Explosion protection, Stamina regeneration | 29.62 | 22.74 | 1.09 | 5.54% |
| `img_ca21dcf9af1d.jpg` | 15 | 165 | Legendary | Bullet resistance, Explosion protection, Stamina regeneration | 33.25 | 25.53 | 1.13 | 6.22% |
| `img_5b8779cecda2.jpg` | 15 | 175 | Legendary | Bullet resistance, Explosion protection, Stamina regeneration | 35.26 | 27.07 | 1.25 | 6.60% |

This confirms that the selected-additional-stat artifact-panel totals scale almost exactly linearly by quality from the Q100/L15 selected-stat fixture:

```text
Bullet resistance:
20.15 * 1.15 = 23.1725 -> 23.17
20.15 * 1.30 = 26.1950 -> 26.20
20.15 * 1.45 = 29.2175 -> 29.22
20.15 * 1.47 = 29.6205 -> 29.62
20.15 * 1.60 = 32.24
20.15 * 1.65 = 33.2475 -> 33.25
20.15 * 1.75 = 35.2625 -> 35.26

Explosion protection:
15.47 * 1.15 = 17.7905 -> 17.79
15.47 * 1.30 = 20.1110 -> 20.11
15.47 * 1.45 = 22.4315 -> 22.43
15.47 * 1.47 = 22.7409 -> 22.74
15.47 * 1.60 = 24.752 -> 24.75
15.47 * 1.65 = 25.5255 -> 25.53
15.47 * 1.75 = 27.0725 -> 27.07

Stamina regeneration:
3.77 * 1.15 = 4.3355 -> 4.34%
3.77 * 1.30 = 4.9010 -> 4.90%
3.77 * 1.45 = 5.4665 -> 5.47%
3.77 * 1.47 = 5.5419 -> 5.54%
3.77 * 1.60 = 6.032 -> 6.03%
3.77 * 1.65 = 6.2205 -> 6.22%
3.77 * 1.75 = 6.5975 -> 6.60%
```

Working formula for this fixture family:

```ts
selectedAdditionalArtifactPanelStat = selectedStatTotalAtQuality100AndSameLevel * (quality / 100)
```

Equivalent decomposition for positive stats, where `basePositiveAtQ100L15` is the no-additional-stat output at Q100/L15 and `additionalAtQ100L15` is the selected additional-stat contribution:

```ts
total = (basePositiveAtQ100L15 + additionalAtQ100L15) * (quality / 100)
```

For Cursed Rose L15 selected stats:

```text
Bullet total Q100/L15 = 15.08 base + 5.07 selected-additional = 20.15
Explosion total Q100/L15 = 11.57 base + 3.90 selected-additional = 15.47
Stamina total Q100/L15 = 3.77 selected-additional
```

Open item: screenshots do not yet isolate whether the selected additional-stat contribution itself scales with level the same way as base positives. Current safe implementation path is fixture-driven: treat selected additional stats as part of a calculated artifact instance and validate with level/quality fixtures before optimizing over them.

### Prediction fixture to verify — Cursed Rose level 15 quality 165

Assumption for the project owner's upcoming check:

```text
Artifact: Cursed Rose
Level: 15
Quality: 165
Rarity: Exclusive
Selected additional stats: Bullet resistance, Explosion protection, Stamina regeneration
Panel: Artifact
```

Using the observed linear quality scaling from Q100/L15 selected-stat totals:

```text
Bullet resistance:     20.15 * 1.65 = 33.2475 -> 33.25
Explosion protection:  15.47 * 1.65 = 25.5255 -> 25.53
Stamina regeneration:   3.77 * 1.65 =  6.2205 -> 6.22%
Radiation: expected 1.25, based on high-quality plateau fixtures
```

Actual Q165 screenshot result:

```text
Bullet resistance:     33.25  ✅ matched
Explosion protection:  25.53  ✅ matched
Stamina regeneration:   6.22% ✅ matched
Radiation:              1.13  ❌ prediction was 1.25
```

Rounding conclusion: the positive selected-stat values matched the unrounded linear calculation exactly after normal two-decimal display rounding. Do **not** round candidate stats early during optimization; keep full-precision numbers internally and round only for display or screenshot fixture comparisons.

Radiation conclusion: harmful/negative stats are more subtle than the earlier plateau guess. `quality=165` with `rarity=Legendary` shows `1.13`, while `quality=175` with `rarity=Legendary` shows `1.25`. This reinforces that harmful stat calculation must be fixture-tested separately from positive scaling and must not use the positive quality formula or a simple plateau shortcut.
```

Cross-check by interpolation between Q160 and Q175:

```text
Bullet:   32.24 + (35.26 - 32.24) * (5 / 15) = 33.2466 -> 33.25
Explosion: 24.75 + (27.07 - 24.75) * (5 / 15) = 25.5233 -> 25.52/25.53 depending Wiki rounding source precision
Stamina:   6.03 + (6.60 - 6.03) * (5 / 15) = 6.22%
```

Predicted display for the screenshot check:

```text
Bullet resistance:     33.25
Explosion protection:  25.53
Radiation:              1.25
Stamina regeneration:   6.22%
```

## Rarity threshold rule from the project owner

Hard quality caps have two rarity choices. In-between qualities use the second rarity from the previous cap until the next cap.

| Quality cap | Available rarities at exact cap | In-between rarity after cap |
|---:|---|---|
| 0-99 | Ordinary only | Ordinary |
| 100 | Ordinary, Unordinary | Unordinary for 101-114 |
| 115 | Unordinary, Special | Special for 116-129 |
| 130 | Special, Rare | Rare for 131-144 |
| 145 | Rare, Exclusive | Exclusive for 146-159 |
| 160 | Exclusive, Legendary | Legendary for 161-174 |
| 175 | Legendary, Unique | Unique after 175 if the UI/game allows above-cap quality |

Examples from the project owner:

```text
105 -> Unordinary
132 -> Rare
162 -> Legendary
```

Implementation requirement: quality and rarity are independent inputs at hard caps, and the legal-rarity generator must emit both choices at caps. For in-between quality values, only the carried second rarity is legal.

Source-truth fixture JSON now exists at:

`data/wiki-fixtures/artifact-calculator-source-truth.json`

## Full-build Result-panel source-truth context

the project owner clarified the current threshold test uses this full build, not Cursed Rose alone:

- Container: `Berloga — 6 Container` / normal Berloga 6 (`g35n`)
  - capacity: `6`
  - protection: `78.5%`
  - effectiveness: `100%`
- Armor: none selected
- Artifacts:
  1. Cycle `+0 100%`
  2. Wicked Hedgehog `+0 100%`
  3. Coil `+0 100%`
  4. Static `+0 100%`
  5. Snares `+0 100%`
  6. Cursed Rose `+15 100%`, selected additional stats: Bullet resistance, Explosion protection, Stamina regeneration

Source screenshot: `img_590b038cf9c1.jpg`.

### Result-panel fixtures for Q100 Cursed Rose rarity swap

Both Result screenshots use selected result category `Reactions to Anomalies`.

| Cursed Rose rarity | Source screenshot | Final Radiation | Other final stats |
|---|---|---:|---|
| Ordinary | `img_1069fcf15d25.jpg` | 0.48 | unchanged vs Unordinary screenshot |
| Unordinary | `img_7a7ef37009cf.jpg` | 0.45 | unchanged vs Ordinary screenshot |
| Q130 Special | `img_0084e733a1f7.jpg` | 0.48 | Bullet/explosion/stamina/effective health changed from Q100 as expected |

The displayed final stats for the Unordinary result screenshot are:

| Stat | Value |
|---|---:|
| Effective health | 130.25 |
| Healing per second | 0.50% |
| Recoil | -3.70% |
| Bleeding | -0.70 |
| Bullet resistance | 30.25 |
| Movement speed | 2.40% |
| Running speed | 3.25% |
| Stamina | 29.30% |
| Stamina regeneration | 3.77% |
| Carry weight | 4.70 |
| Laceration protection | 17.40 |
| Explosion protection | 15.47 |
| Resistance to fire | 16.20 |
| Reaction to laceration | 0.90% |
| Biological infection | -4.80 |
| Psy-emissions | -1.28 |
| Temperature | 0.21 |
| Radiation | 0.45 |

### Result-panel formula implication

The Artifact-panel Cursed Rose radiation difference at Q100 L15 is:

```text
Ordinary:   1.25
Unordinary: 1.13
Delta:      0.12
```

With Berloga 6 protection `78.5%`, harmful stat passthrough is:

```ts
1 - 78.5 / 100 = 0.215
```

Expected final radiation delta from only changing Cursed Rose rarity:

```text
0.12 * 0.215 = 0.0258
```

The Result panel displays:

```text
0.48 - 0.45 = 0.03
```

That is consistent after two-decimal display rounding. This supports the final harmful-stat formula:

```ts
finalHarmful = sum(artifactPanelHarmfulStats) * (1 - containerProtection / 100)
```

It also supports the project owner's observation that, at least on this visible Result stat category, changing Cursed Rose Q100 rarity only affected Radiation while the other displayed final stats stayed the same.

### Q130 Special/Rare artifact-panel threshold result

At the exact `quality=130` cap, Special and Rare are both legal rarities. The screenshots show:

```text
Q130 Special artifact panel:
Bullet resistance     26.20
Explosion protection  20.11
Radiation              1.25
Stamina regeneration   4.90%

Q130 Rare artifact panel:
Bullet resistance     26.20
Explosion protection  20.11
Radiation              1.06
Stamina regeneration   4.90%
```

This confirms the threshold rule: at exact quality caps, changing to the higher rarity affects harmful/negative stats while positive/additional stats remain quality-scaled and unchanged.

For the same full Berloga 6 build, Q130 Special Result panel shows:

```text
Effective health      136.30
Bullet resistance      36.30
Explosion protection   20.11
Stamina regeneration    4.90%
Radiation               0.48
```

If Q130 Rare only changes Cursed Rose artifact Radiation from `1.25` to `1.06`, predicted final Radiation is:

```text
0.48 - ((1.25 - 1.06) * 0.215) = 0.43915 -> 0.44 displayed
```

Q130 Rare Result-panel screenshot `img_edec7db95ec4.jpg` confirmed the prediction:

```text
Effective health       136.30
Bullet resistance       36.30
Explosion protection    20.11
Stamina regeneration     4.90%
Radiation                0.44 ✅
```

### Q145 Rare / Exclusive threshold pair

Artifact-panel screenshots:

| Quality | Rarity | Bullet resistance | Explosion protection | Radiation | Stamina regeneration |
|---:|---|---:|---:|---:|---:|
| 145 | Rare | 29.22 | 22.43 | 1.25 | 5.47% |
| 145 | Exclusive | 29.22 | 22.43 | 1.06 | 5.47% |

Source screenshots:

- `img_70d3a5cbc1bd.jpg` — Q145 Rare artifact panel
- `img_9f1654023955.jpg` — Q145 Exclusive artifact panel

Result-panel screenshot `img_d69ee51efa47.jpg` for Q145 Rare:

```text
Effective health       139.32
Bullet resistance       39.32
Explosion protection    22.43
Stamina regeneration     5.47%
Radiation                0.48
```

Predicted Q145 Exclusive final Radiation, using the same full-build context and Berloga passthrough:

```text
Artifact radiation delta: 1.25 - 1.06 = 0.19
Final delta:             0.19 * 0.215 = 0.04085
Q145 Rare final rad:     0.48
Q145 Exclusive predicted final rad:
  0.48 - 0.04085 = 0.43915 -> 0.44 displayed
```

This further supports Result-panel harmful-stat behavior for threshold rarity swaps: local full-precision harmful delta times Berloga passthrough, then display rounding.

### Q160 Exclusive / Legendary threshold pair

Artifact-panel screenshots:

| Quality | Rarity | Bullet resistance | Explosion protection | Radiation | Stamina regeneration |
|---:|---|---:|---:|---:|---:|
| 160 | Exclusive | 32.24 | 24.75 | 1.25 | 6.03% |
| 160 | Legendary | 32.24 | 24.75 | 1.06 | 6.03% |

Source screenshots:

- `img_91db57f38f76.jpg` — Q160 Exclusive artifact panel
- `img_61ebd13de2e2.jpg` — Q160 Legendary artifact panel

Result-panel screenshots:

| Quality | Rarity | Effective health | Bullet resistance | Explosion protection | Stamina regeneration | Radiation |
|---:|---|---:|---:|---:|---:|---:|
| 160 | Exclusive | 142.34 | 42.34 | 24.75 | 6.03% | 0.48 |
| 160 | Legendary | 142.34 | 42.34 | 24.75 | 6.03% | 0.44 |

Source screenshots:

- `img_6653d85efd82.jpg` — Q160 Exclusive result panel
- `img_bed4bd6a66d7.jpg` — Q160 Legendary result panel

This repeats the Q145 threshold pattern exactly:

```text
First rarity at threshold:  artifact radiation 1.25 -> final radiation 0.48
Second rarity at threshold: artifact radiation 1.06 -> final radiation 0.44
```

## Current working formulas to verify

### Positive artifact stats

```ts
positiveStat = strongestValue * containerEffectiveness * (quality / 100) * (1 + 2 * level / 100)
```

For Artifact panel fixtures, container effectiveness should effectively be `1.0` unless the panel explicitly includes container context. For Result/build calculations, container effectiveness applies as the Wiki formula dictates. Accumulation stats may be special-cased by the Wiki formula.

### Negative / harmful artifact stats

Known behavior from prior reverse engineering:

- negative stats do not use the positive formula;
- quality/rarity bands matter;
- container protection applies later in result/build context;
- artifact-panel Cursed Rose radiation is stable across level changes;
- Q145/Q160/Q175 Cursed Rose radiation plateaus at displayed `1.25`.

These screenshots should become tests before editing the negative-stat implementation.

### Container protection

For final build results, protected harmful stats use:

```ts
finalHarmful = artifactPanelHarmful * (1 - containerProtection / 100)
```

Example already known:

```text
Berloga 6 protection 78.5%
2.5 harmful -> 2.5 * 0.215 = 0.5375
```

## Required fixture schema

Create `data/wiki-fixtures/artifact-calculator-fixtures.json` with rows shaped like:

```ts
type WikiArtifactCalculatorFixture = {
  source: 'manual-screenshot';
  version: string;
  screenshot: string;
  panel: 'artifact' | 'result';
  artifactName: string;
  artifactId: string;
  level: number;
  quality: number;
  rarity: string;
  additionalStats: string[];
  expectedStatsByDisplayName: Record<string, number | string>;
};
```

## Required optimizer model

Optimizer must operate over calculated artifact candidate instances, not raw artifact records:

```ts
type ArtifactCandidateInstance = {
  artifactId: string;
  level: number;
  quality: number;
  rarity: ArtifactRarity;
  selectedAdditionalStatKeys: string[];
  calculatedStats: CalculatedStat[];
};
```

Additional-stat policy:

```ts
type AdditionalStatPolicy =
  | 'none'
  | 'explicit-only'
  | 'optimize-unlocked';
```

For exactness, the solver must know how many additional stats can be selected at each level/rarity/quality and which additional stats are legal. If this is not known yet, `optimize-unlocked` must stay behind tests/fixtures and default behavior should be conservative.

## Implementation plan for subagent

1. Create fixture JSON from this document.
2. Write failing `tests/wiki-calculator-fixtures.test.ts` that loads fixtures and checks artifact-panel calculations to two decimals.
3. Preserve existing core formula tests.
4. Implement/patch calculator only after RED failures are confirmed.
5. Add additional-stat selection support to calculated artifact instances.
6. Add optimizer tests proving candidate stats change when additional stats are selected.
7. Add search-space controls for additional stats so optimization remains tractable.
8. Run:

```bash
pnpm test -- --run tests/wiki-calculator-fixtures.test.ts
pnpm test
pnpm typecheck
pnpm optimize "Generate a Berloga 6 build that maximizes bullet resistance using legendary artifacts at 175 quality +0"
```

## Calculation update running log

A concise batch-by-batch running log now exists at:

`docs/research/calculation-updates-running-log.md`

Use it for quick handoff to implementation or GPT-5.5 Pro subagents. This document remains the detailed source of formula evidence.

## Snares / Psy-emissions fixture stream

the project owner clarified that in the current Snares test build all artifacts are level `0`, quality `100`, and `Unordinary` rarity. The container-list screenshot does not show rarity, so preserve the project owner's clarification as fixture context.

### Build context — all Q100 L0 Unordinary

Source screenshot: `img_fad6bb286ab2.jpg`

```text
Container: Berloga — 6 Container
capacity: 6
protection: 78.5%
effectiveness: 100%
Armor: none selected

Artifacts:
1. Coil +0 100% Unordinary
2. Cycle +0 100% Unordinary
3. Wicked Hedgehog +0 100% Unordinary
4. Static +0 100% Unordinary
5. Snares +0 100% Unordinary
6. Cursed Rose +0 100% Unordinary
```

### Snares artifact panel — Q100 L0 Unordinary

Source screenshot: `img_84ceb78c4e99.jpg`

| Stat | Displayed value | Interpretation |
|---|---:|---|
| Movement speed | 0.70% | beneficial |
| Running speed | 0.95% | beneficial |
| Laceration protection | 17.40 | beneficial |
| Biological infection | 0.56 | harmful accumulation |
| Psy-emissions | -1.28 | beneficial reduction, shown green |

Important: `Psy-emissions` can be negative and beneficial. The optimizer must not treat every stat containing “psy” as harmful. Harmful cap enforcement applies to positive harmful accumulation values after the final build calculation; beneficial negative reductions should improve the build.

### Result panel — Reactions to Anomalies

Source screenshot: `img_c8d1eb28b6d8.jpg`

The selected Result dropdown/category is **Reactions to Anomalies**. It is **not** a separate “Reaction to laceration” dropdown. `Reaction to laceration` appears as an available final stat within the category and should be supported as an optimizer objective/result stat.

| Final stat | Value |
|---|---:|
| Effective health | 121.70 |
| Healing per second | 0.50% |
| Recoil | -3.70% |
| Bleeding | -0.70 |
| Bullet resistance | 21.70 |
| Movement speed | 2.40% |
| Running speed | 3.25% |
| Stamina | 29.30% |
| Carry weight | 4.70 |
| Laceration protection | 17.40 |
| Explosion protection | 8.90 |
| Resistance to fire | 16.20 |
| Reaction to laceration | 0.90% |
| Biological infection | -4.80 |
| Psy-emissions | -1.28 |
| Temperature | 0.21 |
| Radiation | 0.45 |

### Snares Q115/L0/Unordinary quality scaling probe

Source screenshot: `img_00d79409789e.jpg`

Observed artifact panel:

| Stat | Displayed value |
|---|---:|
| Movement speed | 0.80% |
| Running speed | 1.09% |
| Laceration protection | 20.01 |
| Biological infection | 0.63 |
| Psy-emissions | -1.47 |

Naïve scaling from already-rounded Q100/L0/Unordinary display values is not safe:

```text
Movement speed:        0.70 * 1.15 = 0.805 -> half-up 0.81, observed 0.80
Biological infection:  0.56 * 1.15 = 0.644 -> half-up 0.64, observed 0.63
```

But the Q115 values are consistent with quality scaling from hidden full-precision Q100 bases:

```text
Movement speed implied Q100 raw:        0.80 / 1.15 ≈ 0.69565
Running speed implied Q100 raw:         1.09 / 1.15 ≈ 0.94783
Laceration protection implied Q100 raw: 20.01 / 1.15 = 17.40
Biological infection implied Q100 raw:  0.63 / 1.15 ≈ 0.54783
Psy-emissions implied Q100 raw:        -1.47 / 1.15 ≈ -1.27826
```

Calculation update: use hidden/source raw values for formula bases; never feed rounded display values back into candidate generation.

### Snares Q115/L0 Unordinary vs Special threshold

Source screenshots:

- `img_aec61b28e065.jpg` — Result panel, Q115/L0/Unordinary, `Reaction to laceration` selected
- `img_d5aa9ec62a4c.jpg` — Artifact panel, Q115/L0/Special
- `img_3ac9acfca544.jpg` — Result panel, Q115/L0/Special, `Reaction to laceration` selected

Artifact-panel comparison:

| Snares Q115 rarity | Movement speed | Running speed | Laceration protection | Biological infection | Psy-emissions |
|---|---:|---:|---:|---:|---:|
| Unordinary | 0.80% | 1.09% | 20.01 | 0.63 | -1.47 |
| Special | 0.80% | 1.09% | 20.01 | 0.53 | -1.47 |

Result-panel comparison, `Reaction to laceration` selected:

| Snares Q115 rarity | Effective health | Movement speed | Running speed | Laceration protection | Biological infection | Psy-emissions | Temperature | Radiation |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Unordinary | 122.80 | 2.50% | 3.39% | 20.01 | -4.74 | -1.47 | 0.21 | 0.45 |
| Special | 122.80 | 2.50% | 3.39% | 20.01 | -4.83 | -1.47 | 0.21 | 0.45 |

Observed deltas:

```text
Artifact-panel Biological infection delta:
0.63 - 0.53 = 0.10

Result-panel Biological infection delta:
-4.83 - (-4.74) = -0.09 displayed improvement
```

This confirms the threshold-rarity pattern for Snares at Q115: the second rarity reduces Biological infection while positives and Psy-emissions stay the same. It also reinforces that Biological infection does not follow the same final protection formula as Radiation (`0.10 * 0.215 = 0.0215`, not the observed about `0.09`).

### Snares Q130/L0 Special vs Rare threshold

Source screenshots:

- `img_eab3916727a2.jpg` — Artifact panel, Q130/L0/Special
- `img_fce7912b2b5b.jpg` — Result panel, Q130/L0/Special, `Reaction to laceration` selected
- `img_c7c1a0de2fe9.jpg` — Artifact panel, Q130/L0/Rare
- `img_74ced6f896e6.jpg` — Result panel, Q130/L0/Rare, `Reaction to laceration` selected

Artifact-panel comparison:

| Snares Q130 rarity | Movement speed | Running speed | Laceration protection | Biological infection | Psy-emissions |
|---|---:|---:|---:|---:|---:|
| Special | 0.91% | 1.23% | 22.62 | 0.63 | -1.66 |
| Rare | 0.91% | 1.23% | 22.62 | 0.53 | -1.66 |

Result-panel comparison, `Reaction to laceration` selected:

| Snares Q130 rarity | Effective health | Movement speed | Running speed | Laceration protection | Biological infection | Psy-emissions | Temperature | Radiation |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Special | 122.80 | 2.61% | 3.53% | 22.62 | -4.74 | -1.66 | 0.21 | 0.45 |
| Rare | 122.80 | 2.61% | 3.53% | 22.62 | -4.83 | -1.66 | 0.21 | 0.45 |

Note: automated vision read the Running speed row as `-3.53%` on both Q130 result screenshots, but the user-provided screenshot descriptions and arithmetic from the artifact delta support `+3.53%` (`3.25 + (1.23 - 0.95) = 3.53`). The fixtures record `3.53%`.

The Q130 threshold repeats the Q115 pattern: the second rarity reduces artifact-panel Biological infection by `0.10`; the Result panel improves by about `0.09` (`-4.74` to `-4.83`). Positive/beneficial stats and Psy-emissions stay unchanged. This reinforces that biological final aggregation is a separate formula family from Cursed Rose Radiation/Berloga passthrough.

### Snares Q145/L0 Rare vs Exclusive threshold

Source screenshots:

- `img_7520a9f3c7e1.jpg` — Artifact panel, Q145/L0/Rare
- `img_c459a9af2438.jpg` — Result panel, Q145/L0/Rare, `Reaction to laceration` selected
- `img_7c39a493376a.jpg` — Artifact panel, Q145/L0/Exclusive
- `img_6fb2ad08068d.jpg` — Result panel, Q145/L0/Exclusive, `Reaction to laceration` selected

Artifact-panel comparison:

| Snares Q145 rarity | Movement speed | Running speed | Laceration protection | Biological infection | Psy-emissions |
|---|---:|---:|---:|---:|---:|
| Rare | 1.01% | 1.38% | 25.23 | 0.63 | -1.86 |
| Exclusive | 1.01% | 1.38% | 25.23 | 0.53 | -1.86 |

Result-panel comparison, `Reaction to laceration` selected:

| Snares Q145 rarity | Effective health | Movement speed | Running speed | Laceration protection | Biological infection | Psy-emissions | Temperature | Radiation |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Rare | 122.80 | 2.71% | 3.68% | 25.23 | -4.74 | -1.86 | 0.21 | 0.45 |
| Exclusive | 122.80 | 2.71% | 3.68% | 25.23 | -4.83 | -1.86 | 0.21 | 0.45 |

Prediction check: Q145 Rare artifact, Q145 Exclusive artifact, Q145 Rare Result, and Q145 Exclusive Result all matched the predicted values.

The Snares Biological infection threshold pattern now repeats at Q115, Q130, and Q145. At Q145, switching from Rare to Exclusive leaves positives and Psy-emissions unchanged while lowering artifact-panel Biological infection from `0.63` to `0.53` and improving final Biological infection from `-4.74` to `-4.83`.

### Snares Q100 Ordinary vs Unordinary rarity swap

Source screenshots:

- `img_94f65784a133.jpg` — Snares artifact panel, Q100/L0/Ordinary
- `img_8554a6c2cf1d.jpg` — Result panel, Snares Q100/L0/Ordinary, category `Reactions to Anomalies`
- `img_403156904974.jpg` — Result panel, Snares Q100/L0/Ordinary, selected option/filter `Reaction to laceration`

Artifact-panel comparison:

| Snares rarity | Movement speed | Running speed | Laceration protection | Biological infection | Psy-emissions |
|---|---:|---:|---:|---:|---:|
| Ordinary | 0.70% | 0.95% | 17.40 | 0.63 | -1.28 |
| Unordinary | 0.70% | 0.95% | 17.40 | 0.56 | -1.28 |

This mirrors the Cursed Rose threshold behavior in shape: changing rarity at Q100 leaves beneficial positives unchanged and changes one harmful stat. For Snares the changed stat is `Biological infection`, not `Psy-emissions`.

Result-panel comparison for `Reactions to Anomalies`:

| Snares rarity | Effective health | Bullet resistance | Laceration protection | Biological infection | Psy-emissions | Temperature | Radiation |
|---|---:|---:|---:|---:|---:|---:|---:|
| Ordinary | 121.70 | 21.70 | 17.40 | -4.74 | -1.28 | 0.21 | 0.45 |
| Unordinary | 121.70 | 21.70 | 17.40 | -4.80 | -1.28 | 0.21 | 0.45 |

Observed deltas:

```text
Artifact-panel Biological infection delta:
Ordinary 0.63 - Unordinary 0.56 = 0.07

Result-panel Biological infection delta:
Ordinary -4.74 - Unordinary -4.80 = +0.06
```

Important: this does **not** match the Cursed Rose radiation passthrough pattern (`delta * 0.215`). Biological infection may use a different final aggregation/protection rule, may round from hidden precision, or may be affected by category-specific reaction math. Do not assume all harmful stats use the same protection path as Radiation.

### Reaction to laceration selected in Result dropdown/filter

The screenshot with `Reaction to laceration` selected shows additional/changed final stats compared with the base `Reactions to Anomalies` view:

| Final stat | Base Reactions to Anomalies | Reaction to laceration selected |
|---|---:|---:|
| Effective health | 121.70 | 122.80 |
| Vitality | not visible | 0.90% |
| Stamina regeneration | not visible | 0.90% |
| Reaction to laceration | 0.90% | 0.90% |
| Biological infection | -4.74 | -4.74 |
| Psy-emissions | -1.28 | -1.28 |

This means the dropdown/filter is not merely a visual filter. Selecting `Reaction to laceration` appears to activate/show a reaction outcome that changes the displayed derived stats, especially Effective health, Vitality, and Stamina regeneration. UltimateBuild must model these selectable result/reaction outcomes as calculation variables or output modes, not only as labels.

### Wicked Hedgehog Q100/L0 Unordinary fixed contributor

Source screenshots:

- `img_63a20306f2dc.jpg` — Artifact panel, Wicked Hedgehog Q100/L0/Unordinary
- `img_1b345dc9686a.jpg` — Artifact panel, Wicked Hedgehog Q100/L0/Unordinary duplicate/confirmation
- `img_061fc264a76c.jpg` — Result panel, full build Q100/L0/Unordinary baseline, `Reaction to laceration` selected
- `img_2cda916ac01d.jpg` — duplicate/confirmation Result panel for the same baseline/context

Wicked Hedgehog artifact panel:

| Stat | Displayed value |
|---|---:|
| Stamina | 13.90% |
| Movement speed | 0.50% |
| Running speed | 0.70% |
| Radiation | -1.28 |
| Temperature | -1.28 |
| Biological infection | -1.28 |
| Reaction to laceration | 0.90% |

This corrects the earlier quick context note that used ordinary/normalized `-1.09` for Wicked Hedgehog harmful reductions. For the current screenshot-proven Q100/L0/Unordinary build context, use `-1.28` for Radiation, Temperature, and Biological infection.

### Wicked Hedgehog Q130/L0 Special vs Rare quality probe

Source screenshots:

- `img_645f78fc8bc0.jpg` — Wicked Hedgehog artifact panel, Q130/L0/Special
- `img_8cc803e0beb9.jpg` — Result panel, full build with Wicked Hedgehog Q130/L0/Special override, `Reaction to laceration` selected
- `img_b5e56582cba0.jpg` — Wicked Hedgehog artifact panel, Q130/L0/Rare
- `img_e28066f43071.jpg` — Result panel, full build with Wicked Hedgehog Q130/L0/Rare override, `Reaction to laceration` selected

Artifact-panel comparison:

| Wicked Hedgehog Q130 rarity | Stamina | Movement speed | Running speed | Radiation | Temperature | Biological infection | Reaction to laceration |
|---|---:|---:|---:|---:|---:|---:|---:|
| Special | 18.07% | 0.65% | 0.91% | -1.66 | -1.66 | -1.66 | 1.17% |
| Rare | 18.07% | 0.65% | 0.91% | -1.66 | -1.66 | -1.66 | 1.17% |

This is a useful contrast with Snares and Cursed Rose: at Q130, switching Wicked Hedgehog from Special to Rare did **not** visibly change any artifact-panel stat. The Q130 values are consistent with quality scaling from the Q100/L0/Unordinary Wicked Hedgehog fixture:

```text
Stamina:                13.90% * 1.30 = 18.07%
Movement speed:          0.50% * 1.30 =  0.65%
Running speed:           0.70% * 1.30 =  0.91%
Radiation:              -1.28  * 1.30 = -1.66
Temperature:            -1.28  * 1.30 = -1.66
Biological infection:   -1.28  * 1.30 = -1.66
Reaction to laceration:  0.90% * 1.30 =  1.17%
```

Result-panel comparison against the Q100/L0/Unordinary baseline, with `Reaction to laceration` selected:

| Final stat | WH Q100 baseline | WH Q130 Special/Rare override | Delta / implication |
|---|---:|---:|---|
| Effective health | 122.80 | 123.12 | derived from higher reaction/vitality |
| Vitality | 0.90% | 1.17% | direct +0.27 |
| Movement speed | 2.40% | 2.55% | direct +0.15 |
| Running speed | 3.25% | 3.46% | direct +0.21 |
| Stamina | 29.30% | 33.47% | direct +4.17 |
| Stamina regeneration | 0.90% | 1.17% | direct +0.27 |
| Reaction to laceration | 0.90% | 1.17% | direct +0.27 |
| Biological infection | -4.80 | -5.18 | direct about -0.38 |
| Temperature | 0.21 | 0.13 | `-0.38 * 0.215 ≈ -0.08` Berloga passthrough |
| Radiation | 0.45 | 0.37 | `-0.38 * 0.215 ≈ -0.08` Berloga passthrough |

The Q130 Rare Result screenshot matches the Q130 Special Result screenshot exactly, confirming the no-visible-threshold-change behavior carries through to the final Result panel.

This confirms a split behavior for Wicked Hedgehog deltas: Radiation and Temperature still use Berloga 6 protection passthrough in final results, while the beneficial negative Biological infection delta appears almost direct in the displayed final Biological infection value.

### Chilly swap new build Q100/L0

Source screenshots:

- `img_1deb618e8c54.jpg` — Container panel, Berloga 6 with Chilly/Cycle/Wicked Hedgehog/Static/Snares/Cursed Rose
- `img_81767862c72b.jpg` — Chilly artifact panel, Q100/L0/Unordinary
- `img_072df75d319d.jpg` — Result panel, same build, `Reaction to laceration` selected

Chilly artifact panel:

| Stat | Displayed value |
|---|---:|
| Vitality | 2.70% |
| Temperature | -0.38 |
| Frost | 0.90 |
| Burning | -0.40 |

Result-panel check against the prior all-Q100/L0 baseline:

| Final stat | Prior Coil build | New Chilly build | Explanation |
|---|---:|---:|---|
| Effective health | 122.80 | 126.08 | Chilly Vitality increases health pool/derived EH |
| Vitality | 0.90% | 3.60% | `0.90 reaction context + 2.70 Chilly` |
| Movement speed | 2.40% | 1.20% | Coil `+1.20%` removed |
| Running speed | 3.25% | 1.65% | Coil `+1.60%` removed |
| Carry weight | 4.70 | absent | Coil removed |
| Resistance to fire | 16.20 | absent | Coil removed |
| Burning | absent | -0.40 | Chilly added |
| Frost | absent | 0.90 | Chilly Unordinary added |
| Temperature | 0.21 | -1.66 | Chilly `-0.38` + Wicked Hedgehog `-1.28`; Coil positive thermal harm removed |
| Biological infection | -4.80 | -4.80 | unchanged contributors |
| Radiation | 0.45 | 0.45 | unchanged contributors |

This new build is internally consistent and confirms Chilly Q100/L0/Unordinary endpoint behavior: Frost drops to `0.90` at the second Q100 rarity while Vitality, Temperature, and Burning stay `2.70%`, `-0.38`, and `-0.40`. It also reinforces that the final Temperature family needs split handling: beneficial negative thermal reductions from Chilly/Wicked Hedgehog show directly in this Result panel, while positive harmful thermal accumulation from Coil was not a direct add.


### Chilly Q130/L0 Special vs Rare quality probe

Source screenshots:

- `img_923d790cae7d.jpg` — Chilly artifact panel, Q130/L0/Special
- `img_226e0fe30b22.jpg` — Result panel, full build with Chilly Q130/L0/Special override, `Reaction to laceration` selected
- `img_0cfeb4436ec3.jpg` — Chilly artifact panel, Q130/L0/Rare
- `img_95eabb1be434.jpg` — Result panel, full build with Chilly Q130/L0/Rare override, `Reaction to laceration` selected

Artifact-panel comparison:

| Chilly Q130 rarity | Vitality | Temperature | Frost | Burning |
|---|---:|---:|---:|---:|
| Special | 3.51% | -0.50 | 1.00 | -0.52 |
| Rare | 3.51% | -0.50 | 0.85 | -0.52 |

The non-Frost stats match quality scaling from Q100 raw/full-precision values:

```text
Vitality:     2.70 * 1.30 = 3.51%
Temperature: -0.384 * 1.30 = -0.4992 -> -0.50
Burning:     -0.40 * 1.30 = -0.52
```

Frost is Chilly's threshold-rarity stat at Q130. Special shows Frost `1.00`; Rare improves it to `0.85` while the other visible stats stay unchanged.

Observed Q130 Special Result panel, `Reaction to laceration` selected:

| Final stat | Q100 Unordinary Chilly build | Q130 Special Chilly override | Delta / implication |
|---|---:|---:|---|
| Effective health | 126.08 | 127.07 | derived from higher Chilly Vitality |
| Vitality | 3.60% | 4.41% | direct +0.81 from Chilly `2.70 -> 3.51` |
| Burning | -0.40 | -0.52 | direct -0.12 |
| Temperature | -1.66 | -1.78 | direct -0.12 from Chilly |
| Frost | 0.90 | 1.00 | Q130 Special harmful Frost endpoint |
| Movement speed | 1.20% | 1.20% | unchanged |
| Running speed | 1.65% | 1.65% | unchanged |
| Biological infection | -4.80 | -4.80 | unchanged |
| Radiation | 0.45 | 0.45 | unchanged |

Q130 Rare Result screenshot confirms the prediction: same as Q130 Special except Frost is `0.85`.

| Final stat | Q130 Special | Q130 Rare | Delta / implication |
|---|---:|---:|---|
| Effective health | 127.07 | 127.07 | unchanged |
| Vitality | 4.41% | 4.41% | unchanged |
| Burning | -0.52 | -0.52 | unchanged |
| Temperature | -1.78 | -1.78 | unchanged |
| Frost | 1.00 | 0.85 | Rare threshold improvement |
| Movement speed | 1.20% | 1.20% | unchanged |
| Running speed | 1.65% | 1.65% | unchanged |
| Biological infection | -4.80 | -4.80 | unchanged |
| Radiation | 0.45 | 0.45 | unchanged |

### Immediate calculation implications from Snares/Wicked Hedgehog/Chilly

1. The active full-build context changed from earlier Cursed Rose `+15` threshold tests. In this Snares/Wicked Hedgehog baseline, **Cursed Rose is +0**, not +15, and every artifact is Q100/L0/Unordinary unless an explicit artifact override is noted. Wicked Hedgehog (`x22sxr4`) is a fixed contributor and has `Reaction to laceration 0.90%`; do not attribute the baseline Result-panel reaction stat to Snares while isolating Snares deltas.
2. Screenshot-confirmed Q100/L0/Unordinary Wicked Hedgehog reductions are Radiation `-1.28`, Temperature `-1.28`, and Biological infection `-1.28` — not the ordinary/normalized `-1.09` values. At Q130/L0, both Special and Rare show `-1.66` for those three reductions and `Reaction to laceration 1.17%`.
3. `Reaction to laceration` is both an optimizer-visible final stat and a selectable Result outcome/filter that can affect derived stats. Add/keep a stat key mapping for prompts like “maximize reaction to laceration”, and model selected reaction context separately from artifact stats.
4. `Psy-emissions = -1.28` is shown green and beneficial. This stat behaves like a reduction, not a harmful positive accumulation in this fixture.
5. `Biological infection` on Snares artifact panel is positive red/harmful, but full-build final Biological infection is negative green because other artifacts overcompensate. Harmful cap logic must evaluate the final summed/protected value, not reject an artifact solely because it has a positive harmful component.
6. `Psy-emissions` in the Snares artifact panel and Result panel both display `-1.28` in this context, suggesting either no protection applies to beneficial negative reductions or no other artifacts alter it. More Snares rarity/quality screenshots are needed before generalizing.
7. Biological infection changed almost one-for-one from artifact panel to Result panel for Snares and Wicked Hedgehog beneficial-negative deltas, unlike Radiation/Temperature. Treat biological/psy/temperature/frost as separate formula families until proven otherwise.

### Cycle Q175/L0 Legendary vs Unique quality probe

Source screenshots:

- `img_a7ff64a1b678.jpg` — Cycle artifact panel, Q175/L0/Legendary
- `img_149b24ddc27a.jpg` — Result panel, full build with Cycle Q175/L0/Legendary override, `Reaction to laceration` selected
- `img_474823a3e0dd.jpg` — Cycle artifact panel, Q175/L0/Unique
- `img_0e8b91afceb5.jpg` — Result panel, full build with Cycle Q175/L0/Unique override, `Reaction to laceration` selected

Artifact-panel comparison:

| Cycle Q175 rarity | Stamina | Biological infection | Bleeding |
|---|---:|---:|---:|
| Legendary | 26.95% | -7.14 | -1.22 |
| Unique | 26.95% | -7.14 | -1.22 |

Prediction from Q100 endpoints:

| Stat | Displayed value | Prediction |
|---|---:|---:|
| Stamina | 26.95% | `15.40 * 1.75 = 26.95` |
| Biological infection | -7.14 | `-4.08 * 1.75 = -7.14` |
| Bleeding | -1.22 | `-0.70 * 1.75 = -1.225 -> -1.22 display` |

Result-panel comparison, `Reaction to laceration` selected:

| Cycle Q175 rarity | Effective health | Bleeding | Stamina | Biological infection | Temperature | Radiation |
|---|---:|---:|---:|---:|---:|---:|
| Legendary | 122.80 | -1.22 | 40.85% | -7.86 | 0.21 | 0.45 |
| Unique | 122.80 | -1.22 | 40.85% | -7.86 | 0.21 | 0.45 |

This Q175 check confirms Cycle (`04yr`) uses direct quality scaling from the Q100 endpoint values for both positive Stamina and beneficial negative reductions. It also confirms no visible Legendary→Unique threshold-rarity change for Cycle in either Artifact or Result panels. Bleeding adds another stat where exact display parity needs Wiki/JS-style final rounding instead of early rounding.

Next Snares screenshots should answer:

1. Does Biological infection keep the same second-rarity improvement at Q160 Exclusive/Legendary?
2. Does Psy-emissions follow quality scaling only, or can rarity thresholds alter it on other artifacts/stat bands?
3. Are harmful/beneficial negative values stat/artifact-specific rather than universal?
4. Does level affect Psy-emissions/Biological infection, or are they level-stable like Cursed Rose Radiation?
5. Does Berloga 6 protection apply differently to positive harmful accumulation vs negative beneficial reductions?
6. Do final Result panels show only Psy-emissions/Biological infection changing when Snares rarity changes, or do derived/final stats also move?

Already confirmed from Cursed Rose:

1. Positive base stats scale with quality and level:
   ```ts
   positive = base * (quality / 100) * (1 + 2 * level / 100)
   ```
2. Selected additional stats affect the artifact candidate and scale linearly with quality at the same level.
3. Harmful stats use separate rarity/quality-band behavior and must not use the positive formula.
4. Exact threshold caps expose two legal rarities; in-between qualities carry the second rarity.
5. Result-panel harmful stats apply container protection/passthrough and then display rounding.
