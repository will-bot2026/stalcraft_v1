import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { optimizeBuild } from '../packages/stalcraft-optimizer/src/index.js';
import { parseOptimizationPrompt } from '../packages/stalcraft-nlp/src/index.js';
import { calculateArtifactPanelStats, calculateArtifactStats, isWithinDangerLimits, sumStats, WIKI_DANGER_LIMITS } from '../packages/stalcraft-core/src/index.js';
import type { Artifact, Container } from '../packages/stalcraft-data/src/index.js';

describe('real snapshot optimizer smoke test', () => {
  it('generates a Berloga 6 movement build from normalized artifact/container data within danger limits', async () => {
    const artifacts = JSON.parse(await readFile('data/normalized/artifacts.json', 'utf8')) as Artifact[];
    const containers = JSON.parse(await readFile('data/normalized/containers.json', 'utf8')) as Container[];
    const request = parseOptimizationPrompt('generate a Berloga 6 build that maximizes movement speed');
    const container = containers.find((candidate) => candidate.id === request.containerId);

    expect(container).toBeDefined();
    const result = optimizeBuild({
      artifacts,
      container: container!,
      objectives: request.objectives,
      constraints: { dangerLimits: WIKI_DANGER_LIMITS },
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 3,
    });

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.prunedArtifactIds.length).toBeGreaterThan(0);
    expect(result.results[0]?.artifactIds).toHaveLength(6);
    for (const [key, limit] of Object.entries(WIKI_DANGER_LIMITS)) {
      expect(result.results[0]?.stats.get(key)?.value ?? 0).toBeLessThanOrEqual(limit);
    }
  });

  it('calculates every wiki base stat for the verified budgeted Whirlwind/Ice Hedgehog/Retina/Spiral/Mirror build', async () => {
    const artifacts = JSON.parse(await readFile('data/normalized/artifacts.json', 'utf8')) as Artifact[];
    const containers = JSON.parse(await readFile('data/normalized/containers.json', 'utf8')) as Container[];
    const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
    const container = containers.find((candidate) => candidate.id === 'g35n');

    expect(container).toBeDefined();
    const calculated = ['y5k0', 'y5k0', '5r5g', 'gy7p', 'gyq5', 'zyrm']
      .map((id) => byId.get(id))
      .flatMap((artifact) => calculateArtifactPanelStats(artifact!, { level: 0, quality: 100 }));
    const stats = sumStats(calculated);

    expect(stats.get('stalker.artefact_properties.factor.speed_modifier')?.value).toBeCloseTo(5.95, 5);
    expect(stats.get('stalker.artefact_properties.factor.sprint_speed_modifier')?.value).toBeCloseTo(8.05, 5);
    expect(stats.get('stalker.artefact_properties.factor.max_weight_bonus')?.value).toBeCloseTo(18.5, 5);
    expect(stats.get('stalker.artefact_properties.factor.stamina_regeneration_bonus')?.value).toBeCloseTo(5.8, 5);
    expect(stats.get('stalker.artefact_properties.factor.electra_dmg_factor')?.value).toBeCloseTo(27.4, 5);
    expect(stats.get('stalker.artefact_properties.factor.health_bonus')?.value).toBeCloseTo(-14.8, 5);
    expect(stats.get('stalker.artefact_properties.factor.reaction_to_burn')?.value).toBeCloseTo(-2.7, 5);
    expect(stats.get('stalker.artefact_properties.factor.radiation_protection')?.value).toBeCloseTo(45, 5);
    expect(stats.get('stalker.artefact_properties.factor.psycho_protection')?.value).toBeCloseTo(45, 5);
    expect(stats.get('stalker.artefact_properties.factor.radiation_accumulation')?.value).toBeCloseTo(-0.91, 5);
    expect(stats.get('stalker.artefact_properties.factor.biological_accumulation')?.value).toBeCloseTo(-0.03, 5);
    expect(stats.get('stalker.artefact_properties.factor.psycho_accumulation')?.value).toBeCloseTo(-0.91, 5);
    expect(stats.get('stalker.artefact_properties.factor.thermal_accumulation')?.value).toBeCloseTo(-0.384, 5);
    expect(stats.get('stalker.artefact_properties.factor.frost_accumulation')?.value).toBeCloseTo(1, 5);
  });

  it('does not count level-gated additional Radiator/Raisin stats on +0 builds', async () => {
    const artifacts = JSON.parse(await readFile('data/normalized/artifacts.json', 'utf8')) as Artifact[];
    const containers = JSON.parse(await readFile('data/normalized/containers.json', 'utf8')) as Container[];
    const container = containers.find((candidate) => candidate.id === 'g35n');
    const radiator = artifacts.find((artifact) => artifact.id === 'ljrj');
    const raisin = artifacts.find((artifact) => artifact.id === 'jky6');

    expect(container).toBeDefined();
    expect(radiator).toBeDefined();
    expect(raisin).toBeDefined();

    const calculated = [radiator!, raisin!, raisin!, raisin!, raisin!, raisin!]
      .flatMap((artifact) => calculateArtifactStats(artifact, { level: 0, quality: 100 }, container!));
    const stats = sumStats(calculated);

    expect(stats.get('stalker.artefact_properties.factor.speed_modifier')?.value).toBeCloseTo(8.5, 5);
    expect(stats.get('stalker.artefact_properties.factor.thermal_accumulation')?.value).toBeCloseTo(2.2231, 5);
    expect(isWithinDangerLimits(stats, WIKI_DANGER_LIMITS)).toBe(false);
  });
});
