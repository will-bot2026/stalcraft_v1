import { describe, expect, it } from 'vitest';
import { ARTIFACT_STAT_CATALOG, objectiveDirectionForStatKey, objectiveOptionsFromCatalog, resolveStatAliases } from '../packages/stalcraft-nlp/src/index.js';

describe('artifact stat catalog', () => {
  it('covers every artifact trait observed in the STALCRAFT Wiki artifact snapshot, including frost', () => {
    expect(ARTIFACT_STAT_CATALOG.map((entry) => entry.key)).toEqual([
      'stalker.artefact_properties.factor.artefakt_heal',
      'stalker.artefact_properties.factor.biological_accumulation',
      'stalker.artefact_properties.factor.biological_protection',
      'stalker.artefact_properties.factor.bleeding_accumulation',
      'stalker.artefact_properties.factor.bleeding_protection',
      'stalker.artefact_properties.factor.bullet_dmg_factor',
      'stalker.artefact_properties.factor.burn_dmg_factor',
      'stalker.artefact_properties.factor.chemical_burn_dmg_factor',
      'stalker.artefact_properties.factor.combustion_accumulation',
      'stalker.artefact_properties.factor.electra_dmg_factor',
      'stalker.artefact_properties.factor.explosion_dmg_factor',
      'stalker.artefact_properties.factor.frost_accumulation',
      'stalker.artefact_properties.factor.heal_efficiency',
      'stalker.artefact_properties.factor.health_bonus',
      'stalker.artefact_properties.factor.max_weight_bonus',
      'stalker.artefact_properties.factor.psycho_accumulation',
      'stalker.artefact_properties.factor.psycho_protection',
      'stalker.artefact_properties.factor.radiation_accumulation',
      'stalker.artefact_properties.factor.radiation_protection',
      'stalker.artefact_properties.factor.reaction_to_burn',
      'stalker.artefact_properties.factor.reaction_to_chemical_burn',
      'stalker.artefact_properties.factor.reaction_to_electroshock',
      'stalker.artefact_properties.factor.reaction_to_tear',
      'stalker.artefact_properties.factor.recoil_bonus',
      'stalker.artefact_properties.factor.regeneration_bonus',
      'stalker.artefact_properties.factor.speed_modifier',
      'stalker.artefact_properties.factor.sprint_speed_modifier',
      'stalker.artefact_properties.factor.stamina_bonus',
      'stalker.artefact_properties.factor.stamina_regeneration_bonus',
      'stalker.artefact_properties.factor.stopping_protection',
      'stalker.artefact_properties.factor.tear_dmg_factor',
      'stalker.artefact_properties.factor.thermal_accumulation',
      'stalker.artefact_properties.factor.thermal_protection',
      'stalker.artefact_properties.factor.wiggle_bonus',
      'stalker.tooltip.item.lifesaver_sniper.info.trigger_damage',
      'stalker.tooltip.item.lifesaver_sniper.info.blocking_damage',
      'stalker.tooltip.item.lifesaver.info.recharge',
      'stalker.tooltip.item.lifesaver.info.cost',
    ]);
  });

  it('maps owner shorthand and wiki labels to canonical stat keys', () => {
    expect(resolveStatAliases('movement speed running speed sprint speed carry weight vitality healing bio rad psy frost temperature')).toEqual([
      'stalker.artefact_properties.factor.speed_modifier',
      'stalker.artefact_properties.factor.sprint_speed_modifier',
      'stalker.artefact_properties.factor.max_weight_bonus',
      'stalker.artefact_properties.factor.health_bonus',
      'stalker.artefact_properties.factor.heal_efficiency',
      'stalker.artefact_properties.factor.biological_accumulation',
      'stalker.artefact_properties.factor.radiation_accumulation',
      'stalker.artefact_properties.factor.psycho_accumulation',
      'stalker.artefact_properties.factor.frost_accumulation',
      'stalker.artefact_properties.factor.thermal_accumulation',
    ]);
  });

  it('marks source-truthed tricky traits and keeps Polyhedron mechanics out of normal objective selection', () => {
    const byKey = new Map(ARTIFACT_STAT_CATALOG.map((entry) => [entry.key, entry]));
    const wikiVerifiedKeys = [
      'stalker.artefact_properties.factor.bleeding_accumulation',
      'stalker.artefact_properties.factor.combustion_accumulation',
      'stalker.artefact_properties.factor.recoil_bonus',
      'stalker.artefact_properties.factor.wiggle_bonus',
      'stalker.tooltip.item.lifesaver_sniper.info.trigger_damage',
      'stalker.tooltip.item.lifesaver_sniper.info.blocking_damage',
      'stalker.tooltip.item.lifesaver.info.recharge',
      'stalker.tooltip.item.lifesaver.info.cost',
    ];

    for (const key of wikiVerifiedKeys) {
      expect(byKey.get(key)?.sourceTruthStatus, key).toBe('wiki-verified');
    }

    expect(objectiveDirectionForStatKey('stalker.artefact_properties.factor.bleeding_accumulation')).toBe('minimize');
    expect(objectiveDirectionForStatKey('stalker.artefact_properties.factor.combustion_accumulation')).toBe('minimize');
    expect(objectiveDirectionForStatKey('stalker.artefact_properties.factor.recoil_bonus')).toBe('minimize');
    expect(objectiveDirectionForStatKey('stalker.artefact_properties.factor.wiggle_bonus')).toBe('minimize');
    expect(objectiveDirectionForStatKey('stalker.tooltip.item.lifesaver_sniper.info.blocking_damage')).toBe('maximize');

    const objectiveKeys = new Set(objectiveOptionsFromCatalog().map((entry) => entry.value));
    expect(objectiveKeys).toContain('stalker.artefact_properties.factor.bleeding_accumulation');
    expect(objectiveKeys).toContain('stalker.artefact_properties.factor.combustion_accumulation');
    expect(objectiveKeys).toContain('stalker.artefact_properties.factor.recoil_bonus');
    expect(objectiveKeys).toContain('stalker.artefact_properties.factor.wiggle_bonus');
    expect(objectiveKeys).not.toContain('stalker.tooltip.item.lifesaver_sniper.info.trigger_damage');
    expect(objectiveKeys).not.toContain('stalker.tooltip.item.lifesaver_sniper.info.blocking_damage');
    expect(objectiveKeys).not.toContain('stalker.tooltip.item.lifesaver.info.recharge');
    expect(objectiveKeys).not.toContain('stalker.tooltip.item.lifesaver.info.cost');
  });
});
