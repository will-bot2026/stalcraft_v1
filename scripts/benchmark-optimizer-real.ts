import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import type { Artifact, Container } from '../packages/stalcraft-data/src/index.js';
import { generateArtifactCandidates, optimizeBuild, type ArtifactCandidateInstance, type OptimizeBuildInput } from '../packages/stalcraft-optimizer/src/index.js';

const movementKey = 'stalker.artefact_properties.factor.speed_modifier';
const runningKey = 'stalker.artefact_properties.factor.sprint_speed_modifier';

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(process.cwd(), path), 'utf8')) as T;
}

function statValue(artifact: Artifact, key: string): number {
  return artifact.stats.find((stat) => stat.key === key)?.max ?? 0;
}

function objectivePotential(artifact: Artifact): number {
  return statValue(artifact, movementKey) + statValue(artifact, runningKey);
}

function deterministicPrice(artifact: Artifact, index: number): number {
  return 100_000 + index * 25_000 + Math.round(Math.max(0, objectivePotential(artifact)) * 10_000);
}

function selectBenchmarkContainer(containers: Container[]): Container {
  return containers
    .filter((container) => container.capacity === 6)
    .sort((a, b) => b.effectiveness - a.effectiveness || b.protection - a.protection || a.id.localeCompare(b.id))[0]
    ?? containers.sort((a, b) => b.capacity - a.capacity || a.id.localeCompare(b.id))[0]!;
}

function summarize(name: string, input: OptimizeBuildInput, generatedCandidates: ArtifactCandidateInstance[], artifactCount: number, marketDataMode: string): unknown {
  const startedAt = performance.now();
  const result = optimizeBuild(input);
  const runtimeMs = performance.now() - startedAt;
  return {
    name,
    artifactCountConsidered: artifactCount,
    generatedCandidateCount: generatedCandidates.length,
    optimizerCandidateCount: result.stats.candidateCount,
    prunedCandidateCount: result.stats.prunedCandidateCount,
    partialPrunedCount: result.stats.prunedPartialCount,
    runtimeMs: Number(runtimeMs.toFixed(3)),
    visitedLeaves: result.stats.visitedLeaves,
    visitedNodes: result.stats.visitedNodes,
    finalVerificationCount: result.stats.finalVerificationCount,
    searchStrategy: result.stats.searchStrategy,
    bestScore: result.results[0]?.score ?? null,
    budget: input.constraints.maxBudget ?? null,
    marketDataMode,
    bestArtifactIds: result.results[0]?.artifactIds ?? [],
  };
}

const artifacts = await readJson<Artifact[]>('data/normalized/artifacts.json');
const containers = await readJson<Container[]>('data/normalized/containers.json');
const container = selectBenchmarkContainer(containers);
const selectedArtifacts = artifacts
  .filter((artifact) => objectivePotential(artifact) > 0)
  .sort((a, b) => objectivePotential(b) - objectivePotential(a) || a.id.localeCompare(b.id))
  .slice(0, 18);

const prices = new Map(selectedArtifacts.map((artifact, index) => [artifact.id, deterministicPrice(artifact, index)]));
const generatedCandidates = generateArtifactCandidates({
  artifacts: selectedArtifacts,
  qualityDomain: [100],
  levelDomain: [0],
  additionalStatPolicy: 'none',
  prices,
  strictBudget: true,
});

const input: OptimizeBuildInput = {
  artifacts: selectedArtifacts,
  candidates: generatedCandidates,
  container,
  objectives: [
    { statKey: movementKey, weight: 1, direction: 'maximize' },
    { statKey: runningKey, weight: 1, direction: 'maximize' },
  ],
  constraints: {
    maxBudget: 2_000_000,
  },
  artifactAssumption: { level: 0, quality: 100 },
  allowDuplicates: true,
  resultLimit: 5,
};

console.log(JSON.stringify({
  scenarios: [
    summarize('real-normalized-speed-subset', input, generatedCandidates, selectedArtifacts.length, 'deterministic synthetic prices over real artifact ids'),
  ],
}, null, 2));
