import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type RawWikiStat = {
  name?: { key?: string; lines?: Record<string, string> };
  key?: string;
  value?: { min?: number; max?: number; calculated?: number };
  is_positive?: boolean;
  is_percentage?: boolean;
  origin?: string;
};

export type RawWikiItem = {
  exbo_id: string;
  category: string;
  name?: { lines?: Record<string, string> };
  lines?: Record<string, string>;
  capacity?: number;
  protection?: number;
  effectiveness?: number;
  level?: number;
  quality?: number;
  rarity?: string;
  stats?: RawWikiStat[];
  additionalStats?: RawWikiStat[];
};

export type ArtifactStat = {
  key: string;
  name: string;
  min: number;
  max: number;
  isPositive: boolean;
  isPercentage: boolean;
  origin: 'artefact' | 'container' | string;
};

export type Artifact = {
  id: string;
  name: string;
  category: string;
  rarity?: string;
  level?: number;
  quality?: number;
  stats: ArtifactStat[];
  additionalStats?: ArtifactStat[];
};

export type Container = {
  id: string;
  name: string;
  category: 'containers' | 'backpacks';
  capacity: number;
  protection: number;
  effectiveness: number;
  stats: ArtifactStat[];
};

export type WikiCalculatorSnapshot = {
  containersBackpacks: RawWikiItem[];
  artifacts: RawWikiItem[];
};

function englishName(item: RawWikiItem): string {
  return item.lines?.en ?? item.name?.lines?.en ?? item.exbo_id;
}

function normalizeStat(stat: RawWikiStat): ArtifactStat | null {
  const key = stat.name?.key ?? stat.key;
  if (!key) return null;
  const calculated = stat.value?.calculated ?? 0;
  return {
    key,
    name: stat.name?.lines?.en ?? key,
    min: stat.value?.min ?? calculated,
    max: stat.value?.max ?? calculated,
    isPositive: stat.is_positive ?? true,
    isPercentage: stat.is_percentage ?? false,
    origin: stat.origin ?? 'artefact',
  };
}

export async function loadWikiCalculatorSnapshot(snapshotDirectory: string): Promise<WikiCalculatorSnapshot> {
  const directory = resolve(process.cwd(), snapshotDirectory);
  const containersBackpacks = JSON.parse(await readFile(resolve(directory, 'wiki-containers-backpacks.json'), 'utf8')) as RawWikiItem[];
  const artifacts = JSON.parse(await readFile(resolve(directory, 'wiki-artifacts.json'), 'utf8')) as RawWikiItem[];
  return { containersBackpacks, artifacts };
}

export function normalizeContainers(items: RawWikiItem[]): Container[] {
  return items.map((item) => ({
    id: item.exbo_id,
    name: englishName(item),
    category: item.category === 'backpacks' ? 'backpacks' : 'containers',
    capacity: item.capacity ?? 0,
    protection: item.protection ?? 0,
    effectiveness: item.effectiveness ?? 100,
    stats: (item.stats ?? []).map(normalizeStat).filter((stat): stat is ArtifactStat => stat !== null),
  }));
}

export function normalizeArtifacts(items: RawWikiItem[]): Artifact[] {
  return items.map((item) => ({
    id: item.exbo_id,
    name: englishName(item),
    category: item.category,
    rarity: item.rarity,
    level: item.level,
    quality: item.quality,
    stats: (item.stats ?? []).map(normalizeStat).filter((stat): stat is ArtifactStat => stat !== null),
    additionalStats: (item.additionalStats ?? []).map(normalizeStat).filter((stat): stat is ArtifactStat => stat !== null),
  }));
}

type RawExboNode = {
  type?: string;
  id?: string;
  category?: string;
  name?: { key?: string; lines?: Record<string, string> };
  formatted?: { nameColor?: string; valueColor?: string };
  key?: { key?: string; lines?: Record<string, string> };
  value?: unknown;
  min?: number;
  max?: number;
  elements?: RawExboNode[];
  infoBlocks?: RawExboNode[];
};

