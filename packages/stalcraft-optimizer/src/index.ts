import type { Artifact, Container } from '../../stalcraft-data/src/index.js';
import {
  resolveVariantPrice,
  variantPriceKeyWithoutRarity,
  type PricePrecision,
  type PriceVariantScope,
} from '../../stalcraft-market/src/variant-pricing.js';
import {
  calculateArtifactPanelStats,
  calculateArtifactStats,
  calculateFinalBuildStats,
  ACCUMULATION_STATS,
  CONTAINER_PROTECTABLE_STATS,
  isWithinDangerLimits,
  sumStats,
  WIKI_DANGER_LIMITS,
  type ArtifactAssumption,
  type CalculatedStat,
  type SummedStat,
} from '../../stalcraft-core/src/index.js';

export type ArtifactRarity =
  | 'rarity.ordinary'
  | 'rarity.unordinary'
  | 'rarity.special'
  | 'rarity.rare'
  | 'rarity.exclusive'
  | 'rarity.legendary'
  | 'rarity.unique';

export type ObjectiveTerm = {
  statKey: string;
  weight: number;
  direction: 'maximize' | 'minimize';
};

export type ArtifactConstraintMode = 'include' | 'exclude';

export type ArtifactConstraint = {
  artifactId: string;
  mode: ArtifactConstraintMode;
};

export type OptimizeBuildInput = {
  artifacts: Artifact[];
  container: Container;
  candidates?: ArtifactCandidateInstance[];
  objectives: ObjectiveTerm[];
  constraints: {
    maxBudget?: number;
    minBudget?: number;
    prices?: Map<string, number>;
    dangerLimits?: Record<string, number>;
    rarity?: { mode: 'exact' | 'at_or_below' | 'at_or_above'; rarity: string };
    artifactConstraints?: ArtifactConstraint[];
  };
  artifactAssumption: ArtifactAssumption;
  allowDuplicates: boolean;
  resultLimit: number;
};

export type OptimizedBuild = {
  artifactIds: string[];
  candidateIds: string[];
  score: number;
  stats: Map<string, SummedStat>;
  budget: { total: number };
};

export type OptimizeBuildResult = {
  results: OptimizedBuild[];
  prunedArtifactIds: string[];
  stats: {
    candidateCount: number;
    prunedCandidateCount: number;
    visitedLeaves: number;
    visitedNodes: number;
    prunedByScoreBound: number;
    prunedByBudget: number;
    prunedByDanger: number;
    prunedPartialCount: number;
    prunedByObjectiveCoverage: number;
    finalVerificationCount: number;
    searchStrategy: 'branch-and-bound' | 'meet-in-the-middle';
  };
};

type Candidate = {
  artifact?: Artifact;
  assumption?: ArtifactAssumption;
  artifactId: string;
  candidateId: string;
  duplicateGroupKey: string;
  stats: Map<string, SummedStat>;
  price: number;
  score: number;
};

export type AdditionalStatPolicy = 'none' | 'explicit-only' | 'optimize-unlocked';

export type PriceSourceSummary = {
  region?: string;
  snapshotAt?: string;
  sampleCount?: number;
  stale?: boolean;
  variantScope?: PriceVariantScope;
  pricingPrecision?: PricePrecision;
  priceKey?: string;
  unknown?: boolean;
  marketDataStatus?: 'actual' | 'absent-estimated';
  fallbackReason?: string;
};

export type ArtifactCandidateInstance = {
  candidateId: string;
  artifactId: string;
  artifactName: string;
  level: number;
  quality: number;
  rarity: ArtifactRarity;
  selectedAdditionalStatKeys: string[];
  duplicateGroupKey: string;
  legalDuplicateLimit: number | 'container-capacity';
  artifactPanelStats: Record<string, number>;
  price: number;
  priceSource: PriceSourceSummary;
};

export type CandidateGenerationInput = {
  artifacts: Artifact[];
  qualityDomain: number[];
  levelDomain: number[];
  additionalStatPolicy?: AdditionalStatPolicy;
  explicitAdditionalStatKeysByArtifactId?: Map<string, string[]>;
  additionalStatObjectiveKeys?: Set<string>;
  prices?: Map<string, number>;
  strictBudget?: boolean;
  priceSourceByArtifactId?: Map<string, PriceSourceSummary>;
  priceSourceByPriceKey?: Map<string, PriceSourceSummary>;
};

const RARITY_ORDER: Record<string, number> = {
  'rarity.ordinary': -1,
  'rarity.unordinary': 0,
  'rarity.special': 1,
  'rarity.rare': 2,
  'rarity.exclusive': 3,
  'rarity.legendary': 4,
  'rarity.unique': 5,
};

const MITM_CANDIDATE_THRESHOLD = 16;
const MITM_PARTIAL_FRONTIER_LIMIT = 200_000;

function scoreStats(stats: Map<string, SummedStat>, objectives: ObjectiveTerm[]): number {
  return objectives.reduce((score, objective) => {
    const value = stats.get(objective.statKey)?.value ?? 0;
    return score + (objective.direction === 'maximize' ? value : -value) * objective.weight;
  }, 0);
}

