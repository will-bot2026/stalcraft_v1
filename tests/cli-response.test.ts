import { describe, expect, it } from 'vitest';
import { calculateDerivedStats, sumStats, type CalculatedStat } from '../packages/stalcraft-core/src/index.js';
import { serializeStatsMap, serializeDerivedStats } from '../apps/cli/src/response.js';

describe('CLI response serialization', () => {
  it('exposes every calculated build stat plus derived stats, not just objective and danger stats', () => {
    const summed = sumStats([
      { key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', value: 5.95, isPositive: true, isPercentage: true, origin: 'artefact' },
      { key: 'stalker.artefact_properties.factor.sprint_speed_modifier', name: 'Running speed', value: 8.05, isPositive: true, isPercentage: true, origin: 'artefact' },
      { key: 'stalker.artefact_properties.factor.max_weight_bonus', name: 'Carry weight', value: 18.5, isPositive: true, isPercentage: false, origin: 'artefact' },
      { key: 'stalker.artefact_properties.factor.electra_dmg_factor', name: 'Resistance to electricity', value: 27.4, isPositive: true, isPercentage: true, origin: 'artefact' },
      { key: 'stalker.artefact_properties.factor.health_bonus', name: 'Vitality', value: -14.8, isPositive: false, isPercentage: true, origin: 'artefact' },
    ] satisfies CalculatedStat[]);

    const allStats = serializeStatsMap(summed);

    expect(allStats.map((stat) => stat.key)).toEqual([
      'stalker.artefact_properties.factor.electra_dmg_factor',
      'stalker.artefact_properties.factor.health_bonus',
      'stalker.artefact_properties.factor.max_weight_bonus',
      'stalker.artefact_properties.factor.speed_modifier',
      'stalker.artefact_properties.factor.sprint_speed_modifier',
    ]);
    expect(allStats.find((stat) => stat.key.endsWith('sprint_speed_modifier'))?.value).toBeCloseTo(8.05, 5);
    expect(allStats.find((stat) => stat.key.endsWith('max_weight_bonus'))?.value).toBeCloseTo(18.5, 5);

    const derivedStats = serializeDerivedStats(calculateDerivedStats(summed));
    expect(derivedStats.healthPool).toBeCloseTo(85.2, 5);
    expect(derivedStats.effectiveHealthByDamage.electricity).toBeGreaterThan(100);
  });
});