export type ExboRepoData = {
  artifacts: Artifact[];
  containers: Container[];
};

async function listJsonFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listJsonFiles(path);
    return entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
  }));
  return nested.flat();
}

function walkInfoNodes(item: RawExboNode): RawExboNode[] {
  const roots = item.infoBlocks ?? [];
  const nodes: RawExboNode[] = [];
  const visit = (node: RawExboNode): void => {
    nodes.push(node);
    for (const child of node.elements ?? []) visit(child);
  };
  for (const root of roots) visit(root);
  return nodes;
}

function exboEnglishName(item: RawExboNode): string {
  return item.name?.lines?.en ?? item.id ?? 'unknown';
}

function isNegativeColor(node: RawExboNode): boolean {
  return node.formatted?.nameColor?.toUpperCase() === 'C15252' || node.formatted?.valueColor?.toUpperCase() === 'C15252';
}

function normalizeExboRangeStat(node: RawExboNode): ArtifactStat | null {
  const key = node.name?.key;
  if (!key?.startsWith('stalker.artefact_properties.factor.') || typeof node.min !== 'number' || typeof node.max !== 'number') return null;
  return {
    key,
    name: node.name?.lines?.en ?? key,
    min: node.min,
    max: node.max,
    isPositive: !isNegativeColor(node),
    isPercentage: /%/.test(node.formatted?.valueColor ?? '') || ['modifier', 'factor', 'bonus', 'efficiency'].some((part) => key.includes(part)),
    origin: 'artefact',
  };
}

function numericValue(node: RawExboNode): number | undefined {
  return typeof node.value === 'number' ? node.value : undefined;
}

function normalizeExboContainer(item: RawExboNode): Container | null {
  if (!item.id) return null;
  let capacity = 0;
  let protection = 0;
  let effectiveness = 100;
  for (const node of walkInfoNodes(item)) {
    const key = node.name?.key;
    const value = numericValue(node);
    if (value === undefined) continue;
    if (key === 'stalker.tooltip.backpack.info.size') capacity = value;
    if (key === 'stalker.tooltip.backpack.stat_name.inner_protection') protection = value;
    if (key === 'stalker.tooltip.backpack.stat_name.effectiveness') effectiveness = value;
  }
  return {
    id: item.id,
    name: exboEnglishName(item),
    category: item.category === 'backpacks' ? 'backpacks' : 'containers',
    capacity,
    protection,
    effectiveness,
    stats: [],
  };
}

function normalizeExboArtifact(item: RawExboNode): Artifact | null {
  if (!item.id) return null;
  const stats = walkInfoNodes(item).map(normalizeExboRangeStat).filter((stat): stat is ArtifactStat => stat !== null);
  if (stats.length === 0) return null;
  return {
    id: item.id,
    name: exboEnglishName(item),
    category: item.category ?? 'artefact',
    stats,
    additionalStats: [],
  };
}

export async function loadExboRepoData(repoRoot: string, locale = 'ru'): Promise<ExboRepoData> {
  const itemsRoot = resolve(repoRoot, locale, 'items');
  const artifactFiles = await listJsonFiles(join(itemsRoot, 'artefact'));
  const containerFiles = [
    ...(await listJsonFiles(join(itemsRoot, 'containers'))),
    ...(await listJsonFiles(join(itemsRoot, 'backpacks')).catch(() => [] as string[])),
  ];

  const artifacts = (await Promise.all(artifactFiles.map(async (file) => normalizeExboArtifact(JSON.parse(await readFile(file, 'utf8')) as RawExboNode))))
    .filter((artifact): artifact is Artifact => artifact !== null);
  const containers = (await Promise.all(containerFiles.map(async (file) => normalizeExboContainer(JSON.parse(await readFile(file, 'utf8')) as RawExboNode))))
    .filter((container): container is Container => container !== null && container.capacity > 0);

  return { artifacts, containers };
}

export type DiffItem = {
  id: string;
  name: string;
};

