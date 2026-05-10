import type { Artifact, ArtifactStat, Container } from '../../stalcraft-data/src/index.js';

export type ArtifactAssumption = {
  level: number;
  quality: number;
  rarity?: string;
  selectedAdditionalStatKeys?: string[];
};

export type CalculatedStat = {
  key: string;
  name: string;
  value: number;
  isPositive: boolean;
  isPercentage: boolean;
  origin: string;
};

export const RADIATION = 'stalker.artefact_properties.factor.radiation_accumulation';
export const BIOLOGICAL = 'stalker.artefact_properties.factor.biological_accumulation';
export const PSYCHO = 'stalker.artefact_properties.factor.psycho_accumulation';
export const THERMAL = 'stalker.artefact_properties.factor.thermal_accumulation';
export const FROST = 'stalker.artefact_properties.factor.frost_accumulation';
export const BLEEDING = 'stalker.artefact_properties.factor.bleeding_accumulation';
export const BURNING = 'stalker.artefact_properties.factor.combustion_accumulation';

export const ACCUMULATION_STATS = new Set([RADIATION, BIOLOGICAL, PSYCHO, BLEEDING, BURNING, THERMAL, FROST]);

export const CONTAINER_PROTECTABLE_STATS = new Set([RADIATION, BIOLOGICAL, PSYCHO, BLEEDING, THERMAL]);

export const WIKI_DANGER_LIMITS: Record<string, number> = {
  [RADIATION]: 0.5,
  [BIOLOGICAL]: 0.5,
  [PSYCHO]: 0.5,
  [THERMAL]: 0.5,
  [FROST]: 1,
};

const RARITY_INDEX: Record<string, number> = {
  'rarity.unordinary': 0,
  'rarity.special': 1,
  'rarity.rare': 2,
  'rarity.exclusive': 3,
  'rarity.legendary': 4,
  'rarity.unique': 5,
};

function wikiRange(stat: ArtifactStat, multiplier: number): { max: number; min: number; baseMax: number; baseMin: number } {
  const rawMax = Number(stat.max);
  const rawMin = Number(stat.min);
  let max = Math.max(rawMax, rawMin);
  let min = Math.min(rawMax, rawMin);
  if (rawMax <= 0 && rawMin <= 0) {
    max = Math.min(rawMax, rawMin);
    min = Math.max(rawMax, rawMin);
  }
  return { max: max * multiplier, min: min * multiplier, baseMax: max, baseMin: min };
}

function calculatePositiveRawStat(stat: ArtifactStat, assumption: ArtifactAssumption, effectivenessPercent: number): number {
  const effectiveness = ACCUMULATION_STATS.has(stat.key) ? 100 : effectivenessPercent;
  const { max } = wikiRange(stat, effectiveness / 100);
  return max * (assumption.quality / 100) * (1 + (2 * assumption.level) / 100);
}

function rarityIndexForQuality(quality: number, rarity?: string): number {
  if (quality > 100 && quality <= 114.99) return RARITY_INDEX['rarity.unordinary']!;
  if (quality >= 115 && quality <= 129.99) return RARITY_INDEX['rarity.special']!;
  if (quality >= 130 && quality <= 144.99) return RARITY_INDEX['rarity.rare']!;
  if (quality >= 145 && quality <= 159.99) return RARITY_INDEX['rarity.exclusive']!;
  if (quality >= 160 && quality <= 174.99) return RARITY_INDEX['rarity.legendary']!;
  if (quality >= 175 && quality <= 190) return RARITY_INDEX['rarity.unique']!;
  return rarity ? RARITY_INDEX[rarity] ?? 0 : 0;
}

