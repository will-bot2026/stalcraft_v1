import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ARTIFACT_STAT_CATALOG } from '../packages/stalcraft-nlp/src/index.js';
import { loadExboRepoData, loadWikiCalculatorSnapshot, normalizeArtifacts, normalizeContainers, type Artifact, type Container } from '../packages/stalcraft-data/src/index.js';

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const source = argValue('--source') ?? 'wiki';
const outputDir = resolve(process.cwd(), argValue('--out') ?? 'data/normalized');
let artifacts: Artifact[];
let containers: Container[];

if (source === 'exbo') {
  const repoRoot = argValue('--repo') ?? '/tmp/stalcraft-analysis/stalcraft-database';
  const locale = argValue('--locale') ?? 'ru';
  const data = await loadExboRepoData(repoRoot, locale);
  artifacts = data.artifacts;
  containers = data.containers;
} else if (source === 'wiki') {
  const snapshotDir = argValue('--snapshots') ?? process.argv[2] ?? '../data-snapshots';
  const snapshot = await loadWikiCalculatorSnapshot(snapshotDir);
  artifacts = normalizeArtifacts(snapshot.artifacts);
  containers = normalizeContainers(snapshot.containersBackpacks);
} else {
  throw new Error(`Unknown data source: ${source}. Expected "wiki" or "exbo".`);
}

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, 'artifacts.json'), `${JSON.stringify(artifacts, null, 2)}\n`);
await writeFile(resolve(outputDir, 'containers.json'), `${JSON.stringify(containers, null, 2)}\n`);
await writeFile(resolve(outputDir, 'stat-catalog.json'), `${JSON.stringify(ARTIFACT_STAT_CATALOG, null, 2)}\n`);

console.log(JSON.stringify({ source, artifacts: artifacts.length, containers: containers.length, statKeys: ARTIFACT_STAT_CATALOG.length, outputDir }, null, 2));
