import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { loadWikiCalculatorSnapshot, normalizeArtifacts, normalizeContainers } from '../packages/stalcraft-data/src/index.js';

const rawWikiSnapshotDirectory = '../data-snapshots';
const hasRawWikiSnapshot = existsSync(rawWikiSnapshotDirectory);

describe('stalcraft data normalization', () => {
  it.skipIf(!hasRawWikiSnapshot)('loads all wiki calculator containers/backpacks and maps normal Berloga 6 to g35n', async () => {
    const snapshot = await loadWikiCalculatorSnapshot(rawWikiSnapshotDirectory);
    const containers = normalizeContainers(snapshot.containersBackpacks);

    expect(containers).toHaveLength(54);
    expect(containers.find((container) => container.id === 'g35n')).toMatchObject({
      id: 'g35n',
      name: 'Berloga — 6 Container',
      capacity: 6,
      protection: 78.5,
      effectiveness: 100,
    });
    expect(containers.find((container) => container.id === 'q1m4')).toMatchObject({
      name: 'Berloga-6U Container',
      effectiveness: 114,
    });
  });

  it.skipIf(!hasRawWikiSnapshot)('loads wiki artifacts and keeps base traits separate from level-gated additional traits', async () => {
    const snapshot = await loadWikiCalculatorSnapshot(rawWikiSnapshotDirectory);
    const artifacts = normalizeArtifacts(snapshot.artifacts);
    const chilly = artifacts.find((artifact) => artifact.id === 'ljn2');
    const radiator = artifacts.find((artifact) => artifact.id === 'ljrj');

    expect(artifacts).toHaveLength(102);
    expect(chilly).toMatchObject({ id: 'ljn2', name: 'Chilly', rarity: 'rarity.ordinary' });
    expect(chilly?.stats.map((stat) => stat.key)).toContain('stalker.artefact_properties.factor.frost_accumulation');
    expect(chilly?.additionalStats?.map((stat) => stat.key)).toContain('stalker.artefact_properties.factor.explosion_dmg_factor');

    // Wiki exposes Radiator's extra movement/cooling as selectable additional stats.
    // They are not active on a +0 artifact, so they must not be folded into base stats.
    expect(radiator?.stats.filter((stat) => stat.key === 'stalker.artefact_properties.factor.speed_modifier')).toHaveLength(1);
    expect(radiator?.additionalStats?.filter((stat) => stat.key === 'stalker.artefact_properties.factor.speed_modifier')).toHaveLength(1);
  });
});