export type ArtifactNameDifference = {
  id: string;
  wikiName: string;
  exboName: string;
};

export type StatValueDifference = {
  key: string;
  wikiMin: number;
  wikiMax: number;
  exboMin: number;
  exboMax: number;
  wikiPositive: boolean;
  exboPositive: boolean;
};

export type ArtifactStatDifference = {
  id: string;
  wikiName: string;
  exboName: string;
  missingInWiki: string[];
  missingInExbo: string[];
  valueDifferences: StatValueDifference[];
};

export type ArtifactVariantMismatch = {
  id: string;
  wikiName?: string;
  exboName: string;
  wikiVariantCount: number;
  exboVariantCount: number;
};

export type ContainerDifference = {
  id: string;
  wikiName: string;
  exboName: string;
  differingFields: Array<'name' | 'category' | 'capacity' | 'protection' | 'effectiveness'>;
  wiki: Pick<Container, 'name' | 'category' | 'capacity' | 'protection' | 'effectiveness'>;
  exbo: Pick<Container, 'name' | 'category' | 'capacity' | 'protection' | 'effectiveness'>;
};

export type DataSourceDiff = {
  summary: {
    wikiArtifactCount: number;
    exboArtifactCount: number;
    sharedArtifactCount: number;
    wikiOnlyArtifactCount: number;
    exboOnlyArtifactCount: number;
    artifactNameDifferenceCount: number;
    artifactStatDifferenceCount: number;
    exboDuplicateArtifactIdCount: number;
    variantMismatchCount: number;
    wikiContainerCount: number;
    exboContainerCount: number;
    sharedContainerCount: number;
    wikiOnlyContainerCount: number;
    exboOnlyContainerCount: number;
    containerDifferenceCount: number;
  };
  artifacts: {
    wikiOnly: DiffItem[];
    exboOnly: DiffItem[];
    differentNames: ArtifactNameDifference[];
    statDifferences: ArtifactStatDifference[];
    variantMismatches: ArtifactVariantMismatch[];
  };
  containers: {
    wikiOnly: DiffItem[];
    exboOnly: DiffItem[];
    differences: ContainerDifference[];
  };
  recommendation: {
    canonicalDefaults: Record<string, string>;
    notes: string[];
  };
};

export type CompareDataSourcesInput = {
  wikiArtifacts: Artifact[];
  exboArtifacts: Artifact[];
  wikiContainers: Container[];
  exboContainers: Container[];
};

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function groupById<T extends { id: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(item.id, [...(groups.get(item.id) ?? []), item]);
  return groups;
}

function sortedIds(ids: Iterable<string>): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function diffItems<T extends { id: string; name: string }>(source: Map<string, T>, against: Map<string, T>): DiffItem[] {
  return sortedIds(source.keys())
    .filter((id) => !against.has(id))
    .map((id) => ({ id, name: source.get(id)?.name ?? id }));
}

function allArtifactStats(artifact: Artifact): ArtifactStat[] {
  return [...artifact.stats, ...(artifact.additionalStats ?? [])];
}

function statKey(stat: ArtifactStat): string {
  return stat.key.replace('stalker.artefact_properties.factor.', '');
}

function statsByShortKey(artifact: Artifact): Map<string, ArtifactStat> {
  const stats = new Map<string, ArtifactStat>();
  for (const stat of allArtifactStats(artifact)) {
    const key = statKey(stat);
    const existing = stats.get(key);
    if (!existing) {
      stats.set(key, stat);
      continue;
    }
    stats.set(key, {
      ...existing,
      min: Math.min(existing.min, stat.min),
      max: Math.max(existing.max, stat.max),
      isPositive: existing.isPositive && stat.isPositive,
    });
  }
  return stats;
}

function numbersDiffer(a: number, b: number, tolerance = 1e-6): boolean {
  return Math.abs(a - b) > tolerance;
}

