import artifactsData from '../data/normalized/artifacts.json' with { type: 'json' };
import { describe, expect, it } from 'vitest';
import { calculateArtifactPanelStats, calculateArtifactStats, calculateFinalBuildStats, sumStats, WIKI_DANGER_LIMITS } from '../packages/stalcraft-core/src/index.js';
import type { Artifact, Container } from '../packages/stalcraft-data/src/index.js';

const artifacts = artifactsData as Artifact[];

const berloga6: Container = {
  id: 'g35n',
  name: 'Berloga — 6 Container',
  category: 'containers',
  capacity: 6,
  protection: 78.5,
  effectiveness: 100,
  stats: [],
};

const coil: Artifact = {
  id: 'lj0j',
  name: 'Coil',
  category: 'artefact/electrophysical',
  stats: [
    {
      key: 'stalker.artefact_properties.factor.speed_modifier',
      name: 'Movement speed',
      min: 1.0200001,
      max: 1.2,
      isPositive: true,
      isPercentage: true,
      origin: 'artefact',
    },
    {
      key: 'stalker.artefact_properties.factor.thermal_accumulation',
      name: 'Temperature',
      min: 2.125,
      max: 2.5,
      isPositive: false,
      isPercentage: false,
      origin: 'artefact',
    },
  ],
};

