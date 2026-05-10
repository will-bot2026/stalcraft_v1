# UltimateBuild Calculation Updates Running Log

Purpose: concise running record of what each screenshot batch teaches us, what calculation rule changed, and what still needs fixture proof. This is meant for the project owner, implementation work, and the GPT-5.5 Pro optimizer/calculation subagent.

Canonical fixture JSON: `data/wiki-fixtures/artifact-calculator-source-truth.json`

Canonical detailed formula doc: `docs/research/wiki-calculator-screenshot-parity.md`

## Current high-confidence rules

### Positive artifact stats

Positive artifact stats scale with quality and level using hidden/full-precision base values:

```ts
positive = base * (quality / 100) * (1 + 2 * level / 100)
```

Do **not** use already-rounded displayed Q100 values as future calculation bases when exactness matters. Displayed values are rounded and can cause wrong predictions at later quality values.

### Selected additional stats

Selected additional stats scale like positive stats for the screenshots observed so far. They must be part of artifact candidate generation, not UI-only decorations.

### Rounding

Keep full precision internally. Round only for display and fixture comparisons.

### Rarity thresholds

At hard quality thresholds, two rarities can exist. Between thresholds, the second rarity carries forward:

```text
0-99: Ordinary
100: Ordinary or Unordinary; 101-114: Unordinary
115: Unordinary or Special; 116-129: Special
130: Special or Rare; 131-144: Rare
145: Rare or Exclusive; 146-159: Exclusive
160: Exclusive or Legendary; 161-174: Legendary
175: Legendary or Unique, if legal
```

### Harmful caps

Do not reject an artifact solely because one artifact has a positive harmful value. Other artifacts may offset it. Enforce harmful caps on the final unrounded build result.

## Batch: Cursed Rose Q147/Q145/Q160 level-15 selected-stat threshold work

### Learned

Cursed Rose positive/additional stats matched predictions exactly when scaling from the Q100/L15 selected-stat baseline with full precision and display rounding.

Examples:

```text
Q147 L15 Exclusive:
Bullet resistance     29.62
Explosion protection  22.74
Stamina regeneration   5.54%
```

Cursed Rose threshold rarity swaps changed Radiation while leaving positive stats unchanged:

```text
Q145 Rare       Radiation 1.25 -> final 0.48
Q145 Exclusive  Radiation 1.06 -> final 0.44
Q160 Exclusive  Radiation 1.25 -> final 0.48
Q160 Legendary  Radiation 1.06 -> final 0.44
```

For Radiation in Berloga 6, Result panel deltas matched:

```ts
finalRadiation = sumArtifactRadiation * (1 - containerProtection / 100)
```

Berloga 6 passthrough:

```text
1 - 0.785 = 0.215
```

### Changed

- Radiation final-result formula is fixture-supported for Berloga 6.
- Exact threshold rarity generation is required.
- Positive stats are safe to calculate with the quality/level formula if hidden full-precision bases are used.

## Batch: Snares Q100/L0 baseline, Unordinary and Ordinary

### Learned

Current Snares test build context:

```text
Berloga 6, no armor
All artifacts Q100/L0/Unordinary unless a Snares override is specified:
Coil, Cycle, Wicked Hedgehog, Static, Snares, Cursed Rose
```

Important fixed-build contributor: Wicked Hedgehog (`x22sxr4`) has base `Reaction to laceration 0.90%` at Q100/L0/Unordinary. In the current Snares isolation tests, the Result-panel `Reaction to laceration 0.90%` is from Wicked Hedgehog, not Snares. Screenshot-confirmed Q100/L0/Unordinary Wicked Hedgehog reductions are Radiation `-1.28`, Temperature `-1.28`, and Biological infection `-1.28`; do not use ordinary/normalized `-1.09` values for this build context.

Snares Q100/L0/Unordinary artifact panel:

```text
Movement speed           0.70%
Running speed            0.95%
Laceration protection   17.40
Biological infection     0.56
Psy-emissions           -1.28
```

Snares Q100/L0/Ordinary artifact panel:

```text
Movement speed           0.70%
Running speed            0.95%
Laceration protection   17.40
Biological infection     0.63
Psy-emissions           -1.28
```

