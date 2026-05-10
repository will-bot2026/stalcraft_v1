import { describe, expect, it } from 'vitest';
import { optimizeBuild } from '../packages/stalcraft-optimizer/src/index.js';
import type { Artifact, Container } from '../packages/stalcraft-data/src/index.js';

const container: Container = { id: 'tiny', name: 'Tiny', category: 'containers', capacity: 3, protection: 0, effectiveness: 100, stats: [] };
const speedStat = (value: number) => ({ key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: value, max: value, isPositive: true, isPercentage: true, origin: 'artefact' as const });
const radiationStat = (value: number) => ({ key: 'stalker.artefact_properties.factor.radiation_accumulation', name: 'Radiation', min: value, max: value, isPositive: false, isPercentage: false, origin: 'artefact' as const });

function artifact(id: string, speed: number, radiation: number): Artifact {
  return { id, name: id, category: 'artefact/test', stats: [speedStat(speed), radiationStat(radiation)] };
}

describe('branch-and-bound optimizer hardening', () => {
  it('uses score upper bounds to prune branches without changing the best build', () => {
    const artifacts = [artifact('best', 10, 0.1), artifact('mid', 4, 0.05), artifact('low', 1, 0.02), artifact('zero', 0, 0)];
    const result = optimizeBuild({
      artifacts,
      container,
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' }],
      constraints: {},
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 1,
    });

    expect(result.results[0]?.artifactIds).toEqual(['best', 'best', 'best']);
    expect(result.stats.visitedLeaves).toBeLessThan(20);
    expect(result.stats.prunedByScoreBound).toBeGreaterThan(0);
  });
});
