import { performance } from 'node:perf_hooks';
import type { Artifact, Container } from '../packages/stalcraft-data/src/index.js';
import { generateArtifactCandidates, optimizeBuild, type OptimizeBuildInput } from '../packages/stalcraft-optimizer/src/index.js';

const speedKey = 'stalker.artefact_properties.factor.speed_modifier';
const radiationKey = 'stalker.artefact_properties.factor.radiation_accumulation';

const container: Container = {
  id: 'bench-berloga-6',
  name: 'Benchmark 6',
  category: 'containers',
  capacity: 6,
  protection: 0,
  effectiveness: 100,
  stats: [],
};

function artifact(id: string, speed: number, radiation = 0): Artifact {
  return {
    id,
    name: id,
    category: 'artefact/benchmark',
    rarity: 'rarity.ordinary',
    stats: [
      { key: speedKey, name: 'Movement speed', min: speed, max: speed, isPositive: true, isPercentage: true, origin: 'artefact' },
      ...(radiation > 0 ? [{ key: radiationKey, name: 'Radiation', min: radiation, max: radiation, isPositive: false, isPercentage: false, origin: 'artefact' as const }] : []),
    ],
  };
}

function runScenario(name: string, input: OptimizeBuildInput, candidateCount: number): unknown {
  const startedAt = performance.now();
  const result = optimizeBuild(input);
  const runtimeMs = performance.now() - startedAt;
  return {
    name,
    candidateCount,
    optimizerCandidateCount: result.stats.candidateCount,
    skylinePrunedCount: result.stats.prunedCandidateCount,
    partialPrunedCount: result.stats.prunedPartialCount,
    runtimeMs: Number(runtimeMs.toFixed(3)),
    visitedLeaves: result.stats.visitedLeaves,
    visitedNodes: result.stats.visitedNodes,
    finalVerificationCount: result.stats.finalVerificationCount,
    searchStrategy: result.stats.searchStrategy,
    bestScore: result.results[0]?.score ?? null,
    bestArtifactIds: result.results[0]?.artifactIds ?? [],
  };
}

const rawArtifacts = [
  artifact('bench-alpha', 5, 0.12),
  artifact('bench-beta', 4, 0.08),
  artifact('bench-gamma', 2),
  artifact('bench-delta', 1),
];

const rawInput: OptimizeBuildInput = {
  artifacts: rawArtifacts,
  container,
  objectives: [{ statKey: speedKey, weight: 1, direction: 'maximize' }],
  constraints: {
    maxBudget: 18,
    prices: new Map([
      ['bench-alpha', 4],
      ['bench-beta', 3],
      ['bench-gamma', 1],
      ['bench-delta', 1],
    ]),
    dangerLimits: { [radiationKey]: 0.5 },
  },
  artifactAssumption: { level: 0, quality: 100 },
  allowDuplicates: true,
  resultLimit: 5,
};

const generatedArtifacts = [
  artifact('generated-alpha', 3, 0.1),
  artifact('generated-beta', 2),
  artifact('generated-gamma', 1),
];
const generatedCandidates = generateArtifactCandidates({
  artifacts: generatedArtifacts,
  qualityDomain: [100],
  levelDomain: [0],
  prices: new Map([
    ['generated-alpha', 2],
    ['generated-beta', 1],
    ['generated-gamma', 1],
  ]),
  strictBudget: true,
});

const generatedInput: OptimizeBuildInput = {
  artifacts: generatedArtifacts,
  candidates: generatedCandidates,
  container,
  objectives: [{ statKey: speedKey, weight: 1, direction: 'maximize' }],
  constraints: {
    maxBudget: 10,
    dangerLimits: { [radiationKey]: 0.5 },
  },
  artifactAssumption: { level: 0, quality: 100 },
  allowDuplicates: true,
  resultLimit: 5,
};

console.log(JSON.stringify({
  scenarios: [
    runScenario('raw-artifact-compatibility', rawInput, rawArtifacts.length),
    runScenario('generated-candidate-instances', generatedInput, generatedCandidates.length),
  ],
}, null, 2));
