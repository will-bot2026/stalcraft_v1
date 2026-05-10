# STALCRAFT API additional variant mapping

Date: 2026-04-27

## Scope

This note documents the subset of auction `additional=true` rows that UltimateBuild maps into optimizer `variant_exact` price keys. The mapper is intentionally conservative: raw API source rows remain present, and only rows whose fields map to optimizer dimensions without hidden stat dimensions are also emitted as optimizer rows.

## API schema limit

The official API Reference at `https://eapi.stalcraft.net/reference` embeds `apiDescriptionUrl="/openapi"`; `https://eapi.stalcraft.net/openapi` is reachable. The OpenAPI document exposes auction history/lots and the `additional=true` query parameter, but `additional` itself is only typed as a generic object:

```json
"additional": {
  "type": "object"
}
```

The schema does not define field-level semantics for `additional.qlt`, `additional.ptn`, `additional.upgrade_bonus`, `additional.it_transf_count`, `additional.bonus_properties`, `additional.ndmg`, `additional.md_k`, `additional.stats_random`, or event/compensation fields. The general API docs also warn that the API is in early beta and endpoints may change without prior notice:

- https://eapi.stalcraft.net/
- https://eapi.stalcraft.net/reference
- https://eapi.stalcraft.net/openapi

Because the official schema does not prove those source dimensions, the implementation does not treat source API rows as optimizer-exact by default.

## Local evidence

Cached probes under `.cache/stalcraft-market-probe/*additional.json` contain 628 `additional` samples across `04yr`, `lj0j`, `qodk`, and `rn1z`.

Observed fields:

```text
it_transf_count: 240
qlt: 626
upgrade_bonus: 628
spawn_time: 425
md_k: 16
bonus_properties: 133
ndmg: 71
ptn: 138
stats_random: 12
```

Observed `ptn` values are integers from 2 through 15. Observed `qlt` values are `0..3` in this cache. Rows also show the API omits default-valued dimensions: many rows have only `{ qlt, upgrade_bonus }`, while others add `ptn` or `it_transf_count`.

The bundled 2026-04-27 full artifact snapshot has broader local evidence from `.cache/stalcraft-market/*additional.json`: 4974 source-exact additional rows, 530 source rows with nonzero `upgrade_bonus`, and only 4 nonzero rows whose fields are limited to optimizer-recognized fields (`ptn`, `qlt`, `upgrade_bonus`, optional `it_transf_count`). Those 4 values are artifact-specific (`0.03534`, `0.090168`, `0.054876003`, `0.0357`) rather than a discrete level signal. The maximum observed `upgrade_bonus` is `0.5`, but that row also carries hidden source dimensions such as `md_k`/`ndmg` and `bonus_properties`, so it is not mappable to an optimizer Q/level key without ignoring dimensions that affect stats.

## Game/database convention evidence

The local optimizer and calculator already model artifact quality, rarity, and level:

- rarity thresholds are documented in [docs/stat-calculation.md](../stat-calculation.md);
- `legalRaritiesForQuality` maps Q100/Q115/Q130/Q145/Q160/Q175 thresholds to adjacent rarity choices;
- positive artifact stats scale by quality and level, so level cannot be guessed from an unrelated field.

External game guides match the same bands: STALCRAFT artifact guides describe quality bands of 100-115, 115-130, 130-145, 145-160, and 160-175, and describe artifact transformation as an effectiveness reroll, separate from overcharge/upgrading. See:

- https://stalcrafthq.com/guides/spuds/artifacts
- https://stalcraft-x.fandom.com/wiki/Artifacts

That makes this mapping defensible for the safe subset:

- `qlt` is the source quality-category bracket index, not an upgrade level. The shared mapper encodes it generally as: `0 common/ordinary Q85-100`, `1 uncommon/unordinary Q100-115`, `2 special Q115-130`, `3 rare Q130-145`, `4 exclusive Q145-160`, `5 legendary Q160-175`, and `6 unique Q175-190`.
- `ptn` is the integer point offset inside that 15-point band. Missing `ptn` is treated as zero only inside this safe subset.
- optimizer quality is `85 + 15 * qlt + ptn`, restricted to `qlt >= 1`, integer `ptn` in `0..15`, and final quality `100..190`.
- `upgrade_bonus: 0` is required and maps to optimizer level `0`.
- `it_transf_count` is not optimizer level. The cache has `it_transf_count` on rows with `upgrade_bonus: 0`, and game docs describe transformations as rerolls, not overcharge levels. It is ignored for optimizer keying only when no other unmodeled field is present.
- rarity is included in optimizer keys, for example `q115|l0|rarity.special`, so threshold-adjacent variants are not collapsed into a less-specific key.

## +15 upgrade_bonus finding

No lossless local mapping from nonzero `additional.upgrade_bonus` to optimizer level was found. In particular, the local data does not prove that `upgrade_bonus: 0.5` means optimizer level `15`, and it does not provide a stable formula for deriving `level=15` from other nonzero values. Because optimizer level changes calculated stats and budget keys, treating any nonzero `upgrade_bonus` as +15 would fabricate exact prices.

Current rule: UltimateBuild emits optimizer `variant_exact` rows only for the proven zero-upgrade subset (`level=0`). All nonzero `upgrade_bonus` rows, including possible +15 artifacts, remain exported as `source_variant_exact` rows. A future +15 mapper must add source-backed proof that the source row's quality, rarity, level, and all hidden stat dimensions are losslessly represented by the optimizer key.

## Rows that remain source-only

Rows remain `source_variant_exact` only when any unmodeled or unsafe dimension is present:

- `upgrade_bonus` is nonzero, because the optimizer does not have a proven reverse map from bonus value to artifact level, including +15;
- `bonus_properties` is present, because selected additional stats are a separate optimizer dimension and legal unlock/selection is not fully source-truthed;
- `md_k`, `ndmg`, `stats_random`, event/compensation fields (`compens_2026_owner`, `compens_2026_ptn`, `ls_rc_start`, `ls_rc_duration`), or any other unknown field is present;
- `qlt=0`, because the current optimizer candidate policy is centered on Q100+ artifact variants and the low-tier exact quality is not proven by `ptn` in this cache;
- `ptn` or `it_transf_count` is non-integer or out of expected range.

## Current snapshot result

After the 2026-04-27 full artifact refresh, API requests were run in chunked batches with five minutes between chunks. The first half ran in six chunks; the remaining half resumed in three chunks after the first resume process was stopped once it had completed 30 items. 100 of 102 artifact IDs pulled successfully. `x22sxr4` / Wicked Hedgehog and `azq5t9so` returned HTTP 400 from the STALCRAFT auction history API. Exported snapshot result:

```text
optimizerExactVariantEntries: 422
sourceExactVariantEntries: 4974
exactVariantEntries: 5396
variantScope: quality-level-aware
```

The raw source rows are still exported as `source_variant_exact`. Optimizer-exact rows are the conservative Q/level/rarity rows used by optimizer price lookup before falling back to artifact-median estimates. Nonzero `upgrade_bonus` rows remain source-only, including possible +15 artifacts, because the full artifact snapshot still does not contain a lossless source field that maps them to optimizer `level=15`.