function normalizeObjectiveWeights(objectives: ObjectiveTerm[], candidates: Candidate[]): ObjectiveTerm[] {
  if (objectives.length <= 1) return objectives;
  return objectives.map((objective) => {
    const maxMagnitude = Math.max(
      ...candidates.map((candidate) => Math.abs(candidate.stats.get(objective.statKey)?.value ?? 0)),
      0,
    );
    return maxMagnitude > 0 ? { ...objective, weight: objective.weight / maxMagnitude } : objective;
  });
}

function compareBuilds(a: OptimizedBuild, b: OptimizedBuild, targetBudget?: number): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.budget.total !== b.budget.total) {
    if (targetBudget !== undefined) return Math.abs(targetBudget - a.budget.total) - Math.abs(targetBudget - b.budget.total);
    return b.budget.total - a.budget.total;
  }
  const harmfulA = harmfulLoad(a.stats);
  const harmfulB = harmfulLoad(b.stats);
  if (harmfulA !== harmfulB) return harmfulA - harmfulB;
  return a.candidateIds.join('\0').localeCompare(b.candidateIds.join('\0'));
}

function isAtLeastAsGoodForObjective(a: Candidate, b: Candidate, objective: ObjectiveTerm): boolean {
  const av = a.stats.get(objective.statKey)?.value ?? 0;
  const bv = b.stats.get(objective.statKey)?.value ?? 0;
  return objective.direction === 'maximize' ? av >= bv : av <= bv;
}

function isStrictlyBetterForObjective(a: Candidate, b: Candidate, objective: ObjectiveTerm): boolean {
  const av = a.stats.get(objective.statKey)?.value ?? 0;
  const bv = b.stats.get(objective.statKey)?.value ?? 0;
  return objective.direction === 'maximize' ? av > bv : av < bv;
}

function candidateDominates(a: Candidate, b: Candidate, objectives: ObjectiveTerm[], dangerLimits: Record<string, number>, hasPriceConstraint: boolean): boolean {
  let strictlyBetter = false;

  for (const objective of objectives) {
    if (!isAtLeastAsGoodForObjective(a, b, objective)) return false;
    if (isStrictlyBetterForObjective(a, b, objective)) strictlyBetter = true;
  }

  for (const dangerKey of Object.keys(dangerLimits)) {
    const av = a.stats.get(dangerKey)?.value ?? 0;
    const bv = b.stats.get(dangerKey)?.value ?? 0;
    if (av > bv) return false;
    if (av < bv) strictlyBetter = true;
  }

  if (hasPriceConstraint) {
    if (a.price > b.price) return false;
    if (a.price < b.price) strictlyBetter = true;
  }

  return strictlyBetter;
}

function rarityMatchesRarity(rarity: string | undefined, constraint?: OptimizeBuildInput['constraints']['rarity']): boolean {
  if (!constraint || !rarity) return true;
  const artifactRank = RARITY_ORDER[rarity] ?? 0;
  const requestedRank = RARITY_ORDER[constraint.rarity] ?? 0;
  if (constraint.mode === 'exact') return artifactRank === requestedRank;
  if (constraint.mode === 'at_or_below') return artifactRank <= requestedRank;
  return artifactRank >= requestedRank;
}

function rarityMatches(artifact: Artifact, constraint?: OptimizeBuildInput['constraints']['rarity']): boolean {
  return rarityMatchesRarity(artifact.rarity, constraint);
}

function artifactConstraintSummary(constraints: OptimizeBuildInput['constraints']['artifactConstraints']): {
  requiredCounts: Map<string, number>;
  excludedIds: Set<string>;
  invalid: boolean;
} {
  const requiredCounts = new Map<string, number>();
  const excludedIds = new Set<string>();
  for (const constraint of constraints ?? []) {
    const artifactId = constraint.artifactId.trim();
    if (!artifactId) continue;
    if (constraint.mode === 'include') {
      requiredCounts.set(artifactId, (requiredCounts.get(artifactId) ?? 0) + 1);
    } else {
      excludedIds.add(artifactId);
    }
  }

  const conflict = [...requiredCounts.keys()].some((artifactId) => excludedIds.has(artifactId));
  return { requiredCounts, excludedIds, invalid: conflict };
}

function requiredArtifactTotal(requiredCounts: Map<string, number>): number {
  return [...requiredCounts.values()].reduce((total, count) => total + count, 0);
}

function satisfiesArtifactRequirements(artifactIds: string[], requiredCounts: Map<string, number>): boolean {
  if (requiredCounts.size === 0) return true;
  const selectedCounts = new Map<string, number>();
  for (const artifactId of artifactIds) selectedCounts.set(artifactId, (selectedCounts.get(artifactId) ?? 0) + 1);
  return [...requiredCounts].every(([artifactId, count]) => (selectedCounts.get(artifactId) ?? 0) >= count);
}

