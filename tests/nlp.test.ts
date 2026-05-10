import { describe, expect, it } from 'vitest';
import { objectiveDirectionForStatKey, objectiveOptionsFromCatalog, parseOptimizationPrompt } from '../packages/stalcraft-nlp/src/index.js';

describe('natural language parser', () => {
  it('maps Hive speed/running/carry budget prompt into a strict structured request', () => {
    const request = parseOptimizationPrompt('Generate a Hive build for movement speed plus running speed plus carry weight under 5 million');

    expect(request.containerId).toBe('p92d');
    expect(request.constraints.maxBudget).toBe(5_000_000);
    expect(request.budget.region).toBe('NA');
    expect(request.budget.priceMode).toBe('history_median');
    expect(request.artifactAssumption).toEqual({ level: 0, quality: 100 });
    expect(request.objectives.map((term) => term.statKey)).toEqual([
      'stalker.artefact_properties.factor.speed_modifier',
      'stalker.artefact_properties.factor.sprint_speed_modifier',
      'stalker.artefact_properties.factor.max_weight_bonus',
    ]);
  });

  it('parses rarity, quality, and upgrade level constraints', () => {
    const request = parseOptimizationPrompt('best ArcticSafe movement speed using rare or lower artifacts at 150 quality +15 under 5m');

    expect(request.artifactAssumption).toEqual({ level: 15, quality: 150, rarity: 'rarity.rare' });
    expect(request.constraints.rarity).toEqual({ mode: 'at_or_below', rarity: 'rarity.rare' });
    expect(request.constraints.maxBudget).toBe(5_000_000);
  });

  it('keeps decimal quality percentages instead of quantizing explicit artifact quality', () => {
    const request = parseOptimizationPrompt('best movement speed at 124.5 quality special artifacts');

    expect(request.artifactAssumption).toEqual({ level: 0, quality: 124.5, rarity: 'rarity.special' });
  });

  it('treats legendary as a rarity/category unless quality is explicit', () => {
    const request = parseOptimizationPrompt('legendary speed build with carry weight +15');

    expect(request.artifactAssumption).toEqual({ level: 15, quality: 100, rarity: 'rarity.legendary' });
    expect(request.constraints.rarity).toEqual({ mode: 'exact', rarity: 'rarity.legendary' });
  });

  it('does not mistake maximize wording for max quality', () => {
    const request = parseOptimizationPrompt('Generate a CRAW-6 build that maximizes movement speed');

    expect(request.artifactAssumption).toEqual({ level: 0, quality: 100 });
  });

  it('parses varied non-Berloga containers', () => {
    expect(parseOptimizationPrompt('fastest movement build under 5m for Freezer').containerId).toBe('j34l');
    expect(parseOptimizationPrompt('best carry weight build below 3 million in Overton').containerId).toBe('w42z');
    expect(parseOptimizationPrompt('safe survivability build budget of 10m using Chitin').containerId).toBe('yq90');
  });

  it('maps generic survivability wording to Vitality', () => {
    const request = parseOptimizationPrompt('highest survivability build under 10 million without environmental damage using Chitin');

    expect(request.containerId).toBe('yq90');
    expect(request.constraints.maxBudget).toBe(10_000_000);
    expect(request.objectives.map((term) => term.statKey)).toContain('stalker.artefact_properties.factor.health_bonus');
  });

  it('maps fastest movement to a movement plus running composite objective', () => {
    const request = parseOptimizationPrompt('fastest movement build under 5m');

    expect(request.objectives.map((term) => term.statKey)).toEqual([
      'stalker.artefact_properties.factor.speed_modifier',
      'stalker.artefact_properties.factor.sprint_speed_modifier',
    ]);
    expect(request.objectiveMetadata).toMatchObject({
      formula: 'Movement speed + Running speed',
    });
  });

  it('keeps running speed prompts as running-speed-only objectives', () => {
    const request = parseOptimizationPrompt('best sprint speed build');

    expect(request.objectives.map((term) => term.statKey)).toEqual([
      'stalker.artefact_properties.factor.sprint_speed_modifier',
    ]);
    expect(request.objectiveMetadata).toBeUndefined();
  });

  it('parses upper and lower budget wording without mixing semantics', () => {
    expect(parseOptimizationPrompt('Best bullet resistance build under 50 million').constraints).toMatchObject({ maxBudget: 50_000_000 });
    expect(parseOptimizationPrompt('best carry weight within 750k').constraints).toMatchObject({ maxBudget: 750_000 });
    expect(parseOptimizationPrompt('Best movement speed over 40 million').constraints).toMatchObject({ minBudget: 40_000_000 });
    expect(parseOptimizationPrompt('fast build at least 1.5m').constraints).toMatchObject({ minBudget: 1_500_000 });
  });

  it('maps direct vitality wording to Vitality', () => {
    const request = parseOptimizationPrompt('best vitality build under 50 million');

    expect(request.objectives.map((term) => term.statKey)).toContain('stalker.artefact_properties.factor.health_bonus');
  });

  it('uses Q175 as the max quality shorthand instead of unsupported Q190', () => {
    expect(parseOptimizationPrompt('maxed movement build').artifactAssumption.quality).toBe(175);
    expect(parseOptimizationPrompt('perfect bullet resistance build').artifactAssumption.quality).toBe(175);
    expect(parseOptimizationPrompt('maximum quality carry build').artifactAssumption.quality).toBe(175);
  });

  it('preserves every requested protection objective even when shorthand words are used', () => {
    const request = parseOptimizationPrompt('mixed bullet + explosion + laceration protection under 50 million');

    expect(request.objectives.map((term) => term.statKey)).toEqual([
      'stalker.artefact_properties.factor.bullet_dmg_factor',
      'stalker.artefact_properties.factor.explosion_dmg_factor',
      'stalker.artefact_properties.factor.tear_dmg_factor',
    ]);
  });

  it('does not drop bullet when a prompt combines shorthand and explicit objectives', () => {
    const request = parseOptimizationPrompt('Fat PvP — bullet + vitality + healing');

    expect(request.objectives.map((term) => term.statKey)).toEqual([
      'stalker.artefact_properties.factor.bullet_dmg_factor',
      'stalker.artefact_properties.factor.health_bonus',
      'stalker.artefact_properties.factor.heal_efficiency',
    ]);
  });

  it('uses catalog default directions for lower-is-better objectives', () => {
    const request = parseOptimizationPrompt('best radiation bleeding burning recoil sway build');

    expect(request.objectives).toEqual([
      { statKey: 'stalker.artefact_properties.factor.radiation_accumulation', weight: 1, direction: 'minimize' },
      { statKey: 'stalker.artefact_properties.factor.bleeding_accumulation', weight: 1, direction: 'minimize' },
      { statKey: 'stalker.artefact_properties.factor.combustion_accumulation', weight: 1, direction: 'minimize' },
      { statKey: 'stalker.artefact_properties.factor.recoil_bonus', weight: 1, direction: 'minimize' },
      { statKey: 'stalker.artefact_properties.factor.wiggle_bonus', weight: 1, direction: 'minimize' },
    ]);
  });

  it('exposes all normal catalog traits as objective options while hiding special mechanics', () => {
    const labels = objectiveOptionsFromCatalog().map((option) => option.label);

    expect(labels).toEqual(expect.arrayContaining([
      'Resistance to chemicals',
      'Reaction to burns',
      'Radiation protection',
      'Sway',
      'Bleeding',
      'Burning',
    ]));
    expect(labels).not.toContain('Triggers when');
    expect(labels).not.toContain('Reduces damage by');
  });

  it('reports objective direction directly from catalog metadata', () => {
    expect(objectiveDirectionForStatKey('stalker.artefact_properties.factor.health_bonus')).toBe('maximize');
    expect(objectiveDirectionForStatKey('stalker.artefact_properties.factor.radiation_accumulation')).toBe('minimize');
    expect(objectiveDirectionForStatKey('stalker.artefact_properties.factor.wiggle_bonus')).toBe('minimize');
  });
});
