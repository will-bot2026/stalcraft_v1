import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { loadExboRepoData } from '../packages/stalcraft-data/src/index.js';

const repo = '/tmp/stalcraft-analysis/stalcraft-database';
const hasExboRepository = existsSync(repo);

describe('EXBO repository-only data regeneration', () => {
  it.skipIf(!hasExboRepository)('loads containers and artifacts directly from the cloned EXBO database', async () => {
    const data = await loadExboRepoData(repo, 'ru');
    const berloga6 = data.containers.find((container) => container.id === 'g35n');
    const coil = data.artifacts.find((artifact) => artifact.id === 'lj0j');

    expect(data.artifacts.length).toBeGreaterThanOrEqual(100);
    expect(data.containers.length).toBeGreaterThanOrEqual(50);
    expect(berloga6).toMatchObject({ name: 'Berloga — 6 Container', capacity: 6, protection: 78.5, effectiveness: 100 });
    expect(coil?.stats.map((stat) => stat.key)).toContain('stalker.artefact_properties.factor.speed_modifier');
    expect(coil?.stats.map((stat) => stat.key)).toContain('stalker.artefact_properties.factor.thermal_accumulation');
  });
});