function calculateNegativeRawStat(stat: ArtifactStat, assumption: ArtifactAssumption): number {
  const { max, min } = wikiRange(stat, 1);
  const quality = assumption.quality;

  if (quality <= 100) {
    if (quality === 100 && assumption.rarity === 'rarity.unordinary') {
      const rarityIndex = RARITY_INDEX[assumption.rarity]!;
      const start = 0.9 * max;
      return start + ((max - start) / 100) * ((quality - (100 + 10 * rarityIndex)) * 10);
    }
    return min + ((max - min) / 100) * quality;
  }

  const rarityFromAssumption = assumption.rarity ? RARITY_INDEX[assumption.rarity] : undefined;
  const inferredRarity = Math.floor((quality - 100) / 15);
  let rarityBand = Math.max(0, Math.min(rarityFromAssumption ?? inferredRarity, 5));
  if ([115, 130, 145, 160, 175, 190].includes(quality) && assumption.rarity) rarityBand = RARITY_INDEX[assumption.rarity] ?? rarityBand;

  const bandProgress = Math.max(0, Math.min(quality - (100 + 15 * rarityBand), 15)) / 15;
  const bandStart = 0.85 * max;
  return bandStart + (max - bandStart) * bandProgress;
}

function calculateRawStat(stat: ArtifactStat, assumption: ArtifactAssumption, effectivenessPercent: number): number {
  if (stat.isPositive) return calculatePositiveRawStat(stat, assumption, effectivenessPercent);
  return calculateNegativeRawStat(stat, assumption);
}

function applyFinalContainerEffects(stat: ArtifactStat, rawValue: number, container: Container): number {
  if (stat.origin !== 'artefact') return rawValue;
  let value = rawValue;
  if (ACCUMULATION_STATS.has(stat.key) && value > 0) {
    value *= container.effectiveness / 100;
  }
  if (CONTAINER_PROTECTABLE_STATS.has(stat.key)) {
    value *= 1 - container.protection / 100;
  }
  return value;
}

export function calculateArtifactStats(
  artifact: Artifact,
  assumption: ArtifactAssumption,
  container: Container,
): CalculatedStat[] {
  return calculateFinalArtifactStats(artifact, assumption, container);
}

function selectedStatsForArtifact(artifact: Artifact, selectedAdditionalStatKeys: string[] | undefined): ArtifactStat[] {
  if (!selectedAdditionalStatKeys || selectedAdditionalStatKeys.length === 0) return [];
  const selected = new Set(selectedAdditionalStatKeys);
  return (artifact.additionalStats ?? []).filter((stat) => selected.has(stat.key));
}

function calculateArtifactStatsInternal(
  artifact: Artifact,
  assumption: ArtifactAssumption,
  options: { effectivenessPercent: number; container?: Container },
): CalculatedStat[] {
  const effectiveAssumption = {
    ...assumption,
    rarity: assumption.rarity ?? artifact.rarity,
  };
  return [...artifact.stats, ...selectedStatsForArtifact(artifact, assumption.selectedAdditionalStatKeys)].map((stat) => {
    const rawValue = calculateRawStat(stat, effectiveAssumption, options.effectivenessPercent);
    return {
      key: stat.key,
      name: stat.name,
      value: options.container ? applyFinalContainerEffects(stat, rawValue, options.container) : rawValue,
      isPositive: stat.isPositive,
      isPercentage: stat.isPercentage,
      origin: stat.origin,
    };
  });
}

export function calculateArtifactPanelStats(artifact: Artifact, assumption: ArtifactAssumption): CalculatedStat[] {
  return calculateArtifactStatsInternal(artifact, assumption, { effectivenessPercent: 100 });
}

export function calculateFinalArtifactStats(artifact: Artifact, assumption: ArtifactAssumption, container: Container): CalculatedStat[] {
  return calculateArtifactStatsInternal(artifact, assumption, { effectivenessPercent: container.effectiveness, container });
}

function calculateContainerStats(container: Container): CalculatedStat[] {
  return (container.stats ?? []).map((stat) => ({
    key: stat.key,
    name: stat.name,
    value: Number(stat.max),
    isPositive: stat.isPositive,
    isPercentage: stat.isPercentage,
    origin: stat.origin,
  }));
}

