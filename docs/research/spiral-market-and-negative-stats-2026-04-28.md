# Spiral market and harmful-stat follow-up

Date: 2026-04-28

## Scope

the project owner reported two issues:

- harmful/negative stats looked quantized to rarity endpoints or coarse quality steps instead of using the actual artifact quality percentage;
- NA Special Spiral (`gyq5`) pricing showed about `661k`, while the 30-day average should be just above `1M`.

## Harmful stat formula check

Source-truth references:

- `data/wiki-fixtures/artifact-calculator-source-truth.json`
- `docs/stat-calculation.md`
- `docs/research/calculation-updates-running-log.md`
- STALCRAFT Wiki Spiral item page: https://stalcraft.wiki/en/items/artefacts/gyq5
- StalcraftDB Spiral page: https://stalcraftdb.net/na/gyq5

The current `calculateNegativeRawStat` interpolation in `packages/stalcraft-core/src/index.ts` uses the actual decimal `assumption.quality` inside the selected rarity band. For example, a harmful stat with endpoints `0.85..1.00` at Q124.5 Special calculates:

```text
0.85 + (1.00 - 0.85) * ((124.5 - 115) / 15) = 0.945
```

That is not an endpoint (`0.85`/`1.00`) and not an integer-quality quantization. A regression test now locks this behavior in `tests/core.test.ts`.

The concrete bug found around "actual rarity percentage" had two parts:

1. Explicit qualities only accepted whole numbers, so a user asking for `124.5 quality` could not carry that decimal into the calculator. `packages/stalcraft-nlp/src/index.ts` and the web explicit-quality detector now accept decimal quality percentages. `tests/nlp.test.ts` covers this.
2. Exact-rarity web prompts without an explicit quality used a single endpoint per rarity. The optimizer now expands exact rarity prompts across the full integer `qlt`/`ptn` quality band (for example Special Q115..Q130), so harmful stats are calculated at the actual candidate quality rather than a collapsed category endpoint. `tests/web.test.ts` covers this.

Remaining caveat: broad budget-only web candidate domains still intentionally use a bounded cross-rarity grid unless the user requests a specific rarity/quality. This keeps optimization tractable and does not mean source rows are exact +15 mappings.

## Spiral NA market evidence

The refreshed local SQLite DB is `.cache/market-na-30d-refresh-2026-04-27T20-17-48-780Z.sqlite`. It already contains raw `auction_history_sample.raw_json` rows, so no EXBO repull was required for the fix. The static snapshot was regenerated from that local DB.

For `gyq5` in that DB:

```text
all raw rows: n=711, median=400000, average=1542354.257
qlt=2 / rarity.special: n=224, median=660830, average=1116306.607, p75=1800000, p90=2650000
qlt=2 bare/default rows: n=147, median=550000, average=584291.374
qlt=2 ptn5-8 one-add rows: n=17, median=800000, average=882582.118
qlt=2 ptn10 two-add rows: n=14, median=2000000, average=2014980.857
qlt=2 ptn15 three-add rows: n=42, median=2775000, average=2791267.143
```

Root cause: the app's `~661k` Special Spiral value was the qlt=2 30-day median, not the 30-day average the project owner was comparing against. The median is dragged down by many bare/default qlt=2 rows; the arithmetic average is just over `1.1M`, matching the report.

Fix: SQLite snapshots now persist `average_price` alongside `median_price`. Rarity-bracket optimizer prices use the 30-day average for conservative budgeting, while exact artifact and exact optimizer Q/level rows continue using medians. The exported static JSON carries:

```text
gyq5 rarity.special medianPrice=660830
gyq5 rarity.special averagePrice=1116306.607142857
gyq5 rarity.special optimizerPrice=1116306.607142857
gyq5 rarity.special optimizerPriceStatistic=average
```

This preserves honest semantics: the Special Spiral bracket is `rarity_bracket`, not exact +15, and source-only variants remain source-only when hidden API fields prevent lossless optimizer mapping.

## API/source findings

The local DB confirms `amount=1` for all 711 `gyq5` rows, so amount expansion is not a factor for this artifact. Pagination was already configured to collect pages until the 30-day cutoff; the persisted sample count is higher than the older 200-row snapshot and includes raw `additional` fields.

A controlled live request was run on 2026-04-28 against EXBO's auction-history API:

```text
region=NA item=gyq5 limit=200 offset=0 additional=true
```

It returned current Spiral rows with `additional.qlt`, `additional.ptn`, `additional.upgrade_bonus`, and `bonus_properties`. A paginated live probe through the 30-day cutoff returned the same pattern: Special (`qlt=2`) Spiral prices have a low raw median but an arithmetic average above 1M because upgraded/potential rows are mixed into the rarity category. Official EXBO docs still warn that the API is in early beta and endpoints can change without prior notice: https://eapi.stalcraft.net/

External sanity:

- STALCRAFT Wiki `gyq5` lists current Spiral stats as Movement `+0.85..+1%`, Running `+1.15..+1.35%`, Carry `+7.4..+8.7`, Radiation `+1.06..+1.25`.
- StalcraftDB exposes a Spiral auction history page with "Average price per day", but it is JavaScript-driven/page-limited from this environment, so it is sanity-only rather than exact equality.

## Reusable debug path

Use:

```sh
pnpm market:debug-artifact -- --db .cache/market-na-30d-refresh-2026-04-27T20-17-48-780Z.sqlite --item gyq5 --region NA --days 30
```

The report includes raw sample count, median, average, p75, p90, by-qlt breakdowns, latest snapshot rows, and common source grouping patterns.