function compareArtifactStats(wiki: Artifact, exbo: Artifact): ArtifactStatDifference | null {
  const wikiStats = statsByShortKey(wiki);
  const exboStats = statsByShortKey(exbo);
  const wikiKeys = new Set(wikiStats.keys());
  const exboKeys = new Set(exboStats.keys());
  const missingInWiki = sortedIds(exboKeys).filter((key) => !wikiKeys.has(key));
  const missingInExbo = sortedIds(wikiKeys).filter((key) => !exboKeys.has(key));
  const valueDifferences: StatValueDifference[] = [];

  for (const key of sortedIds(wikiKeys)) {
    const wikiStat = wikiStats.get(key);
    const exboStat = exboStats.get(key);
    if (!wikiStat || !exboStat) continue;
    if (
      numbersDiffer(wikiStat.min, exboStat.min) ||
      numbersDiffer(wikiStat.max, exboStat.max) ||
      wikiStat.isPositive !== exboStat.isPositive
    ) {
      valueDifferences.push({
        key,
        wikiMin: wikiStat.min,
        wikiMax: wikiStat.max,
        exboMin: exboStat.min,
        exboMax: exboStat.max,
        wikiPositive: wikiStat.isPositive,
        exboPositive: exboStat.isPositive,
      });
    }
  }

  if (missingInWiki.length === 0 && missingInExbo.length === 0 && valueDifferences.length === 0) return null;
  return {
    id: wiki.id,
    wikiName: wiki.name,
    exboName: exbo.name,
    missingInWiki,
    missingInExbo,
    valueDifferences,
  };
}

function compareContainer(wiki: Container, exbo: Container): ContainerDifference | null {
  const differingFields: ContainerDifference['differingFields'] = [];
  if (wiki.name !== exbo.name) differingFields.push('name');
  if (wiki.category !== exbo.category) differingFields.push('category');
  if (wiki.capacity !== exbo.capacity) differingFields.push('capacity');
  if (numbersDiffer(wiki.protection, exbo.protection)) differingFields.push('protection');
  if (numbersDiffer(wiki.effectiveness, exbo.effectiveness)) differingFields.push('effectiveness');
  if (differingFields.length === 0) return null;
  return {
    id: wiki.id,
    wikiName: wiki.name,
    exboName: exbo.name,
    differingFields,
    wiki: {
      name: wiki.name,
      category: wiki.category,
      capacity: wiki.capacity,
      protection: wiki.protection,
      effectiveness: wiki.effectiveness,
    },
    exbo: {
      name: exbo.name,
      category: exbo.category,
      capacity: exbo.capacity,
      protection: exbo.protection,
      effectiveness: exbo.effectiveness,
    },
  };
}

