# UltimateBuild full-catalog market coverage audit — 2026-04-28

## Scope

- Region: NA
- Window: 30-day auction history
- Pull mode: item-by-item chunked pulls with 5-minute spacing between chunks
- DB: `.cache/market-full-2026-04-28.sqlite`
- First-half log: `.cache/market-full-2026-04-28-first.jsonl`
- Second-half log: `.cache/market-full-2026-04-28-second.jsonl`

## Pull result

- Normalized artifact count: 102
- Successful item pull rows: 101
- Failed item pull rows: 3
- Items with raw samples: 99
- Raw history rows persisted: 21272
- Items with no usable samples: x22sxr4, rnkl, azq5t9so
- Invalid/unknown snapshot items: x22sxr4, rnkl, azq5t9so

Note: the pull status includes the earlier smoke test attempts. The catalog run itself completed 100/102 items; `x22sxr4` and `azq5t9so` returned STALCRAFT HTTP 400. `rnkl` completed/exists but has no usable samples.

## Exported snapshot

- Snapshot rows: 6368
- Optimizer-exact Q/level rows: 423
- API source-variant rows: 5328
- Rarity/category bracket rows: 515
- Optimizer-exact upgrade bonus values: [0]
- Rarity bracket precision: `rarity_bracket_30_day_average_from_api_qlt_for_optimizer_with_median_retained`
- Source-variant precision: `api_additional_exact_not_optimizer_q_level`

## API `additional` field evidence

Raw additional key counts:

```json
{
  "bonus_properties": 3265,
  "ndmg": 2159,
  "it_transf_count": 4911,
  "qlt": 21034,
  "ptn": 3355,
  "upgrade_bonus": 21272,
  "spawn_time": 18184,
  "md_k": 446,
  "stats_random": 1558,
  "ls_rc_start": 49,
  "ls_rc_duration": 49,
  "compens_2026_owner": 6,
  "compens_2026_ptn": 6
}
```

Top raw fingerprints:

```json
[
  {
    "key": "qlt|spawn_time|upgrade_bonus",
    "count": 12888
  },
  {
    "key": "qlt|upgrade_bonus",
    "count": 1654
  },
  {
    "key": "it_transf_count|qlt|spawn_time|upgrade_bonus",
    "count": 1342
  },
  {
    "key": "qlt|spawn_time|stats_random|upgrade_bonus",
    "count": 987
  },
  {
    "key": "bonus_properties|it_transf_count|ndmg|ptn|qlt|spawn_time|upgrade_bonus",
    "count": 973
  },
  {
    "key": "bonus_properties|it_transf_count|ptn|qlt|spawn_time|upgrade_bonus",
    "count": 782
  },
  {
    "key": "it_transf_count|qlt|upgrade_bonus",
    "count": 392
  },
  {
    "key": "bonus_properties|it_transf_count|ndmg|ptn|qlt|upgrade_bonus",
    "count": 283
  },
  {
    "key": "bonus_properties|it_transf_count|md_k|ndmg|ptn|qlt|spawn_time|upgrade_bonus",
    "count": 255
  },
  {
    "key": "bonus_properties|it_transf_count|ptn|qlt|upgrade_bonus",
    "count": 217
  },
  {
    "key": "it_transf_count|qlt|spawn_time|stats_random|upgrade_bonus",
    "count": 202
  },
  {
    "key": "upgrade_bonus",
    "count": 170
  }
]
```

Top nonzero-ish `upgrade_bonus` distribution entries:

```json
[
  {
    "key": "0",
    "count": 20629
  },
  {
    "key": "0.0017",
    "count": 43
  },
  {
    "key": "0.0034",
    "count": 19
  },
  {
    "key": "0.0042",
    "count": 18
  },
  {
    "key": "0.0084",
    "count": 14
  },
  {
    "key": "0.0051",
    "count": 7
  },
  {
    "key": "0.012599999",
    "count": 6
  },
  {
    "key": "0.002",
    "count": 4
  },
  {
    "key": "0.0033",
    "count": 4
  },
  {
    "key": "0.006",
    "count": 4
  },
  {
    "key": "0.0102",
    "count": 4
  },
  {
    "key": "0.0168",
    "count": 4
  },
  {
    "key": "0.001764",
    "count": 3
  },
  {
    "key": "0.004032",
    "count": 3
  },
  {
    "key": "0.0066",
    "count": 3
  },
  {
    "key": "0.0068",
    "count": 3
  },
  {
    "key": "0.008400001",
    "count": 3
  },
  {
    "key": "0.012000001",
    "count": 3
  },
  {
    "key": "0.016320001",
    "count": 3
  },
  {
    "key": "0.0198",
    "count": 3
  },
  {
    "key": "0.025199998",
    "count": 3
  },
  {
    "key": "0.0012",
    "count": 2
  },
  {
    "key": "0.00144",
    "count": 2
  },
  {
    "key": "0.00153",
    "count": 2
  },
  {
    "key": "0.002074",
    "count": 2
  }
]
```

## Mapping conclusion

The full pull did **not** prove a safe global mapping from nonzero `additional.upgrade_bonus` to optimizer levels like +5/+10/+15.

Evidence:

1. `upgrade_bonus` is a floating scalar with many artifact/source-specific values, not a discrete level enum.
2. The most common safe value is `0` (20629 rows).
3. Nonzero rows frequently appear with other unmapped source dimensions such as `bonus_properties`, `ndmg`, `md_k`, and `stats_random`.
4. Rows containing unmapped dimensions are retained as source-variant rows but are not promoted to optimizer-exact Q/level pricing.

Therefore the implemented global behavior is:

- promote only losslessly mapped +0 optimizer variants to `variant_exact`;
- use `qlt` rarity/category rows as `rarity_bracket` prices with average as optimizer price and median retained;
- preserve all API source variants for audit/debug;
- keep nonzero `upgrade_bonus` / possible upgraded artifacts source-only until a source/API proof maps them losslessly.

This is the honest completion boundary. Calling nonzero `upgrade_bonus` rows exact +15 prices would be a fabricated mapping.