Only Biological infection changed between Ordinary and Unordinary at Q100.

Result-panel Biological infection changed:

```text
Ordinary final Biological infection:   -4.74
Unordinary final Biological infection: -4.80
```

### Changed

- `Psy-emissions` can be negative and green/beneficial; do not treat every `psy` stat as a harmful positive accumulation.
- Biological infection does **not** appear to use the same Berloga protection delta behavior as Cursed Rose Radiation. Artifact delta `0.07` became final displayed delta about `0.06`, not `0.07 * 0.215`.
- Harmful stat families must be fixture-proven separately: radiation, biological, psy, temperature, frost.

## Batch: Result dropdown / Reaction to laceration

### Learned

Selecting `Reaction to laceration` in the Result dropdown/filter is not just a visual filter. It changes/expands derived displayed stats.

Base `Reactions to Anomalies` view for Snares Q100 Ordinary:

```text
Effective health       121.70
Reaction to laceration   0.90%
Biological infection    -4.74
Psy-emissions           -1.28
```

`Reaction to laceration` selected:

```text
Effective health       122.80
Vitality                 0.90%
Stamina regeneration     0.90%
Reaction to laceration   0.90%
Biological infection    -4.74
Psy-emissions           -1.28
```

### Changed

- UltimateBuild needs a `ResultContext` / selected reaction outcome model, not just one fixed final-stat panel.
- `reaction_to_laceration`, `vitality`, and `stamina_regeneration` should be valid optimizer target/result stats.

## Batch: Snares Q115/L0/Unordinary

Source screenshot: `img_00d79409789e.jpg`

Observed artifact panel:

```text
Snares
Level: 0
Quality: 115
Rarity: Unordinary

Movement speed           0.80%
Running speed            1.09%
Laceration protection   20.01
Biological infection     0.63
Psy-emissions           -1.47
```

### Verification against Q100 displayed values

If we naïvely multiply displayed Q100 values by 1.15:

```text
Movement speed:        0.70 * 1.15 = 0.805 -> would display 0.81 with half-up rounding, but observed 0.80
Running speed:         0.95 * 1.15 = 1.0925 -> 1.09, observed 1.09
Laceration protection: 17.40 * 1.15 = 20.01, observed 20.01
Biological infection:  0.56 * 1.15 = 0.644 -> would display 0.64, but observed 0.63
Psy-emissions:        -1.28 * 1.15 = -1.472 -> -1.47, observed -1.47
```

The mismatches prove the important rule: **displayed Q100 values are not safe calculation bases**. The Wiki uses hidden/full-precision bases, then rounds display at the end.

Implied hidden Q100 bases if Q115 displayed values are exact rounded endpoints:

```text
Movement speed around          0.69565 before display
Running speed around           0.94783 before display
Laceration protection exactly 17.40 from current evidence
Biological infection around    0.54783 before display
Psy-emissions around          -1.27826 before display
```

### Changed

- Quality scaling likely applies to Snares positives, Biological infection, and negative beneficial Psy-emissions using hidden raw bases.
- We must avoid reverse-engineering from rounded display values alone when generating optimizer candidates.
- Fixture comparisons should allow display rounding, but internal formulas need raw EXBO/Wiki base values or enough screenshots to infer them.

## Batch: Snares Q115/L0 Unordinary vs Special threshold

Source screenshots:

- `img_aec61b28e065.jpg` — Result panel, Q115/L0/Unordinary, `Reaction to laceration` selected
- `img_d5aa9ec62a4c.jpg` — Artifact panel, Q115/L0/Special
- `img_3ac9acfca544.jpg` — Result panel, Q115/L0/Special, `Reaction to laceration` selected

Observed artifact panel for Snares Q115/L0/Special:

```text
Movement speed           0.80%
Running speed            1.09%
Laceration protection   20.01
Biological infection     0.53
Psy-emissions           -1.47
```

Comparison to Q115/L0/Unordinary:

```text
Unordinary biological infection: 0.63
Special biological infection:    0.53
Artifact delta:                  0.10 reduction
```