describe('stalcraft calculator core', () => {
  it('uses wiki danger limits by default', () => {
    expect(WIKI_DANGER_LIMITS['stalker.artefact_properties.factor.radiation_accumulation']).toBe(0.5);
    expect(WIKI_DANGER_LIMITS['stalker.artefact_properties.factor.frost_accumulation']).toBe(1);
  });

  it('calculates artifact stats and applies Berloga 6 protection to harmful accumulation', () => {
    const calculated = calculateArtifactStats(coil, { level: 0, quality: 100 }, berloga6);
    const stats = sumStats(calculated);

    expect(stats.get('stalker.artefact_properties.factor.speed_modifier')?.value).toBeCloseTo(1.2, 5);
    expect(stats.get('stalker.artefact_properties.factor.thermal_accumulation')?.value).toBeCloseTo(0.5375, 5);
  });

  it('separates artifact-panel stats from final result-panel container protection', () => {
    const panel = sumStats(calculateArtifactPanelStats(coil, { level: 0, quality: 100 }));
    const final = calculateFinalBuildStats([{ artifact: coil, assumption: { level: 0, quality: 100 } }], berloga6);

    expect(panel.get('stalker.artefact_properties.factor.thermal_accumulation')?.value).toBeCloseTo(2.5, 5);
    expect(final.get('stalker.artefact_properties.factor.thermal_accumulation')?.value).toBeCloseTo(0.5375, 5);
  });

  it('matches wiki positive formula with container effectiveness, quality, and upgrade level', () => {
    const calculated = calculateArtifactStats(coil, { level: 15, quality: 150 }, { ...berloga6, effectiveness: 114 });
    const stats = sumStats(calculated);

    expect(stats.get('stalker.artefact_properties.factor.speed_modifier')?.value).toBeCloseTo(1.2 * 1.14 * 1.5 * 1.3, 5);
  });

  it('matches wiki negative stat interpolation for ordinary and unordinary qualities', () => {
    const frostArtifact: Artifact = {
      id: 'frost-test',
      name: 'Frost Test',
      category: 'artefact/test',
      stats: [{ key: 'stalker.artefact_properties.factor.frost_accumulation', name: 'Frost', min: 0.85, max: 1, isPositive: false, isPercentage: false, origin: 'artefact' }],
    };

    expect(sumStats(calculateArtifactStats(frostArtifact, { level: 0, quality: 50 }, berloga6)).get('stalker.artefact_properties.factor.frost_accumulation')?.value).toBeCloseTo(0.925, 5);
    expect(sumStats(calculateArtifactStats(frostArtifact, { level: 0, quality: 100, rarity: 'rarity.unordinary' }, berloga6)).get('stalker.artefact_properties.factor.frost_accumulation')?.value).toBeCloseTo(0.9, 5);
    expect(sumStats(calculateArtifactStats(frostArtifact, { level: 0, quality: 115, rarity: 'rarity.special' }, berloga6)).get('stalker.artefact_properties.factor.frost_accumulation')?.value).toBeCloseTo(0.85, 5);
  });

  it('interpolates harmful stats from the actual decimal quality inside the selected rarity band', () => {
    const frostArtifact: Artifact = {
      id: 'frost-test',
      name: 'Frost Test',
      category: 'artefact/test',
      stats: [{ key: 'stalker.artefact_properties.factor.frost_accumulation', name: 'Frost', min: 0.85, max: 1, isPositive: false, isPercentage: false, origin: 'artefact' }],
    };

    const panel = sumStats(calculateArtifactPanelStats(frostArtifact, { level: 0, quality: 124.5, rarity: 'rarity.special' }));

    expect(panel.get('stalker.artefact_properties.factor.frost_accumulation')?.value).toBeCloseTo(0.945, 5);
    expect(panel.get('stalker.artefact_properties.factor.frost_accumulation')?.value).not.toBeCloseTo(0.85, 5);
    expect(panel.get('stalker.artefact_properties.factor.frost_accumulation')?.value).not.toBeCloseTo(1, 5);
  });

  it('matches the Wiki Golden Prima artifact panel harmful range before container protection', () => {
    const goldenPrima = artifacts.find((artifact) => artifact.name === 'Golden Prima');
    expect(goldenPrima).toBeDefined();

    const ordinaryPanel = sumStats(calculateArtifactPanelStats(goldenPrima!, { level: 0, quality: 100, rarity: 'rarity.ordinary' }));
    const unordinaryPanel = sumStats(calculateArtifactPanelStats(goldenPrima!, { level: 0, quality: 100, rarity: 'rarity.unordinary' }));

    const ordinaryRadiation = ordinaryPanel.get('stalker.artefact_properties.factor.radiation_accumulation')?.value ?? Number.NaN;
    const unordinaryRadiation = unordinaryPanel.get('stalker.artefact_properties.factor.radiation_accumulation')?.value ?? Number.NaN;

    expect(ordinaryRadiation).toBeCloseTo(1.25, 5);
    expect(unordinaryRadiation).toBeGreaterThanOrEqual(1.0625);
    expect(unordinaryRadiation).toBeLessThanOrEqual(1.25);
  });

  it('keeps all normalized harmful artifact-panel stats inside their Wiki min/max range', () => {
    const harmfulKeys = new Set(Object.keys(WIKI_DANGER_LIMITS));
    for (const artifact of artifacts) {
      const panel = calculateArtifactPanelStats(artifact, { level: 0, quality: 100, rarity: artifact.rarity });
      for (const stat of panel.filter((entry) => harmfulKeys.has(entry.key))) {
        const source = [...artifact.stats, ...(artifact.additionalStats ?? [])].find((entry) => entry.key === stat.key && entry.name === stat.name);
        expect(source, `${artifact.name} ${stat.name} has source range`).toBeDefined();
        const low = Math.min(Number(source!.min), Number(source!.max));
        const high = Math.max(Number(source!.min), Number(source!.max));
        expect(stat.value, `${artifact.name} ${stat.name}`).toBeGreaterThanOrEqual(low - 0.00001);
        expect(stat.value, `${artifact.name} ${stat.name}`).toBeLessThanOrEqual(high + 0.00001);
      }
    }
  });

  it('keeps beneficial negative Burning as an accumulation stat without container effectiveness/protection amplification', () => {
    const chilly = artifacts.find((artifact) => artifact.name === 'Chilly');
    expect(chilly).toBeDefined();
    const highEffectivenessContainer: Container = {
      ...berloga6,
      effectiveness: 115,
      protection: 78.5,
    };

    const panel = sumStats(calculateArtifactPanelStats(chilly!, { level: 0, quality: 100, rarity: 'rarity.unordinary' }));
    const final = calculateFinalBuildStats([{ artifact: chilly!, assumption: { level: 0, quality: 100, rarity: 'rarity.unordinary' } }], highEffectivenessContainer);

    expect(panel.get('stalker.artefact_properties.factor.combustion_accumulation')?.value).toBeCloseTo(-0.4, 5);
    expect(final.get('stalker.artefact_properties.factor.combustion_accumulation')?.value).toBeCloseTo(-0.4, 5);
  });

  it('applies backpack protection to beneficial negative accumulation reducers in final build stats', () => {
    const steelHedgehog = artifacts.find((artifact) => artifact.name === 'Steel Hedgehog');
    const pegTop = artifacts.find((artifact) => artifact.name === 'Peg-Top');
    expect(steelHedgehog).toBeDefined();
    expect(pegTop).toBeDefined();
    const chitinBackpack: Container = {
      id: 'yq90',
      name: 'Chitin Backpack',
      category: 'backpacks',
      capacity: 6,
      protection: 60.000004,
      effectiveness: 115,
      stats: [],
    };

    const final = calculateFinalBuildStats([
      ...Array.from({ length: 5 }, () => ({ artifact: steelHedgehog!, assumption: { level: 15, quality: 175, rarity: 'rarity.legendary' } })),
      { artifact: pegTop!, assumption: { level: 15, quality: 115, rarity: 'rarity.special' } },
    ], chitinBackpack);

    const psy = final.get('stalker.artefact_properties.factor.psycho_accumulation')?.value ?? Number.NaN;
    expect(psy).toBeGreaterThan(3);
    expect(psy).toBeCloseTo(3.31016, 4);
  });

  it('includes container and backpack stat variations in final build stats', () => {
    const carryContainer: Container = {
      ...berloga6,
      stats: [
        {
          key: 'stalker.artefact_properties.factor.max_weight_bonus',
          name: 'Carry weight',
          min: 47,
          max: 47,
          isPositive: true,
          isPercentage: false,
          origin: 'containers',
        },
      ],
    };

    const final = calculateFinalBuildStats([], carryContainer);

    expect(final.get('stalker.artefact_properties.factor.max_weight_bonus')?.value).toBe(47);
  });
});