export function compareDataSources(input: CompareDataSourcesInput): DataSourceDiff {
  const wikiArtifacts = byId(input.wikiArtifacts);
  const exboArtifacts = byId(input.exboArtifacts);
  const wikiArtifactGroups = groupById(input.wikiArtifacts);
  const exboArtifactGroups = groupById(input.exboArtifacts);
  const wikiContainers = byId(input.wikiContainers);
  const exboContainers = byId(input.exboContainers);

  const sharedArtifactIds = sortedIds(wikiArtifacts.keys()).filter((id) => exboArtifacts.has(id));
  const sharedContainerIds = sortedIds(wikiContainers.keys()).filter((id) => exboContainers.has(id));
  const differentNames = sharedArtifactIds
    .map((id) => ({ id, wiki: wikiArtifacts.get(id), exbo: exboArtifacts.get(id) }))
    .filter((item): item is { id: string; wiki: Artifact; exbo: Artifact } => Boolean(item.wiki && item.exbo))
    .filter(({ wiki, exbo }) => wiki.name !== exbo.name)
    .map(({ id, wiki, exbo }) => ({ id, wikiName: wiki.name, exboName: exbo.name }));
  const statDifferences = sharedArtifactIds
    .map((id) => {
      const wiki = wikiArtifacts.get(id);
      const exbo = exboArtifacts.get(id);
      return wiki && exbo ? compareArtifactStats(wiki, exbo) : null;
    })
    .filter((difference): difference is ArtifactStatDifference => difference !== null);
  const containerDifferences = sharedContainerIds
    .map((id) => {
      const wiki = wikiContainers.get(id);
      const exbo = exboContainers.get(id);
      return wiki && exbo ? compareContainer(wiki, exbo) : null;
    })
    .filter((difference): difference is ContainerDifference => difference !== null);

  const wikiOnlyArtifacts = diffItems(wikiArtifacts, exboArtifacts);
  const exboOnlyArtifacts = diffItems(exboArtifacts, wikiArtifacts);
  const variantMismatches = sortedIds(new Set([...wikiArtifactGroups.keys(), ...exboArtifactGroups.keys()]))
    .map((id) => {
      const wikiGroup = wikiArtifactGroups.get(id) ?? [];
      const exboGroup = exboArtifactGroups.get(id) ?? [];
      return {
        id,
        wikiName: wikiGroup[0]?.name,
        exboName: exboGroup[0]?.name ?? id,
        wikiVariantCount: wikiGroup.length,
        exboVariantCount: exboGroup.length,
      };
    })
    .filter((item) => item.wikiVariantCount !== item.exboVariantCount);
  const exboDuplicateArtifactIdCount = [...exboArtifactGroups.values()].filter((group) => group.length > 1).length;
  const wikiOnlyContainers = diffItems(wikiContainers, exboContainers);
  const exboOnlyContainers = diffItems(exboContainers, wikiContainers);

  return {
    summary: {
      wikiArtifactCount: input.wikiArtifacts.length,
      exboArtifactCount: input.exboArtifacts.length,
      sharedArtifactCount: sharedArtifactIds.length,
      wikiOnlyArtifactCount: wikiOnlyArtifacts.length,
      exboOnlyArtifactCount: exboOnlyArtifacts.length,
      artifactNameDifferenceCount: differentNames.length,
      artifactStatDifferenceCount: statDifferences.length,
      exboDuplicateArtifactIdCount,
      variantMismatchCount: variantMismatches.length,
      wikiContainerCount: input.wikiContainers.length,
      exboContainerCount: input.exboContainers.length,
      sharedContainerCount: sharedContainerIds.length,
      wikiOnlyContainerCount: wikiOnlyContainers.length,
      exboOnlyContainerCount: exboOnlyContainers.length,
      containerDifferenceCount: containerDifferences.length,
    },
    artifacts: {
      wikiOnly: wikiOnlyArtifacts,
      exboOnly: exboOnlyArtifacts,
      differentNames,
      statDifferences,
      variantMismatches,
    },
    containers: {
      wikiOnly: wikiOnlyContainers,
      exboOnly: exboOnlyContainers,
      differences: containerDifferences,
    },
    recommendation: {
      canonicalDefaults: {
        calculatorStats: 'Wiki normalized snapshot until formula parity examples prove EXBO variant selection is equivalent',
        itemUniverse: 'EXBO repo for complete variant coverage, Wiki snapshot for currently calculator-visible base artifacts',
        names: 'Wiki English names when present; EXBO names as fallback',
        containers: 'Wiki for calculator parity; EXBO for offline regeneration when fields match',
        marketIds: 'EXBO IDs, with explicit mapping report for unpriced/mismatched IDs',
      },
      notes: [
        'Wiki exposes the smaller calculator-visible artifact set; EXBO exposes many upgrade/variant records.',
        'A shared ID with stat differences should be reviewed before switching canonical stats away from Wiki.',
        'Container capacity/protection/effectiveness differences affect optimizer validity and should be treated as high priority.',
      ],
    },
  };
}

function tableRows(items: DiffItem[], limit: number): string {
  if (items.length === 0) return '_None._\n';
  return items.slice(0, limit).map((item) => `| \`${item.id}\` | ${item.name} |`).join('\n') + '\n';
}

