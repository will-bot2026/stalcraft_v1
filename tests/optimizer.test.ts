import { describe, expect, it } from 'vitest';
import { bruteForceOptimizeBuild, generateArtifactCandidates, optimizeBuild } from '../packages/stalcraft-optimizer/src/index.js';
import type { Artifact, Container } from '../packages/stalcraft-data/src/index.js';

const container: Container = {
  id: 'g35n',
  name: 'Berloga — 6 Container',
  category: 'containers',
  capacity: 2,
  protection: 78.5,
  effectiveness: 100,
  stats: [],
};

const artifacts: Artifact[] = [
  {
    id: 'fast',
    name: 'Fast',
    category: 'artefact/test',
    stats: [
      { key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: 1, max: 1, isPositive: true, isPercentage: true, origin: 'artefact' },
      { key: 'stalker.artefact_properties.factor.radiation_accumulation', name: 'Radiation', min: 0.2, max: 0.2, isPositive: false, isPercentage: false, origin: 'artefact' },
    ],
  },
  {
    id: 'slow',
    name: 'Slow',
    category: 'artefact/test',
    stats: [
      { key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: 0.4, max: 0.4, isPositive: true, isPercentage: true, origin: 'artefact' },
    ],
  },
];

describe('artifact optimizer', () => {
  it('allows duplicate artifacts and enforces strict budget', () => {
    const result = optimizeBuild({
      artifacts,
      container,
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' as const }],
      constraints: {
        maxBudget: 1000,
        prices: new Map([
          ['fast', 500],
          ['slow', 1],
        ]),
      },
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 1,
    });

    expect(result.results[0]?.artifactIds).toEqual(['fast', 'fast']);
    expect(result.results[0]?.budget.total).toBe(1000);
    expect(result.results[0]?.score).toBeCloseTo(2);
  });

  it('rejects duplicate best build when strict budget would be exceeded', () => {
    const result = optimizeBuild({
      artifacts,
      container,
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' }],
      constraints: {
        maxBudget: 999,
        prices: new Map([
          ['fast', 500],
          ['slow', 1],
        ]),
      },
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 1,
    });

    expect(result.results[0]?.artifactIds).toEqual(['fast', 'slow']);
    expect(result.results[0]?.budget.total).toBe(501);
  });

  it('includes a required artifact while allowing extra copies', () => {
    const result = optimizeBuild({
      artifacts,
      container,
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' }],
      constraints: { artifactConstraints: [{ artifactId: 'slow', mode: 'include' }] },
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 1,
    });

    expect(result.results[0]?.artifactIds).toContain('slow');
    expect(result.results[0]?.artifactIds).toHaveLength(2);
  });

  it('honors duplicate include rows as minimum occurrence counts', () => {
    const input: Parameters<typeof optimizeBuild>[0] = {
      artifacts,
      container,
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' }],
      constraints: {
        artifactConstraints: [
          { artifactId: 'slow', mode: 'include' },
          { artifactId: 'slow', mode: 'include' },
        ],
      },
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 1,
    };
    const result = optimizeBuild(input);
    const bruteForce = bruteForceOptimizeBuild(input);

    expect(result.results[0]?.artifactIds).toEqual(['slow', 'slow']);
    expect(result.results[0]?.artifactIds).toEqual(bruteForce.results[0]?.artifactIds);
  });

  it('excludes an artifact from every slot', () => {
    const result = optimizeBuild({
      artifacts,
      container,
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' }],
      constraints: { artifactConstraints: [{ artifactId: 'fast', mode: 'exclude' }] },
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 1,
    });

    expect(result.results[0]?.artifactIds).toEqual(['slow', 'slow']);
  });

  it('returns no result for include/exclude conflicts', () => {
    const result = optimizeBuild({
      artifacts,
      container,
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' }],
      constraints: {
        artifactConstraints: [
          { artifactId: 'fast', mode: 'include' },
          { artifactId: 'fast', mode: 'exclude' },
        ],
      },
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 1,
    });

    expect(result.results).toHaveLength(0);
  });

  it('returns no result when required artifact count exceeds container capacity', () => {
    const result = optimizeBuild({
      artifacts,
      container: { ...container, capacity: 1 },
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' }],
      constraints: {
        artifactConstraints: [
          { artifactId: 'slow', mode: 'include' },
          { artifactId: 'fast', mode: 'include' },
        ],
      },
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 1,
    });

    expect(result.results).toHaveLength(0);
  });

  it('does not prune a required artifact just because another artifact dominates it', () => {
    const result = optimizeBuild({
      artifacts: [
        { id: 'dominates', name: 'Dominates', category: 'artefact/test', stats: [{ key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: 2, max: 2, isPositive: true, isPercentage: true, origin: 'artefact' }] },
        { id: 'required', name: 'Required', category: 'artefact/test', stats: [{ key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: 1, max: 1, isPositive: true, isPercentage: true, origin: 'artefact' }] },
      ],
      container: { ...container, capacity: 1, protection: 0 },
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' }],
      constraints: { artifactConstraints: [{ artifactId: 'required', mode: 'include' }] },
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 1,
    });

    expect(result.prunedArtifactIds).not.toContain('required');
    expect(result.results[0]?.artifactIds).toEqual(['required']);
  });

  it('keeps empty artifact constraints equivalent to previous unconstrained behavior', () => {
    const baseInput = {
      artifacts,
      container,
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' as const }],
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 2,
    };
    const unconstrained = optimizeBuild({ ...baseInput, constraints: {} });
    const emptyConstrained = optimizeBuild({ ...baseInput, constraints: { artifactConstraints: [] } });

    expect(emptyConstrained.results.map((build) => build.artifactIds)).toEqual(unconstrained.results.map((build) => build.artifactIds));
    expect(emptyConstrained.results.map((build) => build.score)).toEqual(unconstrained.results.map((build) => build.score));
  });

  it('removes Pareto-dominated artifact options before searching', () => {
    const result = optimizeBuild({
      artifacts: [
        {
          id: 'strictly-better',
          name: 'Strictly Better',
          category: 'artefact/test',
          stats: [
            { key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: 2, max: 2, isPositive: true, isPercentage: true, origin: 'artefact' },
            { key: 'stalker.artefact_properties.factor.radiation_accumulation', name: 'Radiation', min: 0.1, max: 0.1, isPositive: false, isPercentage: false, origin: 'artefact' },
          ],
        },
        {
          id: 'dominated',
          name: 'Dominated',
          category: 'artefact/test',
          stats: [
            { key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: 1, max: 1, isPositive: true, isPercentage: true, origin: 'artefact' },
            { key: 'stalker.artefact_properties.factor.radiation_accumulation', name: 'Radiation', min: 0.2, max: 0.2, isPositive: false, isPercentage: false, origin: 'artefact' },
          ],
        },
        {
          id: 'tradeoff',
          name: 'Tradeoff',
          category: 'artefact/test',
          stats: [
            { key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: 3, max: 3, isPositive: true, isPercentage: true, origin: 'artefact' },
            { key: 'stalker.artefact_properties.factor.radiation_accumulation', name: 'Radiation', min: 0.4, max: 0.4, isPositive: false, isPercentage: false, origin: 'artefact' },
          ],
        },
      ],
      container: { ...container, capacity: 1, protection: 0 },
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' }],
      constraints: {
        prices: new Map([
          ['strictly-better', 100],
          ['dominated', 150],
          ['tradeoff', 100],
        ]),
      },
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 3,
    });

    expect(result.prunedArtifactIds).toContain('dominated');
    expect(result.prunedArtifactIds).not.toContain('tradeoff');
    expect(result.results.map((build) => build.artifactIds[0])).not.toContain('dominated');
  });

  it('treats missing prices as Infinity under strict budget', () => {
    const result = optimizeBuild({
      artifacts,
      container,
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' }],
      constraints: {
        maxBudget: 1000,
        prices: new Map([['slow', 1]]),
      },
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 1,
    });

    expect(result.results[0]?.artifactIds).toEqual(['slow', 'slow']);
    expect(result.results[0]?.budget.total).toBe(2);
  });

  it('enforces minimum spend constraints and does not use unknown prices to satisfy them', () => {
    const result = optimizeBuild({
      artifacts: [
        ...artifacts,
        {
          id: 'unknown-price',
          name: 'Unknown Price',
          category: 'artefact/test',
          stats: [
            { key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: 100, max: 100, isPositive: true, isPercentage: true, origin: 'artefact' },
          ],
        },
      ],
      container,
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' }],
      constraints: {
        minBudget: 900,
        prices: new Map([
          ['fast', 500],
          ['slow', 1],
        ]),
      },
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 1,
    });

    expect(result.results[0]?.artifactIds).toEqual(['fast', 'fast']);
    expect(result.results[0]?.budget.total).toBeGreaterThanOrEqual(900);
    expect(result.results[0]?.artifactIds).not.toContain('unknown-price');
  });

  it('keeps expensive lower-score candidates available when they are needed to meet a minimum spend', () => {
    const result = optimizeBuild({
      artifacts,
      container,
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' }],
      constraints: {
        minBudget: 600,
        prices: new Map([
          ['fast', 500],
          ['slow', 400],
        ]),
      },
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: false,
      resultLimit: 1,
    });

    expect(result.results[0]?.artifactIds).toEqual(['fast', 'slow']);
    expect(result.results[0]?.budget.total).toBe(900);
  });

  it('normalizes mixed-objective stat units so large carry values do not erase speed', () => {
    const result = optimizeBuild({
      artifacts: [
        {
          id: 'carry-only',
          name: 'Carry Only',
          category: 'artefact/test',
          stats: [
            { key: 'stalker.artefact_properties.factor.max_weight_bonus', name: 'Carry weight', min: 100, max: 100, isPositive: true, isPercentage: false, origin: 'artefact' },
          ],
        },
        {
          id: 'speed-carry',
          name: 'Speed Carry',
          category: 'artefact/test',
          stats: [
            { key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: 5, max: 5, isPositive: true, isPercentage: true, origin: 'artefact' },
            { key: 'stalker.artefact_properties.factor.max_weight_bonus', name: 'Carry weight', min: 20, max: 20, isPositive: true, isPercentage: false, origin: 'artefact' },
          ],
        },
      ],
      container: { ...container, capacity: 2, protection: 0 },
      objectives: [
        { statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' },
        { statKey: 'stalker.artefact_properties.factor.max_weight_bonus', weight: 1, direction: 'maximize' },
      ],
      constraints: {},
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 1,
    });

    expect(result.results[0]?.artifactIds).toEqual(['speed-carry', 'speed-carry']);
    expect(result.results[0]?.stats.get('stalker.artefact_properties.factor.speed_modifier')?.value).toBeGreaterThan(0);
    expect(result.results[0]?.stats.get('stalker.artefact_properties.factor.max_weight_bonus')?.value).toBeGreaterThan(0);
  });

  it('requires multi-trait builds to include every selected objective', () => {
    const speedKey = 'stalker.artefact_properties.factor.speed_modifier';
    const carryKey = 'stalker.artefact_properties.factor.max_weight_bonus';
    const vitalityKey = 'stalker.artefact_properties.factor.health_bonus';
    const result = optimizeBuild({
      artifacts: [
        { id: 'speed-only', name: 'Speed Only', category: 'artefact/test', stats: [{ key: speedKey, name: 'Movement speed', min: 10, max: 10, isPositive: true, isPercentage: true, origin: 'artefact' }] },
        { id: 'carry-only', name: 'Carry Only', category: 'artefact/test', stats: [{ key: carryKey, name: 'Carry weight', min: 100, max: 100, isPositive: true, isPercentage: false, origin: 'artefact' }] },
        { id: 'vitality-only', name: 'Vitality Only', category: 'artefact/test', stats: [{ key: vitalityKey, name: 'Vitality', min: 5, max: 5, isPositive: true, isPercentage: true, origin: 'artefact' }] },
      ],
      container: { ...container, capacity: 3, protection: 0 },
      objectives: [
        { statKey: speedKey, weight: 1_000_000, direction: 'maximize' },
        { statKey: carryKey, weight: 1_000, direction: 'maximize' },
        { statKey: vitalityKey, weight: 1, direction: 'maximize' },
      ],
      constraints: {},
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 1,
    });

    expect(result.results[0]?.stats.get(speedKey)?.value).toBeGreaterThan(0);
    expect(result.results[0]?.stats.get(carryKey)?.value).toBeGreaterThan(0);
    expect(result.results[0]?.stats.get(vitalityKey)?.value).toBeGreaterThan(0);
    expect(result.results[0]?.artifactIds).toEqual(['speed-only', 'carry-only', 'vitality-only']);
  });

  it('returns no legal result when selected traits cannot fit together', () => {
    const speedKey = 'stalker.artefact_properties.factor.speed_modifier';
    const carryKey = 'stalker.artefact_properties.factor.max_weight_bonus';
    const vitalityKey = 'stalker.artefact_properties.factor.health_bonus';
    const result = optimizeBuild({
      artifacts: [
        { id: 'speed-only', name: 'Speed Only', category: 'artefact/test', stats: [{ key: speedKey, name: 'Movement speed', min: 10, max: 10, isPositive: true, isPercentage: true, origin: 'artefact' }] },
        { id: 'carry-only', name: 'Carry Only', category: 'artefact/test', stats: [{ key: carryKey, name: 'Carry weight', min: 100, max: 100, isPositive: true, isPercentage: false, origin: 'artefact' }] },
        { id: 'vitality-only', name: 'Vitality Only', category: 'artefact/test', stats: [{ key: vitalityKey, name: 'Vitality', min: 5, max: 5, isPositive: true, isPercentage: true, origin: 'artefact' }] },
      ],
      container: { ...container, capacity: 2, protection: 0 },
      objectives: [
        { statKey: speedKey, weight: 1_000_000, direction: 'maximize' },
        { statKey: carryKey, weight: 1_000, direction: 'maximize' },
        { statKey: vitalityKey, weight: 1, direction: 'maximize' },
      ],
      constraints: {},
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 1,
    });

    expect(result.results).toHaveLength(0);
    expect(result.stats.prunedByObjectiveCoverage).toBeGreaterThan(0);
  });

  it('does not estimate upgraded candidates from artifact-only base prices', () => {
    const generated = generateArtifactCandidates({
      artifacts: [artifacts[0]!],
      qualityDomain: [100, 175],
      levelDomain: [0, 15],
      prices: new Map([['fast', 100]]),
      strictBudget: true,
    });

    const base = generated.find((candidate) => candidate.quality === 100 && candidate.level === 0);
    const upgraded = generated.find((candidate) => candidate.quality === 175 && candidate.level === 15);

    expect(base?.price).toBe(100);
    expect(base?.priceSource.pricingPrecision).toBe('artifact_exact');
    expect(upgraded?.price).toBe(Number.POSITIVE_INFINITY);
    expect(upgraded?.priceSource.pricingPrecision).toBe('unknown');
  });

  it('uses quality rarity/category bracket prices without generic artifact estimates', () => {
    const legendaryArtifact: Artifact = {
      id: 'legendary-priced',
      name: 'Legendary Priced',
      category: 'artefact/test',
      rarity: 'rarity.ordinary',
      stats: [{ key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: 1, max: 1, isPositive: true, isPercentage: true, origin: 'artefact' }],
    };
    const uniqueArtifact: Artifact = {
      ...legendaryArtifact,
      id: 'unique-priced',
      name: 'Unique Priced',
      rarity: 'rarity.unique',
    };

    const generated = generateArtifactCandidates({
      artifacts: [legendaryArtifact, uniqueArtifact],
      qualityDomain: [175],
      levelDomain: [0],
      prices: new Map([
        ['legendary-priced', 1_000],
        ['legendary-priced|rarity.legendary', 8_000],
        ['unique-priced', 1_000],
        ['unique-priced|rarity.unique', 12_000],
      ]),
      strictBudget: true,
    });

    const legendary = generated.find((candidate) => candidate.artifactId === 'legendary-priced' && candidate.rarity === 'rarity.legendary' && candidate.level === 0);
    const unique = generated.find((candidate) => candidate.artifactId === 'unique-priced' && candidate.rarity === 'rarity.unique' && candidate.level === 0);

    expect(legendary?.price).toBe(8_000);
    expect(legendary?.priceSource).toMatchObject({ pricingPrecision: 'rarity_bracket', priceKey: 'legendary-priced|rarity.legendary' });
    expect(unique?.price).toBe(12_000);
    expect(unique?.priceSource).toMatchObject({ pricingPrecision: 'rarity_bracket', priceKey: 'unique-priced|rarity.unique' });
  });

  it('totals optimized builds with actual variant prices instead of artifact-only base prices', () => {
    const variantKey = 'fast|q175|l15|rarity.legendary';
    const generated = generateArtifactCandidates({
      artifacts: [artifacts[0]!],
      qualityDomain: [100, 175],
      levelDomain: [0, 15],
      prices: new Map([['fast', 100], [variantKey, 900]]),
      strictBudget: true,
    });

    const result = optimizeBuild({
      artifacts: [artifacts[0]!],
      candidates: generated,
      container,
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' }],
      constraints: { maxBudget: 2_000 },
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 1,
    });

    expect(result.results[0]?.candidateIds.every((id) => id.includes('|q175|l15|'))).toBe(true);
    expect(result.results[0]?.budget.total).toBe(1_800);
  });

  it('applies max and min budgets to actual variant-priced candidate totals', () => {
    const variantKey = 'fast|q175|l15|rarity.legendary';
    const generated = generateArtifactCandidates({
      artifacts: [artifacts[0]!],
      qualityDomain: [100, 175],
      levelDomain: [0, 15],
      prices: new Map([['fast', 100], [variantKey, 900]]),
      strictBudget: true,
    });

    const capped = optimizeBuild({
      artifacts: [artifacts[0]!],
      candidates: generated,
      container: { ...container, capacity: 1, protection: 0 },
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' }],
      constraints: { maxBudget: 899 },
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 1,
    });
    const minimum = optimizeBuild({
      artifacts: [artifacts[0]!],
      candidates: generated,
      container: { ...container, capacity: 1, protection: 0 },
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' }],
      constraints: { minBudget: 900 },
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 1,
    });

    expect(capped.results[0]?.candidateIds[0]).toContain('|q100|l0|');
    expect(minimum.results[0]?.candidateIds[0]).toContain('|q175|l15|');
    expect(minimum.results[0]?.budget.total).toBe(900);
  });

  it('matches the brute-force oracle on a tiny budget and danger fixture', () => {
    const input = {
      artifacts: [
        {
          id: 'fast-hot',
          name: 'Fast Hot',
          category: 'artefact/test',
          stats: [
            { key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: 5, max: 5, isPositive: true, isPercentage: true, origin: 'artefact' as const },
            { key: 'stalker.artefact_properties.factor.radiation_accumulation', name: 'Radiation', min: 0.4, max: 0.4, isPositive: false, isPercentage: false, origin: 'artefact' as const },
          ],
        },
        {
          id: 'medium',
          name: 'Medium',
          category: 'artefact/test',
          stats: [
            { key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: 3, max: 3, isPositive: true, isPercentage: true, origin: 'artefact' as const },
            { key: 'stalker.artefact_properties.factor.radiation_accumulation', name: 'Radiation', min: 0.1, max: 0.1, isPositive: false, isPercentage: false, origin: 'artefact' as const },
          ],
        },
        {
          id: 'slow-safe',
          name: 'Slow Safe',
          category: 'artefact/test',
          stats: [
            { key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: 1, max: 1, isPositive: true, isPercentage: true, origin: 'artefact' as const },
          ],
        },
      ],
      container: { ...container, capacity: 2, protection: 0 },
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' as const }],
      constraints: {
        maxBudget: 10,
        prices: new Map([
          ['fast-hot', 7],
          ['medium', 4],
          ['slow-safe', 1],
        ]),
        dangerLimits: { 'stalker.artefact_properties.factor.radiation_accumulation': 0.5 },
      },
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 3,
    };

    const optimized = optimizeBuild(input);
    const bruteForce = bruteForceOptimizeBuild(input);

    expect(optimized.results[0]?.artifactIds).toEqual(bruteForce.results[0]?.artifactIds);
    expect(optimized.results[0]?.score).toBeCloseTo(bruteForce.results[0]?.score ?? 0, 5);
  });

  it('does not reject harmful partial builds that can recover under final unrounded caps', () => {
    const result = optimizeBuild({
      artifacts: [
        {
          id: 'fast-harmful',
          name: 'Fast Harmful',
          category: 'artefact/test',
          stats: [
            { key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: 10, max: 10, isPositive: true, isPercentage: true, origin: 'artefact' },
            { key: 'stalker.artefact_properties.factor.radiation_accumulation', name: 'Radiation', min: 0.5000001, max: 0.5000001, isPositive: false, isPercentage: false, origin: 'artefact' },
          ],
        },
        {
          id: 'rad-reducer',
          name: 'Radiation Reducer',
          category: 'artefact/test',
          stats: [
            { key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: 1, max: 1, isPositive: true, isPercentage: true, origin: 'artefact' },
            { key: 'stalker.artefact_properties.factor.radiation_accumulation', name: 'Radiation', min: -0.0000002, max: -0.0000002, isPositive: true, isPercentage: false, origin: 'artefact' },
          ],
        },
      ],
      container: { ...container, capacity: 2, protection: 0 },
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' }],
      constraints: {
        dangerLimits: { 'stalker.artefact_properties.factor.radiation_accumulation': 0.5 },
      },
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: false,
      resultLimit: 1,
    });

    expect(result.results[0]?.artifactIds).toEqual(['fast-harmful', 'rad-reducer']);
    expect(result.results[0]?.stats.get('stalker.artefact_properties.factor.radiation_accumulation')?.value).toBeLessThanOrEqual(0.5);
  });

  it('recalculates returned candidate-instance builds with exact final build stats', () => {
    const artifact: Artifact = {
      id: 'actual-slow',
      name: 'Actual Slow',
      category: 'artefact/test',
      rarity: 'rarity.ordinary',
      stats: [
        { key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: 1, max: 1, isPositive: true, isPercentage: true, origin: 'artefact' },
      ],
    };
    const generated = generateArtifactCandidates({
      artifacts: [artifact],
      qualityDomain: [100],
      levelDomain: [0],
    });
    const stalePanelCandidate = {
      ...generated[0]!,
      artifactPanelStats: { 'stalker.artefact_properties.factor.speed_modifier': 10 },
    };

    const result = optimizeBuild({
      artifacts: [artifact],
      candidates: [stalePanelCandidate],
      container: { ...container, capacity: 1, protection: 0 },
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' }],
      constraints: {},
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 1,
    });

    expect(result.stats.finalVerificationCount).toBe(1);
    expect(result.results[0]?.score).toBeCloseTo(1, 5);
    expect(result.results[0]?.stats.get('stalker.artefact_properties.factor.speed_modifier')?.value).toBeCloseTo(1, 5);
  });

  it('uses the capacity-6 meet-in-the-middle path and matches the brute-force oracle on a small raw fixture', () => {
    const input = {
      artifacts: [
        {
          id: 'alpha',
          name: 'Alpha',
          category: 'artefact/test',
          stats: [
            { key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: 5, max: 5, isPositive: true, isPercentage: true, origin: 'artefact' as const },
            { key: 'stalker.artefact_properties.factor.radiation_accumulation', name: 'Radiation', min: 0.12, max: 0.12, isPositive: false, isPercentage: false, origin: 'artefact' as const },
          ],
        },
        {
          id: 'beta',
          name: 'Beta',
          category: 'artefact/test',
          stats: [
            { key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: 4, max: 4, isPositive: true, isPercentage: true, origin: 'artefact' as const },
            { key: 'stalker.artefact_properties.factor.radiation_accumulation', name: 'Radiation', min: 0.08, max: 0.08, isPositive: false, isPercentage: false, origin: 'artefact' as const },
          ],
        },
        {
          id: 'gamma',
          name: 'Gamma',
          category: 'artefact/test',
          stats: [
            { key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: 2, max: 2, isPositive: true, isPercentage: true, origin: 'artefact' as const },
          ],
        },
      ],
      container: { ...container, capacity: 6, protection: 0 },
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' as const }],
      constraints: {
        maxBudget: 18,
        prices: new Map([
          ['alpha', 4],
          ['beta', 3],
          ['gamma', 1],
        ]),
        dangerLimits: { 'stalker.artefact_properties.factor.radiation_accumulation': 0.5 },
      },
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 3,
    };

    const optimized = optimizeBuild(input);
    const bruteForce = bruteForceOptimizeBuild(input);

    expect(optimized.stats.searchStrategy).toBe('meet-in-the-middle');
    expect(optimized.results[0]?.artifactIds).toEqual(bruteForce.results[0]?.artifactIds);
    expect(optimized.results[0]?.score).toBeCloseTo(bruteForce.results[0]?.score ?? 0, 5);
  });

  it('uses the capacity-6 meet-in-the-middle path and matches brute force for generated candidate instances', () => {
    const candidateArtifacts: Artifact[] = [
      {
        id: 'candidate-alpha',
        name: 'Candidate Alpha',
        category: 'artefact/test',
        rarity: 'rarity.ordinary',
        stats: [
          { key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: 3, max: 3, isPositive: true, isPercentage: true, origin: 'artefact' },
          { key: 'stalker.artefact_properties.factor.radiation_accumulation', name: 'Radiation', min: 0.1, max: 0.1, isPositive: false, isPercentage: false, origin: 'artefact' },
        ],
      },
      {
        id: 'candidate-beta',
        name: 'Candidate Beta',
        category: 'artefact/test',
        rarity: 'rarity.ordinary',
        stats: [
          { key: 'stalker.artefact_properties.factor.speed_modifier', name: 'Movement speed', min: 2, max: 2, isPositive: true, isPercentage: true, origin: 'artefact' },
        ],
      },
    ];
    const candidates = generateArtifactCandidates({
      artifacts: candidateArtifacts,
      qualityDomain: [100],
      levelDomain: [0],
      prices: new Map([
        ['candidate-alpha', 2],
        ['candidate-beta', 1],
      ]),
      strictBudget: true,
    });
    const input = {
      artifacts: candidateArtifacts,
      candidates,
      container: { ...container, capacity: 6, protection: 0 },
      objectives: [{ statKey: 'stalker.artefact_properties.factor.speed_modifier', weight: 1, direction: 'maximize' as const }],
      constraints: {
        maxBudget: 10,
        dangerLimits: { 'stalker.artefact_properties.factor.radiation_accumulation': 0.5 },
      },
      artifactAssumption: { level: 0, quality: 100 },
      allowDuplicates: true,
      resultLimit: 2,
    };

    const optimized = optimizeBuild(input);
    const bruteForce = bruteForceOptimizeBuild(input);

    expect(optimized.stats.searchStrategy).toBe('meet-in-the-middle');
    expect(optimized.results[0]?.candidateIds).toEqual(bruteForce.results[0]?.candidateIds);
    expect(optimized.results[0]?.score).toBeCloseTo(bruteForce.results[0]?.score ?? 0, 5);
  });
});
