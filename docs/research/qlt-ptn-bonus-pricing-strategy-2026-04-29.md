# QLT/PTN/Bonus-property pricing strategy — 2026-04-29

## Direction

Auction-history pricing should be variant-aware. A single artifact-level median hides the price differences the project owner observed on StalcraftDB for rows such as `wgko` / Inside Out Rose with `qlt`, `ptn`, and `bonus_properties`.

The official EXBO auction-history API with `additional=true` returns enough structured data to group pricing by source brackets:

- `qlt`: rarity / quality bracket. Current mapping used by UltimateBuild:
  - `0` → ordinary/common
  - `1` → unordinary/uncommon
  - `2` → special
  - `3` → rare
  - `4` → exclusive
  - `5` → legendary
  - `6` → unique
- `ptn`: StalcraftDB-displayed upgrade/point value. StalcraftDB examples showed `ptn: 15` rendered as `Upgrade level: 15` even when `upgrade_bonus: 0`.
- `bonus_properties`: selected bonus stat names. These should be canonicalized by sorting for grouping, while preserving raw source rows.
- Other fields (`ndmg`, `md_k`, `stats_random`, `it_transf_count`, `spawn_time`, event fields) stay source fields for modeling/audit and should not be silently discarded.

## Aggregation hierarchy

For each `item_id`, persist and export medians/averages for:

1. `artifact` — all usable transactions for the item.
2. `rarity.<name>` — compatibility row for current optimizer lookup; equivalent to grouping by `qlt`.
3. `qlt.<n>` — explicit source bracket row for every observed `qlt`.
4. `qlt.<n>|ptn.<m>` — source bracket row for every observed `qlt + ptn` pair.
5. `qlt.<n>|ptn.<m>|bonus.<sorted bonus list>` — bonus-property bucket when `bonus_properties` is present. This is the first layer for future bonus-property modeling.
6. `api:{...}` — exact source-field fingerprint row, preserving every normalized additional-field combination.

The median is the default pricing statistic. Average/min/p75/p90/sample counts are retained for audit and future tuning. A bucket with a single sale is still valid: its median and average are that sale price, and `sampleCount: 1` makes the low confidence visible instead of falling back to a worse broad estimate.

## Pull window

Do not limit variant modeling to 30 days. Use all available auction-history pages when building modeling datasets. Recent-window snapshots may still be useful for UI freshness, but bonus-property modeling needs maximum historical sample count.

Implementation convention: `--days all` disables the cutoff and pages until the API total/end is reached, bounded by `--max-pages` if supplied.

## Fallback policy

When a requested item variant has no direct samples:

1. Same item + same `qlt` + same `ptn` + same modeled bonus bucket.
2. Same item + same `qlt` + same `ptn`.
3. Same item + same `qlt`.
4. Similar item + same `qlt` + same `ptn` if possible.
5. Similar item + same `qlt`.
6. Same/nearby group median by `qlt`; closest bracket only when same bracket is missing.
7. Unknown/Infinity in strict mode if no defensible fallback exists.

Until similar-item families are explicitly defined, exported fallback metadata should distinguish exact item rows from category/global qlt fallback rows rather than pretending they are exact.

## Guardrails

- `ptn` can be used for source grouping and displayed upgrade-level pricing.
- `upgrade_bonus` is not the displayed upgrade level; nonzero values remain source-only unless separately proven.
- Bonus-property buckets are modelable from data, but exact optimizer stat effects are still a separate formula problem. Store their market medians now; only use them for optimizer exactness after stat mapping is implemented.