export function calculateFinalBuildStats(
  artifacts: { artifact: Artifact; assumption: ArtifactAssumption }[],
  container: Container,
): Map<string, SummedStat> {
  return sumStats([
    ...calculateContainerStats(container),
    ...artifacts.flatMap((entry) => calculateFinalArtifactStats(entry.artifact, entry.assumption, container)),
  ]);
}

export type SummedStat = {
  key: string;
  name: string;
  value: number;
  isPercentage: boolean;
  sources: { origin: string; value: number }[];
};

export function sumStats(stats: CalculatedStat[]): Map<string, SummedStat> {
  const summed = new Map<string, SummedStat>();
  for (const stat of stats) {
    const existing = summed.get(stat.key);
    if (!existing) {
      summed.set(stat.key, {
        key: stat.key,
        name: stat.name,
        value: stat.value,
        isPercentage: stat.isPercentage,
        sources: [{ origin: stat.origin, value: stat.value }],
      });
    } else {
      existing.value += stat.value;
      existing.sources.push({ origin: stat.origin, value: stat.value });
    }
  }
  return summed;
}

export function isWithinDangerLimits(stats: Map<string, SummedStat>, limits: Record<string, number> = WIKI_DANGER_LIMITS): boolean {
  return Object.entries(limits).every(([key, limit]) => (stats.get(key)?.value ?? 0) <= limit);
}

const STAT_PREFIX = 'stalker.artefact_properties.factor.';

function valueOf(stats: Map<string, SummedStat>, shortKey: string): number {
  return stats.get(`${STAT_PREFIX}${shortKey}`)?.value ?? 0;
}

export type DerivedStatsOptions = {
  baseHealth?: number;
  baseHealingPerSecond?: number;
};

export type DerivedStats = {
  healthPool: number;
  effectiveHealthByDamage: {
    bullet: number;
    explosion: number;
    laceration: number;
    fire: number;
    chemical: number;
    electricity: number;
  };
  healingPerSecond: number;
  reactionBonuses: {
    burn: number;
    chemicalBurn: number;
    electroshock: number;
    laceration: number;
  };
};

function effectiveHealth(healthPool: number, resistancePercent: number): number {
  const damageMultiplier = Math.max(0.01, 1 - resistancePercent / 100);
  return healthPool / damageMultiplier;
}

export function calculateDerivedStats(stats: Map<string, SummedStat>, options: DerivedStatsOptions = {}): DerivedStats {
  const baseHealth = options.baseHealth ?? 100;
  const baseHealingPerSecond = options.baseHealingPerSecond ?? 0;
  const healthPool = baseHealth + valueOf(stats, 'health_bonus');
  const healEfficiency = valueOf(stats, 'heal_efficiency');

  return {
    healthPool,
    effectiveHealthByDamage: {
      bullet: effectiveHealth(healthPool, valueOf(stats, 'bullet_dmg_factor')),
      explosion: effectiveHealth(healthPool, valueOf(stats, 'explosion_dmg_factor')),
      laceration: effectiveHealth(healthPool, valueOf(stats, 'tear_dmg_factor')),
      fire: effectiveHealth(healthPool, valueOf(stats, 'burn_dmg_factor')),
      chemical: effectiveHealth(healthPool, valueOf(stats, 'chemical_burn_dmg_factor')),
      electricity: effectiveHealth(healthPool, valueOf(stats, 'electra_dmg_factor')),
    },
    healingPerSecond: baseHealingPerSecond * (1 + healEfficiency / 100) + valueOf(stats, 'artefakt_heal') + valueOf(stats, 'regeneration_bonus'),
    reactionBonuses: {
      burn: valueOf(stats, 'reaction_to_burn'),
      chemicalBurn: valueOf(stats, 'reaction_to_chemical_burn'),
      electroshock: valueOf(stats, 'reaction_to_electroshock'),
      laceration: valueOf(stats, 'reaction_to_tear'),
    },
  };
}
