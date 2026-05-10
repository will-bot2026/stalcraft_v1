import { describe, expect, it } from 'vitest';
import { generateArtifactCandidates, legalRaritiesForQuality, qualityRollDomainForRarity } from '../packages/stalcraft-optimizer/src/index.js';
import type { Artifact } from '../packages/stalcraft-data/src/index.js';

const speedKey = 'stalker.artefact_properties.factor.speed_modifier';
const carryKey = 'stalker.artefact_properties.factor.max_weight_bonus';
const bulletKey = 'stalker.artefact_properties.factor.bullet_dmg_factor';
const explosionKey = 'stalker.artefact_properties.factor.explosion_dmg_factor';

const artifact: Artifact = {
  id: 'candidate-test',
  name: 'Candidate Test',
  category: 'artefact/test',
  rarity: 'rarity.ordinary',
  stats: [{ key: speedKey, name: 'Movement speed', min: 1, max: 1, isPositive: true, isPercentage: true, origin: 'artefact' }],
  additionalStats: [
    { key: carryKey, name: 'Carry weight', min: 2, max: 2, isPositive: true, isPercentage: false, origin: 'artefact' },
    { key: bulletKey, name: 'Bullet resistance', min: 3, max: 3, isPositive: true, isPercentage: false, origin: 'artefact' },
    { key: explosionKey, name: 'Explosion protection', min: 5, max: 5, isPositive: true, isPercentage: false, origin: 'artefact' },
  ],
};

describe('artifact candidate generator', () => {
  it('generates full low-roll/high-roll quality domains for every rarity bracket', () => {
    expect(qualityRollDomainForRarity('rarity.ordinary')).toEqual(expect.arrayContaining([85, 86, 99, 100]));
    expect(qualityRollDomainForRarity('rarity.rare')).toEqual(expect.arrayContaining([130, 131, 144, 145]));
    expect(qualityRollDomainForRarity('rarity.legendary')).toEqual(expect.arrayContaining([160, 161, 174, 175]));
    expect(qualityRollDomainForRarity('rarity.rare')).toHaveLength(16);
  });

  it('expands every legal rarity threshold and between-threshold domain', () => {
    expect(legalRaritiesForQuality(99)).toEqual(['rarity.ordinary']);
    expect(legalRaritiesForQuality(100)).toEqual(['rarity.ordinary', 'rarity.unordinary']);
    expect(legalRaritiesForQuality(101)).toEqual(['rarity.unordinary']);
    expect(legalRaritiesForQuality(115)).toEqual(['rarity.unordinary', 'rarity.special']);
    expect(legalRaritiesForQuality(116)).toEqual(['rarity.special']);
    expect(legalRaritiesForQuality(130)).toEqual(['rarity.special', 'rarity.rare']);
    expect(legalRaritiesForQuality(131)).toEqual(['rarity.rare']);
    expect(legalRaritiesForQuality(145)).toEqual(['rarity.rare', 'rarity.exclusive']);
    expect(legalRaritiesForQuality(146)).toEqual(['rarity.exclusive']);
    expect(legalRaritiesForQuality(160)).toEqual(['rarity.exclusive', 'rarity.legendary']);
    expect(legalRaritiesForQuality(161)).toEqual(['rarity.legendary']);
    expect(legalRaritiesForQuality(175)).toEqual(['rarity.legendary']);
    expect(legalRaritiesForQuality(175, { uniqueLegal: true })).toEqual(['rarity.legendary', 'rarity.unique']);
  });

  it('excludes selected additional stats under none policy', () => {
    const candidates = generateArtifactCandidates({
      artifacts: [artifact],
      qualityDomain: [100],
      levelDomain: [0],
      additionalStatPolicy: 'none',
    });

    expect(candidates).toHaveLength(2);
    expect(candidates.every((candidate) => candidate.selectedAdditionalStatKeys.length === 0)).toBe(true);
    expect(candidates[0]?.artifactPanelStats[carryKey]).toBeUndefined();
  });

  it('includes only legal explicit additional stats under explicit-only policy', () => {
    const candidates = generateArtifactCandidates({
      artifacts: [artifact],
      qualityDomain: [100],
      levelDomain: [0],
      additionalStatPolicy: 'explicit-only',
      explicitAdditionalStatKeysByArtifactId: new Map([[artifact.id, [carryKey, 'illegal-key']]]),
    });

    expect(candidates[0]?.selectedAdditionalStatKeys).toEqual([carryKey]);
    expect(candidates[0]?.artifactPanelStats[carryKey]).toBeCloseTo(2, 5);
  });

  it('uses Infinity for unknown prices under strict budget', () => {
    const candidates = generateArtifactCandidates({
      artifacts: [artifact],
      qualityDomain: [100],
      levelDomain: [0],
      strictBudget: true,
    });

    expect(candidates[0]?.price).toBe(Number.POSITIVE_INFINITY);
    expect(candidates[0]?.priceSource.unknown).toBe(true);
  });

  it('gates optimized additional stat variants by upgrade level unlock slots', () => {
    const candidates = generateArtifactCandidates({
      artifacts: [artifact],
      qualityDomain: [100],
      levelDomain: [0, 5, 10, 15],
      additionalStatPolicy: 'optimize-unlocked',
    });

    const byLevel = new Map<number, string[][]>();
    for (const candidate of candidates.filter((entry) => entry.rarity === 'rarity.ordinary')) {
      byLevel.set(candidate.level, [...(byLevel.get(candidate.level) ?? []), candidate.selectedAdditionalStatKeys]);
    }

    expect(byLevel.get(0)).toEqual([[]]);
    expect(byLevel.get(5)?.map((keys) => keys.join('+')).sort()).toEqual([bulletKey, carryKey, explosionKey].sort());
    expect(byLevel.get(10)?.map((keys) => keys.join('+')).sort()).toEqual([
      [bulletKey, carryKey].sort().join('+'),
      [bulletKey, explosionKey].sort().join('+'),
      [carryKey, explosionKey].sort().join('+'),
    ].sort());
    expect(byLevel.get(15)).toEqual([[bulletKey, carryKey, explosionKey].sort()]);
    expect(byLevel.get(15)?.[0]).not.toHaveLength(1);
  });

  it('calculates all three selected additional traits for +15 artifact candidates', () => {
    const candidates = generateArtifactCandidates({
      artifacts: [artifact],
      qualityDomain: [100],
      levelDomain: [15],
      additionalStatPolicy: 'optimize-unlocked',
    });

    const candidate = candidates.find((entry) => entry.rarity === 'rarity.ordinary');
    expect(candidate?.selectedAdditionalStatKeys.sort()).toEqual([bulletKey, carryKey, explosionKey].sort());
    expect(candidate?.artifactPanelStats[carryKey]).toBeCloseTo(2.6, 5);
    expect(candidate?.artifactPanelStats[bulletKey]).toBeCloseTo(3.9, 5);
    expect(candidate?.artifactPanelStats[explosionKey]).toBeCloseTo(6.5, 5);
  });
});