Positive/beneficial stats stayed the same:

```text
Movement speed           0.80%
Running speed            1.09%
Laceration protection   20.01
Psy-emissions           -1.47
```

Result panel with `Reaction to laceration` selected:

```text
Q115 Unordinary Biological infection: -4.74
Q115 Special Biological infection:    -4.83
Displayed final delta:                -0.09 improvement
```

Other visible final stats stayed the same:

```text
Effective health       122.80
Movement speed           2.50%
Running speed            3.39%
Laceration protection   20.01
Psy-emissions           -1.47
Temperature              0.21
Radiation                0.45
```

### Learned

The Q115 threshold behaves like Cursed Rose structurally: the second rarity reduces the harmful stat while positives remain unchanged. For Snares, the affected stat is Biological infection.

But final Biological infection still does not look like Radiation's Berloga-protection path:

```text
Artifact delta: 0.10
If protected like Radiation: 0.10 * 0.215 = 0.0215
Observed displayed final delta: about 0.09
```

So biological final calculation remains a separate formula family and may be close to direct summing/hidden precision, not container-protected like radiation.


## Batch: Snares Q130/L0 Special vs Rare threshold

Source screenshots:

- `img_eab3916727a2.jpg` — Artifact panel, Q130/L0/Special
- `img_fce7912b2b5b.jpg` — Result panel, Q130/L0/Special, `Reaction to laceration` selected
- `img_c7c1a0de2fe9.jpg` — Artifact panel, Q130/L0/Rare
- `img_74ced6f896e6.jpg` — Result panel, Q130/L0/Rare, `Reaction to laceration` selected

Observed artifact panel for Snares Q130/L0/Special:

```text
Movement speed           0.91%
Running speed            1.23%
Laceration protection   22.62
Biological infection     0.63
Psy-emissions           -1.66
```

Observed artifact panel for Snares Q130/L0/Rare:

```text
Movement speed           0.91%
Running speed            1.23%
Laceration protection   22.62
Biological infection     0.53
Psy-emissions           -1.66
```

Comparison:

```text
Special biological infection: 0.63
Rare biological infection:    0.53
Artifact delta:               0.10 reduction
```

Positive/beneficial stats stayed the same across the threshold-rarity swap:

```text
Movement speed           0.91%
Running speed            1.23%
Laceration protection   22.62
Psy-emissions           -1.66
```

Result panel with `Reaction to laceration` selected:

```text
Q130 Special Biological infection: -4.74
Q130 Rare Biological infection:    -4.83
Displayed final delta:             -0.09 improvement
```

Other visible final stats stayed the same:

```text
Effective health       122.80
Movement speed           2.61%
Running speed            3.53%
Laceration protection   22.62
Psy-emissions           -1.66
Temperature              0.21
Radiation                0.45
```

Note: automated vision read the Running speed row as `-3.53%` on both Q130 result screenshots, but the user-provided screenshot descriptions and arithmetic from the artifact delta support `+3.53%` (`3.25 + (1.23 - 0.95) = 3.53`). The fixtures record `3.53%`.

### Learned

The Q130 threshold repeats the Snares Q115 behavior: the second rarity improves Biological infection while leaving positives and negative-beneficial Psy-emissions unchanged. Snares Biological infection is confirmed as the rarity-sensitive harmful stat at both Q115 and Q130 thresholds.

The Q130 artifact-panel biological delta is `0.10`; the displayed Result-panel biological improvement is about `0.09`, matching the Q115 threshold result behavior. This further supports treating biological final aggregation as its own formula family rather than applying the Cursed Rose Radiation/Berloga passthrough rule.

## Batch: Snares Q145/L0 Rare vs Exclusive threshold

Source screenshots:

- `img_7520a9f3c7e1.jpg` — Artifact panel, Q145/L0/Rare
- `img_c459a9af2438.jpg` — Result panel, Q145/L0/Rare, `Reaction to laceration` selected
- `img_7c39a493376a.jpg` — Artifact panel, Q145/L0/Exclusive
- `img_6fb2ad08068d.jpg` — Result panel, Q145/L0/Exclusive, `Reaction to laceration` selected

