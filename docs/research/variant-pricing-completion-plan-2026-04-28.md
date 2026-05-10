# UltimateBuild variant pricing completion plan — 2026-04-28

## Why this exists

Previous reports used "fixed" too broadly. The deployed work fixed global decimal-quality parsing, rarity-domain enumeration, and rarity-bracket average pricing, but it did **not** prove every artifact/rarity/quality/upgrade variant is exact. This plan defines the standard for claiming the remaining work is complete.

## Completion criteria

Do not report "fully fixed" until all criteria are met:

1. **Data coverage**
   - Every normalized artifact ID has a 30-day NA auction-history pull attempt recorded.
   - Pulls are chunked/low-rate and resumable.
   - HTTP/API failures are preserved by item ID with exact status and not silently dropped.
   - Raw 30-day history samples are persisted in SQLite for offline inspection.

2. **Mapping proof**
   - For every API `additional` field combination promoted to optimizer pricing, there is a documented lossless mapping to optimizer dimensions.
   - If a field cannot be mapped losslessly, rows remain source-only and are excluded from optimizer-exact claims.
   - Nonzero `upgrade_bonus` must not be mapped to +5/+10/+15 unless proven from source data/API docs/samples.

3. **Pricing behavior**
   - Optimizer-exact rows use exact variant prices only where the mapping is proven.
   - Rarity/category bracket rows retain median and average; optimizer uses bracket average only where precision is explicitly `rarity_bracket`.
   - Fallback estimates are labeled as estimates and never called exact.

4. **Sample testing**
   - Automated tests cover representative artifacts across all rarity brackets.
   - Tests include explicit decimal quality, rarity-only bracket search, exact +0 rows, source-only unmapped rows, and any proven upgraded rows.
   - At least one generated audit report summarizes coverage by item, rarity, qlt, ptn, upgrade_bonus, pricingPrecision, and unsupported fields.

5. **Live verification**
   - Full test/typecheck/build/benchmark suite passes.
   - Snapshot exported and production deployed.
   - Live `/market/latest-NA.json` SHA-256 matches local.
   - Live metadata and representative rows match the audit report.
   - Commit pushed to `main`.
   - 24h follow-up scheduled.

## Required reporting language

Use these terms precisely:

- `optimizer-exact`: lossless API/source mapping to optimizer item + quality + level + optional rarity.
- `rarity-bracket`: API `additional.qlt` supports rarity/category but not exact optimizer quality/level.
- `source-only`: API row is exact as source payload, but contains unmapped dimensions not safe for optimizer-exact use.
- `estimated`: deterministic fallback when no exact/bracket price exists.

Never say "all items fixed" unless the coverage audit shows no unresolved optimizer-relevant dimensions, or the unresolved dimensions are explicitly impossible to map from the available API and are not being represented as exact.

## Execution plan

1. Audit current snapshot/SQLite coverage.
2. Promote a reusable chunked pull script/tool instead of temporary one-offs.
3. Pull first half of artifact catalog, item-by-item inside chunks, 5 minutes between chunks.
4. Pull second half the same way.
5. Re-run mapping analysis on the full persisted dataset.
6. Implement only proven mappings; document source-only exclusions.
7. Generate coverage report and sample-test matrix.
8. Validate, deploy, live verify, commit/push, schedule follow-up.