function strictPriceForArtifact(artifactId: string, prices: Map<string, number> | undefined, strictBudget: boolean): number {
  const price = prices?.get(artifactId);
  if (Number.isFinite(price) && price! > 0) return price!;
  return strictBudget ? Number.POSITIVE_INFINITY : 0;
}

function priceSourceForVariant(
  artifactId: string,
  quality: number,
  level: number,
  rarity: ArtifactRarity,
  input: CandidateGenerationInput,
  resolved: ReturnType<typeof resolveVariantPrice>,
): PriceSourceSummary {
  const exactKey = resolved.priceKey ?? variantPriceKeyWithoutRarity({ artifactId, quality, level });
  const exactSource = input.priceSourceByPriceKey?.get(exactKey);
  const artifactSource = input.priceSourceByArtifactId?.get(artifactId);
  const inherited = exactSource ?? artifactSource ?? {};
  return {
    ...inherited,
    variantScope: resolved.pricingPrecision === 'variant_exact'
      ? 'quality-level-aware'
      : resolved.pricingPrecision === 'rarity_bracket'
        ? 'rarity-aware'
        : inherited.variantScope ?? 'artifact-id-only',
    pricingPrecision: resolved.pricingPrecision,
    priceKey: exactKey,
    unknown: resolved.pricingPrecision === 'unknown' || !Number.isFinite(resolved.price),
  };
}

function calculatedStatsToRecord(stats: CalculatedStat[]): Record<string, number> {
  const record: Record<string, number> = {};
  for (const stat of stats) record[stat.key] = (record[stat.key] ?? 0) + stat.value;
  return record;
}

function statsRecordToSummedStats(record: Record<string, number>, source: ArtifactCandidateInstance, container: Container): Map<string, SummedStat> {
  const stats: CalculatedStat[] = Object.entries(record).map(([key, value]) => {
    let finalValue = value;
    if (ACCUMULATION_STATS.has(key) && finalValue > 0) finalValue *= container.effectiveness / 100;
    if (CONTAINER_PROTECTABLE_STATS.has(key)) finalValue *= 1 - container.protection / 100;
    const effectiveValue = finalValue > 0 && !ACCUMULATION_STATS.has(key) ? finalValue * (container.effectiveness / 100) : finalValue;
    return {
      key,
      name: key,
      value: effectiveValue,
      isPositive: effectiveValue >= 0,
      isPercentage: key.includes('modifier') || key.includes('factor') || key.includes('bonus') || key.includes('efficiency'),
      origin: source.candidateId,
    };
  });
  return sumStats(stats);
}

function candidateFromInstance(instance: ArtifactCandidateInstance, artifact: Artifact | undefined, container: Container, objectives: ObjectiveTerm[]): Candidate {
  const stats = statsRecordToSummedStats(instance.artifactPanelStats, instance, container);
  return {
    artifact,
    assumption: {
      level: instance.level,
      quality: instance.quality,
      rarity: instance.rarity,
      selectedAdditionalStatKeys: instance.selectedAdditionalStatKeys,
    },
    artifactId: instance.artifactId,
    candidateId: instance.candidateId,
    duplicateGroupKey: instance.duplicateGroupKey,
    stats,
    price: instance.price,
    score: scoreStats(stats, objectives),
  };
}

function buildCandidates(input: OptimizeBuildInput): Candidate[] {
  const { excludedIds } = artifactConstraintSummary(input.constraints.artifactConstraints);
  if (input.candidates) {
    const artifactById = new Map(input.artifacts.map((artifact) => [artifact.id, artifact]));
    return input.candidates
      .filter((candidate) => !excludedIds.has(candidate.artifactId))
      .filter((candidate) => rarityMatchesRarity(candidate.rarity, input.constraints.rarity))
      .map((candidate) => candidateFromInstance(candidate, artifactById.get(candidate.artifactId), input.container, input.objectives))
      .sort((a, b) => b.score - a.score || a.price - b.price || harmfulLoad(a.stats) - harmfulLoad(b.stats) || a.candidateId.localeCompare(b.candidateId));
  }

  const strictBudget = input.constraints.maxBudget !== undefined || input.constraints.minBudget !== undefined;
  return input.artifacts
    .filter((artifact) => !excludedIds.has(artifact.id))
    .filter((artifact) => rarityMatches(artifact, input.constraints.rarity))
    .map((artifact) => {
      const stats = sumStats(calculateArtifactStats(artifact, input.artifactAssumption, input.container));
      return {
        artifact,
        assumption: input.artifactAssumption,
        artifactId: artifact.id,
        candidateId: artifact.id,
        duplicateGroupKey: artifact.id,
        stats,
        price: strictPriceForArtifact(artifact.id, input.constraints.prices, strictBudget),
        score: scoreStats(stats, input.objectives),
      };
    })
    .sort((a, b) => b.score - a.score || a.price - b.price || harmfulLoad(a.stats) - harmfulLoad(b.stats) || a.candidateId.localeCompare(b.candidateId));
}

