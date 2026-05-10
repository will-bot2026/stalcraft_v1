#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { parseOptimizationPrompt } from '../../../packages/stalcraft-nlp/src/index.js';
import { optimizeBuild } from '../../../packages/stalcraft-optimizer/src/index.js';
import { calculateDerivedStats, WIKI_DANGER_LIMITS } from '../../../packages/stalcraft-core/src/index.js';
import { buildHistoryMedianPriceMap, createDefaultMarketClient } from '../../../packages/stalcraft-market/src/index.js';
import { serializeDerivedStats, serializeStatsMap } from './response.js';
import type { Artifact, Container } from '../../../packages/stalcraft-data/src/index.js';

const prompt = process.argv.slice(2).join(' ').trim();

if (!prompt) {
  console.error('Usage: pnpm optimize "Generate a Berloga 6 build for movement speed under 5 million"');
  process.exit(1);
}

const request = parseOptimizationPrompt(prompt);
const artifacts = JSON.parse(await readFile('data/normalized/artifacts.json', 'utf8')) as Artifact[];
const containers = JSON.parse(await readFile('data/normalized/containers.json', 'utf8')) as Container[];
const container = containers.find((candidate) => candidate.id === request.containerId);

if (!container) {
  console.error(`Container not found: ${request.containerId}`);
  process.exit(1);
}

if (request.objectives.length === 0) {
  console.error('No recognized objective stats in prompt. Try movement speed, running speed, carry weight, vitality, healing, frost, bio, rad, psy, or temperature.');
  process.exit(1);
}

const marketPriceMap = request.constraints.maxBudget !== undefined || request.constraints.minBudget !== undefined
  ? await buildHistoryMedianPriceMap(
    await createDefaultMarketClient(),
    artifacts.map((artifact) => artifact.id),
    { region: request.budget.region, limit: 200 },
  )
  : undefined;

const result = optimizeBuild({
  artifacts,
  container,
  objectives: request.objectives,
  constraints: {
    dangerLimits: WIKI_DANGER_LIMITS,
    maxBudget: request.constraints.maxBudget,
    minBudget: request.constraints.minBudget,
    prices: marketPriceMap,
    rarity: request.constraints.rarity,
  },
  artifactAssumption: request.artifactAssumption,
  allowDuplicates: true,
  resultLimit: 5,
});

const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
const response = {
  request,
  container: { id: container.id, name: container.name, capacity: container.capacity, protection: container.protection, effectiveness: container.effectiveness },
  prunedArtifactCount: result.prunedArtifactIds.length,
  optimizerStats: result.stats,
  market: marketPriceMap ? {
    region: request.budget.region,
    priceMode: request.budget.priceMode,
    pricedArtifactCount: marketPriceMap.size,
    unpricedArtifactIds: artifacts.map((artifact) => artifact.id).filter((id) => !Number.isFinite(marketPriceMap.get(id)) || (marketPriceMap.get(id) ?? 0) <= 0),
  } : null,
  results: result.results.map((build) => ({
    artifactIds: build.artifactIds,
    artifacts: build.artifactIds.map((id) => ({
      id,
      name: artifactById.get(id)?.name ?? id,
      level: request.artifactAssumption.level,
      quality: request.artifactAssumption.quality,
      rarity: request.artifactAssumption.rarity ?? artifactById.get(id)?.rarity,
    })),
    score: build.score,
    budget: {
      total: build.budget.total,
      max: request.constraints.maxBudget,
      min: request.constraints.minBudget,
      pricedByHistoryMedian: build.artifactIds.map((id) => ({
        id,
        medianUnitPrice: marketPriceMap?.get(id) ?? 0,
      })),
    },
    objectiveStats: Object.fromEntries(request.objectives.map((objective) => [objective.statKey, build.stats.get(objective.statKey)?.value ?? 0])),
    dangerStats: Object.fromEntries(Object.entries(WIKI_DANGER_LIMITS).map(([key, limit]) => [key, { value: build.stats.get(key)?.value ?? 0, limit }])),
    allStats: serializeStatsMap(build.stats),
    derivedStats: serializeDerivedStats(calculateDerivedStats(build.stats)),
  })),
};

console.log(JSON.stringify(response, null, 2));
