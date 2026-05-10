# STALCRAFT auction `additional` field research

Date: 2026-04-28
Repo: `<local-project-path>`
Dataset: `.cache/market-full-2026-04-28.sqlite`, NA 30-day auction history, `additional=true`

## Question

Research these unmapped auction-history `additional` fields and decide whether UltimateBuild should promote any of them into optimizer-exact pricing, adjust source-only handling, or update labels/docs/tests:

- `bonus_properties`
- `ndmg`
- `md_k`
- `stats_random`
- event/compensation fields (`compens_2026_owner`, `compens_2026_ptn`, `ls_rc_start`, `ls_rc_duration`)

## Official API result

`https://eapi.stalcraft.net/reference` embeds `apiDescriptionUrl="/openapi"`.

`https://eapi.stalcraft.net/openapi` is reachable and documents auction endpoints:

- `/{region}/auction/{item}/history`
- `/{region}/auction/{item}/lots`

Both expose `additional` as an untyped object:

```json
"additional": {
  "type": "object"
}
```

The OpenAPI schema does **not** define field-level semantics for `qlt`, `ptn`, `upgrade_bonus`, `bonus_properties`, `ndmg`, `md_k`, `stats_random`, or compensation/time fields. Therefore official docs do not support adding a new lossless optimizer mapping for those fields.

## Third-party/public source result

`Blika/StalcraftAuctionMonitor` confirms `qlt` and `ptn` are practical auction filters:

- README: `qlt` range `-1..5`, `ptn` range `-1..15`, `-1` means any.
- Source calls `/auction/{item}/history?additional=true&limit=200` and filters `additional.qlt` and `additional.ptn`.
- Display helper prefixes rarity from `qlt` and appends `+<ptn>`.

This supports that `qlt`/`ptn` are source-visible artifact variant dimensions, but it does not document or prove the semantics of `bonus_properties`, `ndmg`, `md_k`, `stats_random`, `upgrade_bonus`, or event fields.

Public search also surfaced STALCRAFT artifact guides/discussions stating that artifact quality/rarity and overcharge upgrade level are independent. That is consistent with not mapping arbitrary nonzero `upgrade_bonus` floats to optimizer `level=15`.

## Full DB field inventory

From 21,272 persisted raw history rows:

| Field | Rows | Items | Interpretation from data | Mapping decision |
|---|---:|---:|---|---|
| `qlt` | 21,034 | 99 | Quality/rarity category index (`0..5` observed in full DB, `6` supported by mapper) | Safe only as bracket/category input |
| `ptn` | 3,355 | 91 | Integer `1..15`, heavily `15`; source-visible variant point inside category/potential display | Safe only with `qlt` + `upgrade_bonus:0` + no modifier fields |
| `upgrade_bonus` | 21,272 | 99 | Mostly `0`; nonzero is many small floats, not a discrete level enum | Only `0` maps to optimizer level `0`; nonzero stays source-only |
| `bonus_properties` | 3,265 | 90 | Selected bonus stat names such as `SPEED_MOD`, `STAMINA_REGENERATION`, `BULLET_DMG`, `HEALTH_BONUS` | Source-only; hidden selected-stat dimension |
| `ndmg` | 2,159 | 88 | Float modifier values; co-occurs with bonus/ptn rows | Source-only; unmodeled stat scalar |
| `md_k` | 446 | 72 | Float modifier values; co-occurs with bonus/ptn rows | Source-only; unmodeled scalar |
| `stats_random` | 1,558 | 95 | Positive/negative float random-roll scalar | Source-only; unmodeled random stat roll |
| `compens_2026_owner` | 6 | 2 | Owner names on event/compensation rows | Source-only; not optimizer stat dimension |
| `compens_2026_ptn` | 6 | 2 | Event/compensation ptn-like values `5/10/15` | Source-only; not enough proof and tied to owner metadata |
| `ls_rc_start` | 49 | 1 | Timestamp-like values on one item (`ljpq`) | Source-only; event/time metadata |
| `ls_rc_duration` | 49 | 1 | Duration-like values on one item (`ljpq`) | Source-only; event/time metadata |

Common fingerprints:

- `qlt|upgrade_bonus`: 14,542 rows
- `it_transf_count|qlt|upgrade_bonus`: 1,734 rows
- `bonus_properties|it_transf_count|ndmg|ptn|qlt|upgrade_bonus`: 1,256 rows
- `qlt|stats_random|upgrade_bonus`: 1,047 rows
- `bonus_properties|it_transf_count|ptn|qlt|upgrade_bonus`: 999 rows

Rows that look clean enough for optimizer exactness are still limited:

- Clean candidate rows with only `qlt`, optional `ptn`, `upgrade_bonus:0`, optional `it_transf_count`: 12,968 raw rows.
- Rows blocked even though `upgrade_bonus:0` because they include modifier/event fields: 3,472 raw rows.

## Decision

No new optimizer-exact mapping should be added for these fields.

The current conservative mapper is correct in principle:

1. Promote only rows whose source fields are limited to `qlt`, optional `ptn`, `upgrade_bonus:0`, and optional `it_transf_count`.
2. Treat `qlt` as quality-category bracket and `ptn` as the 0..15 source point/potential within that category only for the safe subset.
3. Keep all rows with `bonus_properties`, `ndmg`, `md_k`, `stats_random`, compensation fields, `ls_rc_*`, or nonzero `upgrade_bonus` as `source_variant_exact` only.
4. Continue using rarity/category average rows for optimizer budgeting when exact Q/level rows are unavailable.
5. Do not claim +15/upgraded exact pricing from nonzero `upgrade_bonus` unless a future source proves a lossless formula.

## Update made from this research

Added regression coverage so `mapAuctionAdditionalToOptimizerVariant` explicitly rejects optimizer promotion for rows containing:

- `bonus_properties`
- `ndmg`
- `md_k`
- `stats_random`
- `compens_2026_owner` / `compens_2026_ptn`
- `ls_rc_start` / `ls_rc_duration`

No production snapshot/export change is needed unless tests reveal a mismatch, because the current mapper already blocks unknown fields via an allowlist.