function pruneDominatedCandidates(input: OptimizeBuildInput, limits: Record<string, number>): { candidates: Candidate[]; prunedArtifactIds: string[]; scoringObjectives: ObjectiveTerm[] } {
  const hasStrictBudget = input.constraints.maxBudget !== undefined || input.constraints.minBudget !== undefined;
  const { requiredCounts } = artifactConstraintSummary(input.constraints.artifactConstraints);
  const allCandidates = buildCandidates(input);
  const scoringObjectives = normalizeObjectiveWeights(input.objectives, allCandidates);
  for (const candidate of allCandidates) candidate.score = scoreStats(candidate.stats, scoringObjectives);
  allCandidates.sort((a, b) => b.score - a.score || a.price - b.price || harmfulLoad(a.stats) - harmfulLoad(b.stats) || a.candidateId.localeCompare(b.candidateId));
  const candidates = hasStrictBudget ? allCandidates.filter((candidate) => Number.isFinite(candidate.price)) : allCandidates;
  const hasPriceConstraint = input.constraints.maxBudget !== undefined && input.constraints.minBudget === undefined;
  const prunedArtifactIds: string[] = hasStrictBudget ? allCandidates.filter((candidate) => !Number.isFinite(candidate.price)).map((candidate) => candidate.candidateId) : [];
  const kept = candidates.filter((candidate, candidateIndex) => {
    const dominated = candidates.some((other, otherIndex) => {
      if (otherIndex === candidateIndex) return false;
      if (requiredCounts.has(candidate.artifactId) && other.artifactId !== candidate.artifactId) return false;
      return candidateDominates(other, candidate, input.objectives, limits, hasPriceConstraint);
    });
    if (dominated) prunedArtifactIds.push(candidate.candidateId);
    return !dominated;
  });
  return { candidates: kept, prunedArtifactIds, scoringObjectives };
}

function addMaps(left: Map<string, SummedStat>, right: Map<string, SummedStat>): Map<string, SummedStat> {
  const summed = new Map<string, SummedStat>();
  for (const [key, value] of left) {
    summed.set(key, { ...value, sources: [...value.sources] });
  }
  for (const [key, value] of right) {
    const existing = summed.get(key);
    if (!existing) {
      summed.set(key, { ...value, sources: [...value.sources] });
    } else {
      existing.value += value.value;
      existing.sources.push(...value.sources);
    }
  }
  return summed;
}

function createOptimizerStats(
  candidateCount: number,
  prunedCandidateCount: number,
  searchStrategy: OptimizeBuildResult['stats']['searchStrategy'],
): OptimizeBuildResult['stats'] {
  return {
    candidateCount,
    prunedCandidateCount,
    visitedLeaves: 0,
    visitedNodes: 0,
    prunedByScoreBound: 0,
    prunedByBudget: 0,
    prunedByDanger: 0,
    prunedPartialCount: 0,
    prunedByObjectiveCoverage: 0,
    finalVerificationCount: 0,
    searchStrategy,
  };
}

function verifyFinalBuild(
  candidatesById: Map<string, Candidate>,
  candidateIds: string[],
  fallbackStats: Map<string, SummedStat>,
  fallbackScore: number,
  container: Container,
  objectives: ObjectiveTerm[],
): { stats: Map<string, SummedStat>; score: number } {
  const entries: { artifact: Artifact; assumption: ArtifactAssumption }[] = [];
  for (const candidateId of candidateIds) {
    const candidate = candidatesById.get(candidateId);
    if (!candidate?.artifact || !candidate.assumption) return { stats: fallbackStats, score: fallbackScore };
    entries.push({ artifact: candidate.artifact, assumption: candidate.assumption });
  }
  const stats = calculateFinalBuildStats(entries, container);
  return { stats, score: scoreStats(stats, objectives) };
}

function minAcceptedScore(results: OptimizedBuild[], resultLimit: number): number {
  if (results.length < resultLimit) return -Infinity;
  return results[results.length - 1]?.score ?? -Infinity;
}

function harmfulLoad(stats: Map<string, SummedStat>): number {
  return Object.keys(WIKI_DANGER_LIMITS).reduce((total, key) => total + Math.max(0, stats.get(key)?.value ?? 0), 0);
}

function objectiveSatisfied(stats: Map<string, SummedStat>, objective: ObjectiveTerm): boolean {
  const value = stats.get(objective.statKey)?.value ?? 0;
  return objective.direction === 'maximize' ? value > 0 : value < 0;
}

function satisfiesAllSelectedObjectives(stats: Map<string, SummedStat>, objectives: ObjectiveTerm[]): boolean {
  if (objectives.length <= 1) return true;
  return objectives.every((objective) => objectiveSatisfied(stats, objective));
}

export function qualityRollDomainForRarity(rarity: ArtifactRarity | string): number[] {
  const ranges: Record<string, [number, number]> = {
    'rarity.ordinary': [85, 100],
    'rarity.unordinary': [100, 115],
    'rarity.special': [115, 130],
    'rarity.rare': [130, 145],
    'rarity.exclusive': [145, 160],
    'rarity.legendary': [160, 175],
    'rarity.unique': [175, 190],
  };
  const [min, max] = ranges[rarity] ?? [100, 100];
  const values: number[] = [];
  for (let quality = min; quality <= max; quality += 1) values.push(quality);
  return values;
}

