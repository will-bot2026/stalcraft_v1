# UltimateBuild Trait Parity Matrix

Generated from repository data after the project owner supplied Wiki positive/negative property screenshots. This is a planning/source-truth handoff; implementation tasks are queued on the `ultimatebuild` Kanban board.

## Current code findings

- `data/normalized/artifacts.json` already contains 39 unique stat labels, including the screenshot traits.
- `data/normalized/stat-catalog.json` contains 34 catalog rows. The only artifact-data labels missing catalog rows are Polyhedron special mechanics.
- `apps/web/src/routes/+page.server.ts` exposes only 16 objective dropdown options today.
- `selectedObjectives()` currently emits `direction: 'maximize'` for every selected objective.
- The Aggregated result panel is hardcoded to a small whitelist: mobility 4, survivability 4, utility 4, and `WIKI_DANGER_LIMITS` environmental lines.
- Core aggregation is generic: `calculateFinalBuildStats()` sums container stats and final artifact stats. Missing final display is primarily a result-view grouping/exposure bug.
- `ACCUMULATION_STATS` includes Radiation, Biological infection, Psy-emissions, Bleeding, Temperature, Frost. `CONTAINER_PROTECTABLE_STATS` includes Radiation, Biological infection, Psy-emissions, Bleeding, Temperature. `WIKI_DANGER_LIMITS` currently excludes Bleeding/Burning.

## Parity matrix