export function formatDataSourceDiffMarkdown(diff: DataSourceDiff, options: { limit?: number } = {}): string {
  const limit = options.limit ?? 50;
  const lines: string[] = [];
  lines.push('# EXBO vs Wiki Data Diff Report');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Count |');
  lines.push('|---|---:|');
  for (const [key, value] of Object.entries(diff.summary)) lines.push(`| ${key} | ${value} |`);
  lines.push('');
  lines.push('## Wiki-only artifacts');
  lines.push('');
  lines.push('| ID | Name |');
  lines.push('|---|---|');
  lines.push(tableRows(diff.artifacts.wikiOnly, limit));
  lines.push('## EXBO-only artifacts');
  lines.push('');
  lines.push('| ID | Name |');
  lines.push('|---|---|');
  lines.push(tableRows(diff.artifacts.exboOnly, limit));
  lines.push('## Artifact name differences');
  lines.push('');
  lines.push('| ID | Wiki | EXBO |');
  lines.push('|---|---|---|');
  if (diff.artifacts.differentNames.length === 0) lines.push('| _None_ |  |  |');
  for (const item of diff.artifacts.differentNames.slice(0, limit)) lines.push(`| \`${item.id}\` | ${item.wikiName} | ${item.exboName} |`);
  lines.push('');
  lines.push('## Artifact variant-count mismatches');
  lines.push('');
  lines.push('| ID | Wiki variants | EXBO variants | Name |');
  lines.push('|---|---:|---:|---|');
  if (diff.artifacts.variantMismatches.length === 0) lines.push('| _None_ |  |  |  |');
  for (const item of diff.artifacts.variantMismatches.slice(0, limit)) lines.push(`| \`${item.id}\` | ${item.wikiVariantCount} | ${item.exboVariantCount} | ${item.wikiName ?? item.exboName} / ${item.exboName} |`);
  lines.push('');
  lines.push('## Artifact stat differences');
  lines.push('');
  lines.push('| ID | Name | Missing in Wiki | Missing in EXBO | Value/sign differences |');
  lines.push('|---|---|---|---|---|');
  if (diff.artifacts.statDifferences.length === 0) lines.push('| _None_ |  |  |  |  |');
  for (const item of diff.artifacts.statDifferences.slice(0, limit)) {
    const valueSummary = item.valueDifferences
      .slice(0, 8)
      .map((stat) => `${stat.key}: wiki ${stat.wikiMin}..${stat.wikiMax}${stat.wikiPositive ? '+' : '-'} / exbo ${stat.exboMin}..${stat.exboMax}${stat.exboPositive ? '+' : '-'}`)
      .join('<br>');
    lines.push(`| \`${item.id}\` | ${item.wikiName} / ${item.exboName} | ${item.missingInWiki.join(', ') || '—'} | ${item.missingInExbo.join(', ') || '—'} | ${valueSummary || '—'} |`);
  }
  lines.push('');
  lines.push('## Container/backpack differences');
  lines.push('');
  lines.push('| ID | Fields | Wiki | EXBO |');
  lines.push('|---|---|---|---|');
  if (diff.containers.differences.length === 0) lines.push('| _None_ |  |  |  |');
  for (const item of diff.containers.differences.slice(0, limit)) {
    lines.push(`| \`${item.id}\` | ${item.differingFields.join(', ')} | ${item.wiki.name}; cap ${item.wiki.capacity}; prot ${item.wiki.protection}; eff ${item.wiki.effectiveness} | ${item.exbo.name}; cap ${item.exbo.capacity}; prot ${item.exbo.protection}; eff ${item.exbo.effectiveness} |`);
  }
  lines.push('');
  lines.push('## Canonical-source recommendation');
  lines.push('');
  for (const [field, source] of Object.entries(diff.recommendation.canonicalDefaults)) lines.push(`- **${field}:** ${source}`);
  lines.push('');
  for (const note of diff.recommendation.notes) lines.push(`- ${note}`);
  lines.push('');
  return lines.join('\n');
}
