import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import {
  compareDataSources,
  formatDataSourceDiffMarkdown,
  loadExboRepoData,
  loadWikiCalculatorSnapshot,
  normalizeArtifacts,
  normalizeContainers,
} from '../packages/stalcraft-data/src/index.js';

const rawWikiSnapshotDirectory = '../data-snapshots';
const exboRepositoryDirectory = '/tmp/stalcraft-analysis/stalcraft-database';
const hasExternalDiffSources = existsSync(rawWikiSnapshotDirectory) && existsSync(exboRepositoryDirectory);

describe('EXBO-vs-Wiki data diffing', () => {
  it('flags source count differences, missing IDs, stat differences, and container field differences', () => {
    const wikiArtifacts = [
      {
        id: 'shared-artifact',
        name: 'Wiki Shared',
        category: 'artefact',
        stats: [
          { key: 'speed_modifier', name: 'Speed', min: 1, max: 2, isPositive: true, isPercentage: true, origin: 'artefact' },
          { key: 'radiation_accumulation', name: 'Radiation', min: 0.5, max: 1, isPositive: false, isPercentage: false, origin: 'artefact' },
        ],
        additionalStats: [],
      },
      { id: 'wiki-only', name: 'Wiki Only', category: 'artefact', stats: [], additionalStats: [] },
    ];
    const exboArtifacts = [
      {
        id: 'shared-artifact',
        name: 'EXBO Shared',
        category: 'artefact',
        stats: [
          { key: 'speed_modifier', name: 'Speed', min: 1, max: 2.5, isPositive: true, isPercentage: true, origin: 'artefact' },
          { key: 'frost_accumulation', name: 'Frost', min: 0.1, max: 0.2, isPositive: false, isPercentage: false, origin: 'artefact' },
        ],
        additionalStats: [],
      },
      { id: 'exbo-only', name: 'EXBO Only', category: 'artefact', stats: [], additionalStats: [] },
    ];

    const diff = compareDataSources({
      wikiArtifacts,
      exboArtifacts,
      wikiContainers: [{ id: 'g35n', name: 'Berloga — 6 Container', category: 'containers', capacity: 6, protection: 78.5, effectiveness: 100, stats: [] }],
      exboContainers: [{ id: 'g35n', name: 'Берлога-6', category: 'containers', capacity: 6, protection: 78, effectiveness: 100, stats: [] }],
    });

    expect(diff.summary).toMatchObject({
      wikiArtifactCount: 2,
      exboArtifactCount: 2,
      sharedArtifactCount: 1,
      wikiOnlyArtifactCount: 1,
      exboOnlyArtifactCount: 1,
      containerDifferenceCount: 1,
    });
    expect(diff.artifacts.wikiOnly.map((item) => item.id)).toEqual(['wiki-only']);
    expect(diff.artifacts.exboOnly.map((item) => item.id)).toEqual(['exbo-only']);
    expect(diff.artifacts.differentNames[0]).toMatchObject({ id: 'shared-artifact', wikiName: 'Wiki Shared', exboName: 'EXBO Shared' });
    expect(diff.artifacts.statDifferences[0]).toMatchObject({
      id: 'shared-artifact',
      missingInWiki: ['frost_accumulation'],
      missingInExbo: ['radiation_accumulation'],
    });
    expect(diff.containers.differences[0]).toMatchObject({ id: 'g35n', differingFields: ['name', 'protection'] });

    const markdown = formatDataSourceDiffMarkdown(diff);
    expect(markdown).toContain('EXBO vs Wiki Data Diff Report');
    expect(markdown).toContain('wiki-only');
    expect(markdown).toContain('exbo-only');
    expect(markdown).toContain('shared-artifact');
  });

  it.skipIf(!hasExternalDiffSources)('can diff the real normalized Wiki snapshot against EXBO repo data', async () => {
    const snapshot = await loadWikiCalculatorSnapshot(rawWikiSnapshotDirectory);
    const wikiArtifacts = normalizeArtifacts(snapshot.artifacts);
    const wikiContainers = normalizeContainers(snapshot.containersBackpacks);
    const exbo = await loadExboRepoData(exboRepositoryDirectory);

    const diff = compareDataSources({
      wikiArtifacts,
      exboArtifacts: exbo.artifacts,
      wikiContainers,
      exboContainers: exbo.containers,
    });

    expect(diff.summary.wikiArtifactCount).toBe(102);
    expect(diff.summary.exboArtifactCount).toBeGreaterThan(1000);
    expect(diff.summary.sharedContainerCount).toBeGreaterThan(40);
    expect(diff.summary.wikiOnlyArtifactCount).toBe(3);
    expect(diff.summary.exboDuplicateArtifactIdCount).toBeGreaterThan(90);
    expect(diff.artifacts.variantMismatches.some((item) => item.exboVariantCount > 1)).toBe(true);
  });
});