| Label | Key/status | In stat catalog | Objective visible now | Final panel visible now | Proposed direction | Proposed group | Container handling | Source-truth status |
|---|---|---:|---:|---:|---|---|---|---|
| Vitality | `stalker.artefact_properties.factor.health_bonus` | yes | yes | yes | maximize | Survivability | normal additive | covered by existing data; regression fixture recommended |
| Resistance to chemicals | `stalker.artefact_properties.factor.chemical_burn_dmg_factor` | yes | no | no | maximize | Survivability/protection | normal additive | data present; needs exposure/grouping verification |
| Stability | `stalker.artefact_properties.factor.stopping_protection` | yes | no | no | maximize | Survivability/protection | normal additive | data present; needs exposure/grouping verification |
| Periodic healing | `stalker.artefact_properties.factor.artefakt_heal` | yes | yes | yes | maximize | Healing | normal additive | covered by existing data; regression fixture recommended |
| Reaction to burns | `stalker.artefact_properties.factor.reaction_to_burn` | yes | no | no | maximize | Reactions | normal additive | data present; needs exposure/grouping verification |
| Radiation protection | `stalker.artefact_properties.factor.radiation_protection` | yes | no | no | maximize | Survivability/protection | normal additive | data present; needs exposure/grouping verification |
| Thermal protection | `stalker.artefact_properties.factor.thermal_protection` | yes | no | no | maximize | Survivability/protection | normal additive | data present; needs exposure/grouping verification |
| Psy-Emission protection | `stalker.artefact_properties.factor.psycho_protection` | yes | no | no | maximize | Survivability/protection | normal additive | data present; needs exposure/grouping verification |
| Sway | `stalker.artefact_properties.factor.wiggle_bonus` | yes | no | no | minimize | Weapon handling | normal additive | needs Wiki check for lower-is-better display/scaling; data present |
| Stamina regeneration | `stalker.artefact_properties.factor.stamina_regeneration_bonus` | yes | yes | yes | maximize | Mobility | normal additive | covered by existing data; regression fixture recommended |
| Bleeding | `stalker.artefact_properties.factor.bleeding_accumulation` | yes | no | no | minimize | Accumulations/danger | accumulation, container-protected | needs Wiki check for safety cap/final panel behavior |
| Bullet resistance | `stalker.artefact_properties.factor.bullet_dmg_factor` | yes | yes | yes | maximize | Survivability/protection | normal additive | covered by existing data; regression fixture recommended |
| Recoil | `stalker.artefact_properties.factor.recoil_bonus` | yes | no | yes | minimize | Weapon handling | normal additive | needs Wiki check for lower-is-better display/scaling; data present |
| Laceration protection | `stalker.artefact_properties.factor.tear_dmg_factor` | yes | yes | yes | maximize | Survivability/protection | normal additive | covered by existing data; regression fixture recommended |
| Healing effectiveness | `stalker.artefact_properties.factor.heal_efficiency` | yes | yes | yes | maximize | Healing | normal additive | covered by existing data; regression fixture recommended |
| Bioinfection protection | `stalker.artefact_properties.factor.biological_protection` | yes | no | no | maximize | Survivability/protection | normal additive | data present; needs exposure/grouping verification |
| Reaction to chemical burns | `stalker.artefact_properties.factor.reaction_to_chemical_burn` | yes | no | no | maximize | Reactions | normal additive | data present; needs exposure/grouping verification |
| Reaction to laceration | `stalker.artefact_properties.factor.reaction_to_tear` | yes | no | no | maximize | Reactions | normal additive | data present; needs exposure/grouping verification |
| Psy-emissions | `stalker.artefact_properties.factor.psycho_accumulation` | yes | yes | yes | minimize | Accumulations/danger | accumulation, container-protected, danger-capped | covered by existing data; regression fixture recommended |
| Health regeneration | `stalker.artefact_properties.factor.regeneration_bonus` | yes | no | no | maximize | Healing | normal additive | data present; needs exposure/grouping verification |
| Reaction to electricity | `stalker.artefact_properties.factor.reaction_to_electroshock` | yes | no | no | maximize | Reactions | normal additive | data present; needs exposure/grouping verification |
| Resistance to electricity | `stalker.artefact_properties.factor.electra_dmg_factor` | yes | no | no | maximize | Survivability/protection | normal additive | data present; needs exposure/grouping verification |
| Carry weight | `stalker.artefact_properties.factor.max_weight_bonus` | yes | yes | yes | maximize | Mobility | normal additive | covered by existing data; regression fixture recommended |
| Resistance to fire | `stalker.artefact_properties.factor.burn_dmg_factor` | yes | no | no | maximize | Survivability/protection | normal additive | data present; needs exposure/grouping verification |
| Bleeding protection | `stalker.artefact_properties.factor.bleeding_protection` | yes | no | no | maximize | Survivability/protection | normal additive | data present; needs exposure/grouping verification |
| Temperature | `stalker.artefact_properties.factor.thermal_accumulation` | yes | yes | yes | minimize | Accumulations/danger | accumulation, container-protected, danger-capped | covered by existing data; regression fixture recommended |
| Burning | `stalker.artefact_properties.factor.combustion_accumulation` | yes | no | no | minimize | Accumulations/danger | normal additive | needs Wiki check for safety cap/final panel behavior |
| Explosion protection | `stalker.artefact_properties.factor.explosion_dmg_factor` | yes | yes | yes | maximize | Survivability/protection | normal additive | covered by existing data; regression fixture recommended |
| Stamina | `stalker.artefact_properties.factor.stamina_bonus` | yes | yes | yes | maximize | Mobility | normal additive | covered by existing data; regression fixture recommended |
| Movement speed | `stalker.artefact_properties.factor.speed_modifier` | yes | yes | yes | maximize | Mobility | normal additive | covered by existing data; regression fixture recommended |
| Running speed | `stalker.artefact_properties.factor.sprint_speed_modifier` | yes | yes | yes | maximize | Mobility | normal additive | covered by existing data; regression fixture recommended |
| Radiation | `stalker.artefact_properties.factor.radiation_accumulation` | yes | yes | yes | minimize | Accumulations/danger | accumulation, container-protected, danger-capped | covered by existing data; regression fixture recommended |
| Biological infection | `stalker.artefact_properties.factor.biological_accumulation` | yes | yes | yes | minimize | Accumulations/danger | accumulation, container-protected, danger-capped | covered by existing data; regression fixture recommended |
| Triggers when | `stalker.tooltip.item.lifesaver_sniper.info.trigger_damage` | no | no | no | minimize | Special mechanics | normal additive | needs Wiki verification before normal optimization; special mechanic row |
| Reduces damage by | `stalker.tooltip.item.lifesaver_sniper.info.blocking_damage` | no | no | no | maximize | Special mechanics | normal additive | needs Wiki verification before normal optimization; special mechanic row |
| Reload | `stalker.tooltip.item.lifesaver.info.recharge` | no | no | no | minimize | Special mechanics | normal additive | needs Wiki verification before normal optimization; special mechanic row |
| Charge required to activate | `stalker.tooltip.item.lifesaver.info.cost` | no | no | no | minimize | Special mechanics | normal additive | needs Wiki verification before normal optimization; special mechanic row |
| Frost | `stalker.artefact_properties.factor.frost_accumulation` | yes | yes | yes | minimize | Accumulations/danger | accumulation, danger-capped | covered by existing data; regression fixture recommended |

## Implementation sequence encoded in Kanban

1. `t_a431a579` — trait parity matrix and source-truth checklist.
2. `t_4fcb60ce` — add complete stat catalog metadata for screenshot traits.
3. `t_1c23bea9` — expand objective dropdown and add default objective direction.
4. `t_ec901d5e` — render complete grouped final aggregated stats panel.
5. `t_29cfd507` — source-truth tricky formulas and safety caps.
6. `t_ca04182b` — add trait expansion parity and regression tests.
7. `t_20f746af` — reviewer proof pass.

## Acceptance criteria for downstream tasks

- Every screenshot label either maps to a normal stat catalog row or is explicitly marked as a special mechanic.
- Dropdown/objective search includes every normal stat, not only the current 16 options.
- Objective direction is metadata-driven; lower-is-better and harmful accumulations no longer maximize by accident.
- Aggregated result panel renders non-zero final stats from the final stat map using catalog groups.
- Bleeding/Burning/Recoil/Sway/Polyhedron mechanics are verified against Wiki before formula/safety assumptions are changed.
- Tests prove label coverage, objective direction, final-panel grouping, and calculator parity for known weird families.