Observed artifact panel for Snares Q145/L0/Rare:

```text
Movement speed           1.01%
Running speed            1.38%
Laceration protection   25.23
Biological infection     0.63
Psy-emissions           -1.86
```

Observed artifact panel for Snares Q145/L0/Exclusive:

```text
Movement speed           1.01%
Running speed            1.38%
Laceration protection   25.23
Biological infection     0.53
Psy-emissions           -1.86
```

Result panel with `Reaction to laceration` selected:

```text
Q145 Rare Biological infection:      -4.74
Q145 Exclusive Biological infection: -4.83
Displayed final delta:               -0.09 improvement
```

Other visible final stats stayed the same:

```text
Effective health       122.80
Movement speed           2.71%
Running speed            3.68%
Laceration protection   25.23
Psy-emissions           -1.86
Temperature              0.21
Radiation                0.45
```

### Prediction check

The Q145 predictions matched for all screenshots provided:

```text
Artifact Rare:       1.01%, 1.38%, 25.23, Bio 0.63, Psy -1.86  ✅
Artifact Exclusive:  1.01%, 1.38%, 25.23, Bio 0.53, Psy -1.86  ✅
Result Rare:         Movement 2.71%, Running 3.68%, Bio -4.74   ✅
Result Exclusive:    Movement 2.71%, Running 3.68%, Bio -4.83   ✅
```

### Learned

The Snares Biological infection threshold pattern now repeats at Q115, Q130, and Q145 on both artifact panels and available result panels. At Q145, switching from Rare to Exclusive leaves positives and Psy-emissions unchanged while lowering artifact-panel Biological infection from `0.63` to `0.53` and improving final Biological infection from `-4.74` to `-4.83`.

## Batch: Wicked Hedgehog Q100/L0 Unordinary baseline correction

Source screenshots:

- `img_63a20306f2dc.jpg` — Artifact panel, Wicked Hedgehog Q100/L0/Unordinary
- `img_1b345dc9686a.jpg` — Artifact panel, Wicked Hedgehog Q100/L0/Unordinary duplicate/confirmation
- `img_061fc264a76c.jpg` — Result panel, full build Q100/L0/Unordinary baseline, `Reaction to laceration` selected
- `img_2cda916ac01d.jpg` — duplicate/confirmation Result panel for the same baseline/context

Observed Wicked Hedgehog artifact panel:

```text
Stamina                  13.90%
Movement speed            0.50%
Running speed             0.70%
Radiation                -1.28
Temperature              -1.28
Biological infection     -1.28
Reaction to laceration    0.90%
```

Observed full-build Result panel with `Reaction to laceration` selected:

```text
Effective health       122.80
Movement speed           2.40%
Running speed            3.25%
Laceration protection   17.40
Reaction to laceration   0.90%
Biological infection    -4.80
Psy-emissions           -1.28
Temperature              0.21
Radiation                0.45
```

### Changed / corrected

Wicked Hedgehog is confirmed as the source of `Reaction to laceration 0.90%` in the current build. More importantly, the Q100/L0/Unordinary Wicked Hedgehog harmful reductions are `-1.28` for Radiation, Temperature, and Biological infection. Earlier quick context notes used ordinary/normalized `-1.09`; those notes have been corrected in the fixture JSON and docs. The Snares delta predictions still matched because they compared against the observed full-build baseline, but future formula work must use the screenshot-confirmed Wicked Hedgehog values for this build context.

## Batch: Wicked Hedgehog Q130/L0 Special vs Rare

Source screenshots:

- `img_645f78fc8bc0.jpg` — Artifact panel, Wicked Hedgehog Q130/L0/Special
- `img_8cc803e0beb9.jpg` — Result panel, full build with Wicked Hedgehog Q130/L0/Special override, `Reaction to laceration` selected
- `img_b5e56582cba0.jpg` — Artifact panel, Wicked Hedgehog Q130/L0/Rare
- `img_e28066f43071.jpg` — Result panel, full build with Wicked Hedgehog Q130/L0/Rare override, `Reaction to laceration` selected

Observed Wicked Hedgehog Q130 artifact panel for both Special and Rare:

```text
Stamina                  18.07%
Movement speed            0.65%
Running speed             0.91%
Radiation                -1.66
Temperature              -1.66
Biological infection     -1.66
Reaction to laceration    1.17%
```

Comparison to Q100/L0/Unordinary:

```text
Stamina:                13.90% -> 18.07%  (+4.17)
Movement speed:          0.50% ->  0.65%  (+0.15)
Running speed:           0.70% ->  0.91%  (+0.21)
Radiation:              -1.28  -> -1.66   (-0.38)
Temperature:            -1.28  -> -1.66   (-0.38)
Biological infection:   -1.28  -> -1.66   (-0.38)
Reaction to laceration:  0.90% ->  1.17%  (+0.27)
```

Result panel with `Reaction to laceration` selected for both Wicked Hedgehog Q130/L0/Special and Q130/L0/Rare overrides:

```text
Effective health       123.12
Vitality                 1.17%
Movement speed           2.55%
Running speed            3.46%
Stamina                 33.47%
Stamina regeneration     1.17%
Reaction to laceration   1.17%
Biological infection    -5.18
Temperature              0.13
Radiation                0.37
```

The Q130 Rare Result screenshot matches the Q130 Special Result screenshot exactly, confirming the no-visible-threshold-change behavior carries through to the final Result panel.

### Learned

Wicked Hedgehog behaves differently from Snares/Cursed Rose at the Q130 threshold in these screenshots: switching from Special to Rare did **not** change any visible artifact-panel value. The Q130 values are simple quality-scaled outputs from the Q100/L0/Unordinary baseline, including the beneficial negative reductions.

Final Result-panel deltas versus the Q100/L0/Unordinary baseline:

```text
Movement:   2.40% -> 2.55%  direct +0.15
Running:    3.25% -> 3.46%  direct +0.21
Stamina:   29.30% -> 33.47% direct +4.17
Reaction:   0.90% -> 1.17%  direct +0.27
Bio:       -4.80  -> -5.18   direct about -0.38
Temp:       0.21  -> 0.13    Berloga passthrough: -0.38 * 0.215 ≈ -0.08
Rad:        0.45  -> 0.37    Berloga passthrough: -0.38 * 0.215 ≈ -0.08
```

This is important: Radiation/Temperature still follow Berloga protection passthrough for the Wicked Hedgehog delta, while Biological infection tracks the beneficial negative artifact delta almost directly in the displayed final Result panel.

## Batch: Cycle Q175/L0 Legendary vs Unique

Source screenshots:

- `img_a7ff64a1b678.jpg` — Artifact panel, Cycle Q175/L0/Legendary
- `img_149b24ddc27a.jpg` — Result panel, full build with Cycle Q175/L0/Legendary override, `Reaction to laceration` selected
- `img_474823a3e0dd.jpg` — Artifact panel, Cycle Q175/L0/Unique
- `img_0e8b91afceb5.jpg` — Result panel, full build with Cycle Q175/L0/Unique override, `Reaction to laceration` selected

Observed artifact panel for both Legendary and Unique:

```text
Stamina                 26.95%
Biological infection    -7.14
Bleeding                -1.22
```

### Prediction check

The artifact screenshot matches direct quality scaling from the Q100 raw/Wiki endpoint values for Cycle (`id: 04yr`):

```text
Stamina:               15.40 * 1.75 = 26.95 ✅
Biological infection:  -4.08 * 1.75 = -7.14 ✅
Bleeding:              -0.70 * 1.75 = -1.225 -> displays -1.22 ✅
```

Observed Result panel for both Legendary and Unique overrides:

```text
Effective health       122.80
Bleeding                -1.22
Stamina                 40.85%
Biological infection    -7.86
Temperature              0.21
Radiation                0.45
```

Final deltas from the Q100/L0/Unordinary baseline are direct for Cycle's visible stats:

```text
Stamina:              29.30% -> 40.85%  (+11.55)
Biological infection: -4.80  -> -7.86   (-3.06)
Bleeding:             -0.70  -> -1.22   (-0.52)
```

### Learned