export function legalRaritiesForQuality(quality: number, options: { uniqueLegal?: boolean } = {}): ArtifactRarity[] {
  if (quality < 100) return ['rarity.ordinary'];
  if (quality === 100) return ['rarity.ordinary', 'rarity.unordinary'];
  if (quality < 115) return ['rarity.unordinary'];
  if (quality === 115) return ['rarity.unordinary', 'rarity.special'];
  if (quality < 130) return ['rarity.special'];
  if (quality === 130) return ['rarity.special', 'rarity.rare'];
  if (quality < 145) return ['rarity.rare'];
  if (quality === 145) return ['rarity.rare', 'rarity.exclusive'];
  if (quality < 160) return ['rarity.exclusive'];
  if (quality === 160) return ['rarity.exclusive', 'rarity.legendary'];
  if (quality < 175) return ['rarity.legendary'];
  if (quality === 175) return options.uniqueLegal ? ['rarity.legendary', 'rarity.unique'] : ['rarity.legendary'];
  return options.uniqueLegal ? ['rarity.unique'] : ['rarity.legendary'];
}

function artifactAllowsUnique(artifact: Artifact): boolean {
  return artifact.rarity === 'rarity.unique';
}

function unlockedAdditionalTraitSlots(level: number): number {
  if (level >= 15) return 3;
  if (level >= 10) return 2;
  if (level >= 5) return 1;
  return 0;
}

function combinationsOfSize(keys: string[], size: number): string[][] {
  if (size <= 0) return [[]];
  if (keys.length <= size) return [keys];
  const results: string[][] = [];
  function visit(startIndex: number, selected: string[]): void {
    if (selected.length === size) {
      results.push([...selected]);
      return;
    }
    const remainingNeeded = size - selected.length;
    for (let index = startIndex; index <= keys.length - remainingNeeded; index += 1) {
      visit(index + 1, [...selected, keys[index]!]);
    }
  }
  visit(0, []);
  return results;
}

function selectedAdditionalStatKeyVariantsForArtifact(artifact: Artifact, input: CandidateGenerationInput, level: number): string[][] {
  const policy = input.additionalStatPolicy ?? 'none';
  if (policy === 'none') return [[]];

  const legalKeys = (artifact.additionalStats ?? []).map((stat) => stat.key).sort();
  const legal = new Set(legalKeys);
  if (policy === 'explicit-only') {
    return [(input.explicitAdditionalStatKeysByArtifactId?.get(artifact.id) ?? []).filter((key) => legal.has(key)).sort()];
  }

  const unlockedSlots = unlockedAdditionalTraitSlots(level);
  if (unlockedSlots === 0 || legalKeys.length === 0) return [[]];

  // Normal artifacts have exactly three possible additional traits: +5 picks one,
  // +10 picks two, and +15 has all three active. Rubik currently exposes a much
  // larger special mechanic list, so bound that one by objective/danger relevance
  // until its unique rules are source-truthed separately.
  const relevantKeys = input.additionalStatObjectiveKeys;
  const candidateKeys = legalKeys.length <= 3 || !relevantKeys
    ? legalKeys
    : legalKeys.filter((key) => relevantKeys.has(key));
  if (candidateKeys.length === 0) return [[]];
  return combinationsOfSize(candidateKeys, Math.min(unlockedSlots, candidateKeys.length));
}

export function generateArtifactCandidates(input: CandidateGenerationInput): ArtifactCandidateInstance[] {
  const candidates: ArtifactCandidateInstance[] = [];
  const strictBudget = input.strictBudget ?? false;
  for (const artifact of input.artifacts) {
    for (const quality of input.qualityDomain) {
      for (const rarity of legalRaritiesForQuality(quality, { uniqueLegal: artifactAllowsUnique(artifact) })) {
        for (const level of input.levelDomain) {
          const selectedAdditionalStatKeyVariants = selectedAdditionalStatKeyVariantsForArtifact(artifact, input, level);
          for (const selectedAdditionalStatKeys of selectedAdditionalStatKeyVariants) {
            const assumption: ArtifactAssumption = { level, quality, rarity, selectedAdditionalStatKeys };
            const panelStats = calculatedStatsToRecord(calculateArtifactPanelStats(artifact, assumption));
            const selectedKeySuffix = selectedAdditionalStatKeys.length > 0 ? selectedAdditionalStatKeys.join('+') : 'none';
            const candidateId = `${artifact.id}|q${quality}|l${level}|${rarity}|add:${selectedKeySuffix}`;
            const resolvedPrice = resolveVariantPrice({ artifactId: artifact.id, quality, level, rarity }, input.prices, { strictBudget });
            candidates.push({
              candidateId,
              artifactId: artifact.id,
              artifactName: artifact.name,
              level,
              quality,
              rarity,
              selectedAdditionalStatKeys,
              duplicateGroupKey: artifact.id,
              legalDuplicateLimit: 'container-capacity',
              artifactPanelStats: panelStats,
              price: resolvedPrice.price,
              priceSource: priceSourceForVariant(artifact.id, quality, level, rarity, input, resolvedPrice),
            });
          }
        }
      }
    }
  }
  return candidates.sort((a, b) => a.candidateId.localeCompare(b.candidateId));
}

