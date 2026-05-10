import { describe, expect, it } from 'vitest';
import { optimizeBuild } from '../packages/stalcraft-optimizer/src/index.js';
import type { Artifact, Container } from '../packages/stalcraft-data/src/index.js';

const container: Container = { id: 'two', name: 'Two', category: 'containers', capacity: 2, protection: 100, effectiveness: 100, stats: [] };
const stat = (speed: number) => ({ key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: speed, max: speed, isPositive: true, isPercentage: true, origin: 'artefact' as const });
const artifact = (id: string, speed: number): Artifact => ({ id, name: id, category: 'artefact/test', stats: [stat(speed)] });

describe('optimizer market budget integration', () => {
  it('uses market median price map to reject builds over strict budget', () => {
    const result = optimizeBuild({
      artifacts: [artifact('fast-expensive', 10), artifact('slower-cheap', 6)],
      container,
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' }],
      constraints: {
        maxBudget: 500,
        prices: new Map([
          ['fast-expensive', 450],
          ['slower-cheap', 100],
        ]),
      },
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 1,
    });

    expect(result.results[0]?.artifactIds).toEqual(['slower-cheap', 'slower-cheap']);
    expect(result.results[0]?.budget.total).toBe(200);
  });
});
