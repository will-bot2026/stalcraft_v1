# `optimize-unlocked` Source-Truth Blocker

Status: blocked as of 2026-04-25.

`additionalStatPolicy: 'optimize-unlocked'` must not generate combinations until additional-stat slot legality is source-truthed. The current repo has enough evidence to prove selected additional stats affect calculator output, but not enough evidence to prove which selected additional stats are legal for every artifact instance.

## Evidence present

- `data/normalized/artifacts.json` and `data/normalized-exbo/artifacts.json` list each artifact's available `additionalStats`.
- `data/wiki-fixtures/artifact-calculator-source-truth.json` contains calculator snapshots where some additional stats are selected.
- `docs/research/wiki-calculator-screenshot-parity.md` verifies selected additional stats scale into artifact-panel stats and final build stats.
- `docs/stat-calculation.md` documents that selected additional stats are an artifact-instance dimension.

## Evidence missing

The current local data does not source-truth the unlock rules needed to generate legal combinations:

- how many additional-stat slots are unlocked at each quality, rarity, level, or other artifact state;
- whether slot count differs by artifact family, rarity, event/source, or enhancement level;
- whether all listed `additionalStats` are mutually selectable or whether some are exclusive;
- whether duplicate stat keys can ever be selected more than once on one artifact;
- whether the Wiki calculator permits zero, one, many, or all listed additional stats simultaneously for every artifact;
- whether EXBO item data carries hidden slot metadata outside the normalized fields currently extracted.

The local EXBO database clone was searched for `additionalStat`, `additional stat`, `unlock`, and related terms. It exposes artifact stat lists but no clear per-artifact selected-stat slot unlock rule. The only unrelated `unlock` matches found were achievement text.

## Required source truth

Before enabling `optimize-unlocked`, add fixtures or docs that prove the legal slot model. Acceptable evidence:

- STALCRAFT Wiki calculator screenshots/API captures showing additional-stat selection controls across representative artifacts, qualities, rarities, and levels;
- source data from the local EXBO database that explicitly encodes slot count and exclusivity rules;
- a generated fixture mapping artifact state to legal selected-stat count/options, with screenshots or API captures cited.

Until then, the guard in `generateArtifactCandidates` is intentional. `explicit-only` remains the only safe way to include selected additional stats because the caller supplies the exact selected keys.