type PartialBuild = {
  indexes: number[];
  artifactIds: string[];
  candidateIds: string[];
  stats: Map<string, SummedStat>;
  total: number;
  score: number;
};

function estimatePartialCount(candidateCount: number, allowDuplicates: boolean): number {
  let total = 1;
  for (let size = 1; size <= 3; size += 1) {
    total += combinations(allowDuplicates ? candidateCount + size - 1 : candidateCount, size);
  }
  return total;
}

function combinations(n: number, k: number): number {
  if (k < 0 || n < k) return 0;
  if (k === 0) return 1;
  let result = 1;
  for (let index = 1; index <= k; index += 1) result = (result * (n - k + index)) / index;
  return result;
}

function partialBoundaryKey(partial: PartialBuild, side: 'left' | 'right', allowDuplicates: boolean): string {
  const boundary = side === 'left'
    ? partial.indexes.at(-1) ?? -1
    : partial.indexes[0] ?? Number.MAX_SAFE_INTEGER;
  return `${partial.indexes.length}|${allowDuplicates ? 'dup' : 'unique'}|${boundary}`;
}

function partialDominates(a: PartialBuild, b: PartialBuild, objectives: ObjectiveTerm[], limits: Record<string, number>, hasPriceConstraint: boolean): boolean {
  let strictlyBetter = false;
  if (a.score < b.score) return false;
  if (a.score > b.score) strictlyBetter = true;

  for (const objective of objectives) {
    const av = a.stats.get(objective.statKey)?.value ?? 0;
    const bv = b.stats.get(objective.statKey)?.value ?? 0;
    if (objective.direction === 'maximize' && av < bv) return false;
    if (objective.direction === 'minimize' && av > bv) return false;
  }

  for (const dangerKey of Object.keys(limits)) {
    const av = a.stats.get(dangerKey)?.value ?? 0;
    const bv = b.stats.get(dangerKey)?.value ?? 0;
    if (av > bv) return false;
    if (av < bv) strictlyBetter = true;
  }

  if (hasPriceConstraint) {
    if (a.total > b.total) return false;
    if (a.total < b.total) strictlyBetter = true;
  }

  const identityCompare = a.candidateIds.join('\0').localeCompare(b.candidateIds.join('\0'));
  return strictlyBetter || (identityCompare < 0 && a.score === b.score && (!hasPriceConstraint || a.total === b.total));
}

function prunePartialFrontier(
  partials: PartialBuild[],
  side: 'left' | 'right',
  input: OptimizeBuildInput,
  limits: Record<string, number>,
): { partials: PartialBuild[]; prunedCount: number } {
  const hasPriceConstraint = input.constraints.maxBudget !== undefined && input.constraints.minBudget === undefined;
  const groups = new Map<string, PartialBuild[]>();
  for (const partial of partials) {
    const key = partialBoundaryKey(partial, side, input.allowDuplicates);
    groups.set(key, [...(groups.get(key) ?? []), partial]);
  }

  const kept: PartialBuild[] = [];
  let prunedCount = 0;
  for (const group of groups.values()) {
    for (let index = 0; index < group.length; index += 1) {
      const partial = group[index]!;
      const dominated = group.some((other, otherIndex) => otherIndex !== index && partialDominates(other, partial, input.objectives, limits, hasPriceConstraint));
      if (dominated) {
        prunedCount += 1;
      } else {
        kept.push(partial);
      }
    }
  }

  return {
    partials: kept.sort((a, b) => b.score - a.score || a.total - b.total || a.candidateIds.join('\0').localeCompare(b.candidateIds.join('\0'))),
    prunedCount,
  };
}

function generatePartialBuilds(candidates: Candidate[], input: OptimizeBuildInput, maxSize: number, stats: OptimizeBuildResult['stats']): PartialBuild[] {
  const partials: PartialBuild[] = [];

  function visit(startIndex: number, indexes: number[], artifactIds: string[], candidateIds: string[], currentStats: Map<string, SummedStat>, total: number, score: number): void {
    stats.visitedNodes += 1;
    partials.push({ indexes, artifactIds, candidateIds, stats: currentStats, total, score });
    if (indexes.length === maxSize) return;

    for (let index = startIndex; index < candidates.length; index += 1) {
      const candidate = candidates[index]!;
      const nextTotal = total + candidate.price;
      if (input.constraints.maxBudget !== undefined && nextTotal > input.constraints.maxBudget) {
        stats.prunedByBudget += 1;
        continue;
      }
      visit(
        input.allowDuplicates ? index : index + 1,
        [...indexes, index],
        [...artifactIds, candidate.artifactId],
        [...candidateIds, candidate.candidateId],
        addMaps(currentStats, candidate.stats),
        nextTotal,
        score + candidate.score,
      );
    }
  }

  visit(0, [], [], [], new Map(), 0, 0);
  return partials;
}

