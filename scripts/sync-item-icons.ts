import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const projectRoot = resolve(process.cwd());
const localIconRoot = process.env.STALCRAFT_DATABASE_ROOT
  ? resolve(process.env.STALCRAFT_DATABASE_ROOT, 'ru/icons')
  : resolve(projectRoot, '../stalcraft-database/ru/icons');
const localIconRootLabel = process.env.STALCRAFT_DATABASE_ROOT
  ? '$STALCRAFT_DATABASE_ROOT/ru/icons'
  : '../stalcraft-database/ru/icons';
const outputRoot = resolve(projectRoot, 'apps/web/static/item-icons');
const manifestPath = resolve(projectRoot, 'data/normalized/item-icons.json');
const cdnBase = 'https://cdn3.stalcraft.wiki/exbo_item_parser';

type CatalogItem = {
  id: string;
  name: string;
  category: string;
};

type IconManifestEntry = {
  id: string;
  name: string;
  kind: 'artifact' | 'container';
  category: string;
  localPath: string;
  publicPath: string;
  source: 'local-exbo-database' | 'stalcraft-wiki-cdn';
  sourcePath: string;
  bytes: number;
};

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function download(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeFile(destination, bytes);
}

async function syncIcon(item: CatalogItem, kind: 'artifact' | 'container'): Promise<IconManifestEntry> {
  const relativeIconPath = `${item.category}/${item.id}.png`;
  const localSource = join(localIconRoot, ...item.category.split('/'), `${item.id}.png`);
  const outDir = resolve(outputRoot, kind === 'artifact' ? 'artifacts' : 'containers');
  const destination = resolve(outDir, `${item.id}.png`);
  await mkdir(outDir, { recursive: true });

  let source: IconManifestEntry['source'];
  let sourcePath: string;
  if (existsSync(localSource)) {
    await copyFile(localSource, destination);
    source = 'local-exbo-database';
    sourcePath = relativeIconPath;
  } else {
    const url = `${cdnBase}/${relativeIconPath}`;
    await download(url, destination);
    source = 'stalcraft-wiki-cdn';
    sourcePath = url;
  }

  const fileStat = await stat(destination);
  return {
    id: item.id,
    name: item.name,
    kind,
    category: item.category,
    localPath: destination.replace(`${projectRoot}/`, ''),
    publicPath: `/item-icons/${kind === 'artifact' ? 'artifacts' : 'containers'}/${item.id}.png`,
    source,
    sourcePath,
    bytes: fileStat.size,
  };
}

async function main(): Promise<void> {
  const artifacts = await readJson<CatalogItem[]>(resolve(projectRoot, 'data/normalized/artifacts.json'));
  const containers = await readJson<CatalogItem[]>(resolve(projectRoot, 'data/normalized/containers.json'));
  const entries: IconManifestEntry[] = [];

  for (const artifact of artifacts) entries.push(await syncIcon(artifact, 'artifact'));
  for (const container of containers) entries.push(await syncIcon(container, 'container'));

  entries.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  await writeFile(manifestPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), source: { localIconRoot: localIconRootLabel, cdnBase }, entries }, null, 2)}\n`);

  const localCount = entries.filter((entry) => entry.source === 'local-exbo-database').length;
  const cdnCount = entries.filter((entry) => entry.source === 'stalcraft-wiki-cdn').length;
  console.log(`synced ${entries.length} item icons (${localCount} local, ${cdnCount} cdn) -> ${outputRoot}`);
  console.log(`manifest -> ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