Cycle Q175/L0 shows no visible Legendary→Unique threshold-rarity change in either Artifact or Result panels. Cycle uses the strongest/beneficial endpoint for all three visible stats; its negative Biological infection and Bleeding are beneficial reductions, and at Q175 they scale with quality like the positive Stamina value. Bleeding is another case where JavaScript/display rounding matters (`-1.225` displays as `-1.22`), so keep full precision internally and compare through Wiki-style display rounding.


## Batch: Chilly swap new build Q100/L0

Source screenshots:

- `img_1deb618e8c54.jpg` — Container panel, Berloga 6 with Chilly/Cycle/Wicked Hedgehog/Static/Snares/Cursed Rose
- `img_5eba8d750a0a.jpg` — Artifact panel, Chilly Q100/L0/Ordinary
- `img_dda4cd46211b.jpg` — Result panel, same build, `Reaction to laceration` selected

Observed Chilly artifact panel:

```text
Chilly
Level: 0
Quality: 100
Rarity: Unordinary

Vitality       2.70%
Temperature   -0.38
Frost           0.90
Burning        -0.40
```

Correction: the first pass treated Chilly as Ordinary/Frost `1.00`. The later artifact panel confirms the active build uses Unordinary, and Frost is `0.90`.

Observed Result panel with `Reaction to laceration` selected:

```text
Effective health       126.08
Healing per second       0.50%
Recoil                  -3.70%
Bleeding                -0.70
Burning                 -0.40
Bullet resistance       21.70
Vitality                 3.60%
Movement speed           1.20%
Running speed            1.65%
Stamina                 29.30%
Stamina regeneration     0.90%
Laceration protection   17.40
Explosion protection     8.90
Reaction to laceration   0.90%
Biological infection    -4.80
Psy-emissions           -1.28
Temperature             -1.66
Radiation                0.45
Frost                    0.90
```

### Prediction check

This build is the prior all-Q100/L0 baseline with Coil swapped out for Chilly. The visible deltas match:

```text
Movement speed:       2.40% -> 1.20%  (remove Coil +1.20)
Running speed:        3.25% -> 1.65%  (remove Coil +1.60)
Carry weight:          4.70 -> absent  (remove Coil)
Resistance to fire:   16.20 -> absent  (remove Coil)
Vitality:             0.90% -> 3.60%  (+2.70 Chilly, plus existing reaction-context 0.90)
Burning:             absent -> -0.40  (Chilly)
Frost:               absent ->  0.90  (Chilly Unordinary)
Temperature:           0.21 -> -1.66  (remove Coil thermal harm; Chilly -0.38 + Wicked Hedgehog -1.28 are visible direct negatives)
Radiation:             0.45 ->  0.45  unchanged
Biological infection: -4.80 -> -4.80  unchanged
```

### Learned

Chilly Q100/L0/Unordinary matches the normalized Wiki second-rarity endpoint for Frost (`0.90`) while Vitality/Temperature/Burning stay at `2.70%`, `-0.38`, and `-0.40`. The new build is internally consistent: Coil-only positives disappear, Chilly-only stats appear, and shared contributors remain unchanged. Temperature reinforces the family-specific behavior: beneficial negative thermal values from Chilly/Wicked Hedgehog show directly in the Result panel, while positive harmful thermal accumulation from Coil was previously not a direct final add.


## Batch: Chilly Q130/L0 Special vs Rare threshold

Source screenshots:

- `img_923d790cae7d.jpg` — Artifact panel, Chilly Q130/L0/Special
- `img_226e0fe30b22.jpg` — Result panel, Chilly Q130/L0/Special override, `Reaction to laceration` selected
- `img_0cfeb4436ec3.jpg` — Artifact panel, Chilly Q130/L0/Rare

Observed artifact panels:

```text
Q130 Special:
Vitality       3.51%
Temperature   -0.50
Frost           1.00
Burning        -0.52

Q130 Rare:
Vitality       3.51%
Temperature   -0.50
Frost           0.85
Burning        -0.52
```

### Prediction check

The non-Frost Chilly values match quality scaling from raw Q100 endpoints:

```text
Vitality:     2.70 * 1.30 = 3.51% ✅
Temperature: -0.384 * 1.30 = -0.4992 -> -0.50 ✅
Burning:     -0.40 * 1.30 = -0.52 ✅
```

Frost is the rarity-sensitive harmful stat for Chilly at Q130:

```text
Q100 Unordinary Frost: 0.90
Q130 Special Frost:    1.00
Q130 Rare Frost:       0.85
```

This mirrors the general threshold pattern: at an exact quality cap the second rarity can improve a harmful stat while leaving positive/beneficial stats unchanged. For Chilly Q130, Special keeps/returns Frost to the harmful endpoint `1.00`; Rare improves it to `0.85`.

Observed Q130 Special Result panel with `Reaction to laceration` selected:

```text
Effective health       127.07
Burning                 -0.52
Vitality                 4.41%
Movement speed           1.20%
Running speed            1.65%
Biological infection    -4.80
Temperature             -1.78
Radiation                0.45
Frost                    1.00
```

Deltas from the Q100/L0/Unordinary Chilly result:

```text
Vitality:     3.60% -> 4.41%  (+0.81 = Chilly 2.70 -> 3.51)
Temperature: -1.66  -> -1.78   (-0.12 = Chilly -0.38 -> -0.50)
Burning:     -0.40  -> -0.52   (-0.12)
Frost:        0.90  ->  1.00   (+0.10, rarity-sensitive harmful endpoint)
Movement/Running/Bio/Radiation unchanged ✅
```

Q130 Rare Result screenshot (`img_95eabb1be434.jpg`) confirms the prediction exactly: identical to Q130 Special except Frost is `0.85` instead of `1.00`; Effective health/Vitality/Temperature/Burning remain `127.07`, `4.41%`, `-1.78`, `-0.52`.

## Batch: Live current-build Q130/Q160 broad trait sweep

Context: desktop Chrome live STALCRAFT Wiki calculator, Berloga 6/no armor, `Reaction to laceration` selected. Current build artifacts: Chilly, Cycle, Wicked Hedgehog, Static, Snares, Cursed Rose. Each scenario varied one artifact while resetting the other five to Q100/L0/Unordinary. Full table: `docs/research/live-current-build-q130-q160-sweep.md`.

Validated 24 scenarios: Q130 first/second threshold rarity and Q160 first/second threshold rarity for Static, Wicked Hedgehog, Chilly, Cycle, Snares, and Cursed Rose. Artifact-panel formula comparison had **0 mismatches** against local normalized data. Covered trait families: Biological infection, Bleeding, Bullet resistance, Burning, Explosion protection, Frost, Laceration protection, Movement speed, Psy-emissions, Radiation, Reaction to laceration, Recoil, Running speed, Stamina, Temperature, Vitality.

Important formula confirmations:

- Positive/beneficial stats scale by quality: Static Bullet/Recoil, Wicked stamina/movement/running/reductions/reaction, Chilly Vitality/Temperature/Burning, Cycle Stamina/Bio/Bleeding, Snares movement/running/laceration/Psy, Cursed Rose Bullet/Explosion.
- Harmful positive threshold stats do **not** quality-scale; they select the rarity endpoint: Static Radiation, Chilly Frost, Snares Biological infection, Cursed Rose Radiation.
- Second threshold rarity improves those harmful endpoint stats while leaving positive stats unchanged where applicable.
- Wicked Hedgehog and Cycle showed no visible threshold-rarity change in their tested Q130/Q160 pairs.

## Still open

1. Coil Q130/Q160: still needs a live sweep because current build has Chilly in Coil's slot. This is the main remaining broad trait-coverage gap for Carry weight and Resistance to fire plus positive harmful Temperature.
2. Selected additional-stat formulas across artifacts: base stat behavior is now broad-covered, but selected additional stats still need targeted examples beyond the earlier Cursed Rose work.
3. Result-context modeling: enumerate all Result dropdown outcomes and which derived stats each activates.
4. Determine whether biological/psy final calculations use raw summing, category-specific reactions, hidden precision, or another formula.
5. Test whether positive harmful Temperature from Coil behaves like radiation passthrough or another formula family.