function partialsAreJoinCompatible(left: PartialBuild, right: PartialBuild, allowDuplicates: boolean): boolean {
  const leftLast = left.indexes.at(-1);
  const rightFirst = right.indexes[0];
  if (leftLast === undefined || rightFirst === undefined) return true;
  return allowDuplicates ? leftLast <= rightFirst : leftLast < rightFirst;
}

function shouldUseMitm(slots: number, candidateCount: number, allowDuplicates: boolean): boolean {
  if (slots !== 6) return false;
  if (candidateCount > MITM_CANDIDATE_THRESHOLD) return false;
  return estimatePartialCount(candidateCount, allowDuplicates) <= MITM_PARTIAL_FRONTIER_LIMIT;
}

export function optimizeBuild(input: OptimizeBuildInput): OptimizeBuildResult {
  const results: OptimizedBuild[] = [];
  const slots = input.container.capacity;
  const limits = input.constraints.dangerLimits ?? WIKI_DANGER_LIMITS;
  const artifactConstraints = artifactConstraintSummary(input.constraints.artifactConstraints);
  const preflightInvalid = artifactConstraints.invalid || requiredArtifactTotal(artifactConstraints.requiredCounts) > slots;
  const { candidates, prunedArtifactIds, scoringObjectives } = pruneDominatedCandidates(input, limits);
  const hasArtifactConstraints = artifactConstraints.requiredCounts.size > 0 || artifactConstraints.excludedIds.size > 0;
  const useMitm = !hasArtifactConstraints && shouldUseMitm(slots, candidates.length, input.allowDuplicates);
  const stats = createOptimizerStats(candidates.length, prunedArtifactIds.length, useMitm ? 'meet-in-the-middle' : 'branch-and-bound');
  if (preflightInvalid) return { results, prunedArtifactIds, stats };
  const candidatesById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const bestRemainingScore = Math.max(0, ...candidates.map((candidate) => candidate.score));
  const finitePrices = candidates.map((candidate) => candidate.price).filter((price) => Number.isFinite(price));
  const cheapestPrice = finitePrices.length > 0 ? Math.min(...finitePrices) : Number.POSITIVE_INFINITY;

  function pushResult(artifactIds: string[], candidateIds: string[], currentStats: Map<string, SummedStat>, total: number, score: number): void {
    stats.finalVerificationCount += 1;
    if (!satisfiesArtifactRequirements(artifactIds, artifactConstraints.requiredCounts)) {
      stats.prunedByObjectiveCoverage += 1;
      return;
    }
    const verified = verifyFinalBuild(candidatesById, candidateIds, currentStats, score, input.container, scoringObjectives);
    if (!satisfiesAllSelectedObjectives(verified.stats, input.objectives)) {
      stats.prunedByObjectiveCoverage += 1;
      return;
    }
    if (!isWithinDangerLimits(verified.stats, limits)) {
      stats.prunedByDanger += 1;
      return;
    }
    results.push({ artifactIds, candidateIds, score: verified.score, stats: verified.stats, budget: { total } });
    results.sort((a, b) => compareBuilds(a, b, input.constraints.maxBudget));
    if (results.length > input.resultLimit) results.pop();
  }

  if (useMitm) {
    const partials = generatePartialBuilds(candidates, input, 3, stats);
    const leftFrontier = prunePartialFrontier(partials, 'left', input, limits);
    const rightFrontier = prunePartialFrontier(partials, 'right', input, limits);
    stats.prunedPartialCount = leftFrontier.prunedCount + rightFrontier.prunedCount;

    for (const left of leftFrontier.partials) {
      for (const right of rightFrontier.partials) {
        if (left.indexes.length + right.indexes.length !== slots) continue;
        if (!partialsAreJoinCompatible(left, right, input.allowDuplicates)) continue;
        const total = left.total + right.total;
        if (input.constraints.maxBudget !== undefined && total > input.constraints.maxBudget) {
          stats.prunedByBudget += 1;
          continue;
        }
        if (input.constraints.minBudget !== undefined && total < input.constraints.minBudget) {
          stats.prunedByBudget += 1;
          continue;
        }
        stats.visitedLeaves += 1;
        pushResult(
          [...left.artifactIds, ...right.artifactIds],
          [...left.candidateIds, ...right.candidateIds],
          addMaps(left.stats, right.stats),
          total,
          left.score + right.score,
        );
      }
    }

    return { results, prunedArtifactIds, stats };
  }

  function visit(startIndex: number, selectedIds: string[], selectedCandidateIds: string[], currentStats: Map<string, SummedStat>, currentTotal: number, currentScore: number): void {
    stats.visitedNodes += 1;
    const remainingSlots = slots - selectedIds.length;
    if (remainingSlots === 0) {
      stats.visitedLeaves += 1;
      if (input.constraints.minBudget !== undefined && currentTotal < input.constraints.minBudget) {
        stats.prunedByBudget += 1;
        return;
      }
      if (!isWithinDangerLimits(currentStats, limits)) {
        stats.prunedByDanger += 1;
        return;
      }
      pushResult(selectedIds, selectedCandidateIds, currentStats, currentTotal, currentScore);
      return;
    }

    if (currentScore + remainingSlots * bestRemainingScore < minAcceptedScore(results, input.resultLimit)) {
      stats.prunedByScoreBound += 1;
      return;
    }

    if (input.constraints.maxBudget !== undefined && currentTotal + remainingSlots * cheapestPrice > input.constraints.maxBudget) {
      stats.prunedByBudget += 1;
      return;
    }

    for (let index = startIndex; index < candidates.length; index += 1) {
      const candidate = candidates[index]!;
      const nextTotal = currentTotal + candidate.price;
      if (input.constraints.maxBudget !== undefined && nextTotal > input.constraints.maxBudget) {
        stats.prunedByBudget += 1;
        continue;
      }
      const nextStats = addMaps(currentStats, candidate.stats);
      visit(input.allowDuplicates ? index : index + 1, [...selectedIds, candidate.artifactId], [...selectedCandidateIds, candidate.candidateId], nextStats, nextTotal, currentScore + candidate.score);
    }
  }

  visit(0, [], [], new Map(), 0, 0);
  return { results, prunedArtifactIds, stats };
}

