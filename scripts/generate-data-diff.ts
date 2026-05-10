import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  compareDataSources,
  formatDataSourceDiffMarkdown,
  loadExboRepoData,
  loadWikiCalculatorSnapshot,
  normalizeArtifacts,
  normalizeContainers,
} from '../packages/stalcraft-data/src/index.js';

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  const next = process.argv[index + 1];
  if (arg?.startsWith('--') && next && !next.startsWith('--')) {
    args.set(arg.slice(2), next);
    index += 1;
  }
}

const snapshotDir = args.get('wiki-snapshot') ?? '../data-snapshots';
const exboRepo = args.get('exbo-repo') ?? '/tmp/stalcraft-analysis/stalcraft-database';
const outDir = resolve(process.cwd(), args.get('out') ?? 'reports/data-diff');

const snapshot = await loadWikiCalculatorSnapshot(snapshotDir);
const wikiArtifacts = normalizeArtifacts(snapshot.artifacts);
const wikiContainers = normalizeContainers(snapshot.containersBackpacks);
const exbo = await loadExboRepoData(exboRepo);
const diff = compareDataSources({
  wikiArtifacts,
  exboArtifacts: exbo.artifacts,
  wikiContainers,
  exboContainers: exbo.containers,
});

await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, 'exbo-vs-wiki-diff.json'), `${JSON.stringify(diff, null, 2)}\n`);
await writeFile(resolve(outDir, 'exbo-vs-wiki-diff.md'), formatDataSourceDiffMarkdown(diff, { limit: 200 }));

console.log(JSON.stringify({
  outDir,
  markdown: resolve(outDir, 'exbo-vs-wiki-diff.md'),
  json: resolve(outDir, 'exbo-vs-wiki-diff.json'),
  summary: diff.summary,
}, null, 2));
