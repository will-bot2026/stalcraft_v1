import { describe, expect, it } from 'vitest';
import { calculateDerivedStats, sumStats, type CalculatedStat } from '../packages/stalcraft-core/src/index.js';

const stat = (key: string, value: number): CalculatedStat => ({
  key: `stalker.artefact_properties.factor.${key}`,
  name: key,
  value,
  isPositive: true,
  isPercentage: true,
  origin: 'artefact',
});

describe('derived build stats', () => {
  it('calculates effective health and healing per second from summed artifact stats', () => {
    const stats = sumStats([
      stat('health_bonus', 25),
      stat('bullet_dmg_factor', 20),
      stat('heal_efficiency', 30),
      stat('artefakt_heal', 1.5),
      stat('regeneration_bonus', 2),
    ]);

    const derived = calculateDerivedStats(stats, { baseHealth: 100, baseHealingPerSecond: 5 });

    expect(derived.healthPool).toBeCloseTo(125, 5);
    expect(derived.effectiveHealthByDamage.bullet).toBeCloseTo(156.25, 5);
    expect(derived.healingPerSecond).toBeCloseTo(10, 5);
  });

  it('exposes reaction bonuses as named derived stats', () => {
    const stats = sumStats([
      stat('reaction_to_burn', 7),
      stat('reaction_to_chemical_burn', 3),
      stat('reaction_to_electroshock', 2),
      stat('reaction_to_tear', 4),
    ]);

    const derived = calculateDerivedStats(stats);

    expect(derived.reactionBonuses).toEqual({ burn: 7, chemicalBurn: 3, electroshock: 2, laceration: 4 });
  });
});