export function bruteForceOptimizeBuild(input: OptimizeBuildInput): OptimizeBuildResult {
  const results: OptimizedBuild[] = [];
  const slots = input.container.capacity;
  const limits = input.constraints.dangerLimits ?? WIKI_DANGER_LIMITS;
  const artifactConstraints = artifactConstraintSummary(input.constraints.artifactConstraints);
  const candidates = buildCandidates(input);
  const scoringObjectives = normalizeObjectiveWeights(input.objectives, candidates);
  for (const candidate of candidates) candidate.score = scoreStats(candidate.stats, scoringObjectives);
  candidates.sort((a, b) => b.score - a.score || a.price - b.price || harmfulLoad(a.stats) - harmfulLoad(b.stats) || a.candidateId.localeCompare(b.candidateId));
  const stats = createOptimizerStats(candidates.length, 0, 'branch-and-bound');
  if (artifactConstraints.invalid || requiredArtifactTotal(artifactConstraints.requiredCounts) > slots) return { results, prunedArtifactIds: [], stats };
  const candidatesById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));

  function pushResult(artifactIds: string[], candidateIds: string[], currentStats: Map<string, SummedStat>, total: number, score: number): void {
    stats.finalVerificationCount += 1;
    if (!satisfiesArtifactRequirements(artifactIds, artifactConstraints.requiredCounts)) {
      stats.prunedByObjectiveCoverage += 1;
      return;
    }
    const verified = verifyFinalBuild(candidatesById, candidateIds, currentStats, score, input.container, scoringObjectives);
    if (!satisfiesAllSelectedObjectives(verified.stats, input.objectives)) {
      stats.prunedByObjectiveCoverage += 1;
      return;
    }
    if (!isWithinDangerLimits(verified.stats, limits)) {
      stats.prunedByDanger += 1;
      return;
    }
    results.push({ artifactIds, candidateIds, score: verified.score, stats: verified.stats, budget: { total } });
    results.sort((a, b) => compareBuilds(a, b, input.constraints.maxBudget));
    if (results.length > input.resultLimit) results.pop();
  }

  function visit(startIndex: number, selectedIds: string[], selectedCandidateIds: string[], currentStats: Map<string, SummedStat>, currentTotal: number, currentScore: number): void {
    stats.visitedNodes += 1;
    if (selectedIds.length === slots) {
      stats.visitedLeaves += 1;
      if (input.constraints.maxBudget !== undefined && currentTotal > input.constraints.maxBudget) {
        stats.prunedByBudget += 1;
        return;
      }
      if (input.constraints.minBudget !== undefined && currentTotal < input.constraints.minBudget) {
        stats.prunedByBudget += 1;
        return;
      }
      if (!isWithinDangerLimits(currentStats, limits)) {
        stats.prunedByDanger += 1;
        return;
      }
      pushResult(selectedIds, selectedCandidateIds, currentStats, currentTotal, currentScore);
      return;
    }

    for (let index = startIndex; index < candidates.length; index += 1) {
      const candidate = candidates[index]!;
      visit(
        input.allowDuplicates ? index : index + 1,
        [...selectedIds, candidate.artifactId],
        [...selectedCandidateIds, candidate.candidateId],
        addMaps(currentStats, candidate.stats),
        currentTotal + candidate.price,
        currentScore + candidate.score,
      );
    }
  }

  visit(0, [], [], new Map(), 0, 0);
  return { results, prunedArtifactIds: [], stats };
}
