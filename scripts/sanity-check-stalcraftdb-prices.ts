import { readFile } from 'node:fs/promises';
import type { LatestArtifactPrice, MarketRegion } from '../packages/stalcraft-market/src/index.js';

type Args = {
  db?: string;
  snapshot?: string;
  items: string[];
  region: 'na';
  maxAgeDays: number;
  maxRatio: number;
  strict: boolean;
};

type Snapshot = {
  region?: MarketRegion;
  items?: Array<{
    itemId: string;
    variantKey?: string;
    pricingPrecision?: string;
    sampleCount?: number;
    medianPrice?: number | null;
    valid?: boolean;
    snapshotAt?: string;
  }>;
};

type ExternalRow = { price?: unknown; time?: unknown; date?: unknown; createdAt?: unknown; additional?: unknown };
type ExternalHistory = { total?: unknown; prices?: ExternalRow[] };

function parseArgs(argv: string[]): Args {
  const args: Args = {
    snapshot: 'apps/web/static/market/latest-NA.json',
    items: ['04yr', 'lj0j', 'qodk'],
    region: 'na',
    maxAgeDays: 45,
    maxRatio: 20,
    strict: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = argv[index + 1];
    if (arg === '--') continue;
    if (arg === '--db') { args.db = next; args.snapshot = undefined; index += 1; }
    else if (arg === '--snapshot') { args.snapshot = next; args.db = undefined; index += 1; }
    else if (arg === '--items') { args.items = (next ?? '').split(',').map((item) => item.trim()).filter(Boolean); index += 1; }
    else if (arg === '--region') { args.region = (next ?? '').toLowerCase() as Args['region']; index += 1; }
    else if (arg === '--max-age-days') { args.maxAgeDays = Number(next); index += 1; }
    else if (arg === '--max-ratio') { args.maxRatio = Number(next); index += 1; }
    else if (arg === '--strict') { args.strict = true; }
    else if (arg === '--help') { printHelp(); process.exit(0); }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.region !== 'na') throw new Error('stalcraftdb sanity checks are fixed to --region na for UltimateBuild');
  if (args.items.length === 0) throw new Error('At least one --items id is required');
  return args;
}

function printHelp(): void {
  console.log(`Usage:
  pnpm market:sanity:stalcraftdb -- --snapshot apps/web/static/market/latest-NA.json --items 04yr,lj0j,qodk
  pnpm market:sanity:stalcraftdb -- --db .cache/market.sqlite --items 04yr,lj0j,qodk
  pnpm market:sanity:stalcraftdb -- --db .cache/market.sqlite --items 04yr,lj0j,qodk --strict

Compares local NA 30-day artifact median prices with stalcraftdb.net/na auction-history shape and median order of magnitude.
By default, stalcraftdb price divergence is reported as structured warnings because that endpoint can disagree with live EXBO data and often omits variant fields. Use --strict to fail on divergences.
This is an explicit network sanity check, not a deterministic unit test.`);
}

function median(values: number[]): number {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function priceRatio(left: number, right: number): number {
  return Math.max(left, right) / Math.max(1, Math.min(left, right));
}

function rowTime(row: ExternalRow): number | undefined {
  const value = row.time ?? row.date ?? row.createdAt;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
}

async function loadLocalArtifactRows(args: Args): Promise<LatestArtifactPrice[]> {
  if (args.db) {
    const { createSQLiteMarketStore } = await import('../packages/stalcraft-market/src/index.js');
    const store = createSQLiteMarketStore(args.db);
    try {
      return store.queryLatestArtifactPrices({ region: 'NA', itemIds: args.items })
        .filter((row) => row.variantKey === 'artifact');
    } finally {
      store.close();
    }
  }

  const snapshot = JSON.parse(await readFile(args.snapshot!, 'utf8')) as Snapshot;
  if (snapshot.region !== 'NA') throw new Error(`Expected NA snapshot, received ${snapshot.region ?? 'unknown'}`);
  return (snapshot.items ?? [])
    .filter((item) => args.items.includes(item.itemId) && (item.variantKey === undefined || item.variantKey === 'artifact'))
    .map((item) => ({
      itemId: item.itemId,
      region: 'NA',
      variantKey: 'artifact',
      medianPrice: item.medianPrice ?? 0,
      sampleCount: item.sampleCount ?? 0,
      snapshotAt: item.snapshotAt ?? new Date(0).toISOString(),
      staleAfter: new Date(0).toISOString(),
      variantScope: 'artifact-id-only',
      valid: item.valid === true,
    }));
}

async function fetchStalcraftdbHistory(itemId: string, region: 'na'): Promise<ExternalHistory> {
  const url = `https://stalcraftdb.net/api/items/${encodeURIComponent(itemId)}/auction-history?region=${region}&page=1`;
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`stalcraftdb ${itemId} HTTP ${response.status}`);
  return await response.json() as ExternalHistory;
}

const args = parseArgs(process.argv.slice(2));
const localRows = await loadLocalArtifactRows(args);
const localByItem = new Map(localRows.map((row) => [row.itemId, row]));
const failures: string[] = [];
const warnings: string[] = [];
const results = [];

for (const itemId of args.items) {
  const local = localByItem.get(itemId);
  if (!local?.valid || !Number.isFinite(local.medianPrice) || local.medianPrice <= 0) {
    warnings.push(`${itemId}: local artifact median is missing or invalid; skipping comparison`);
    continue;
  }

  let external: ExternalHistory;
  try {
    external = await fetchStalcraftdbHistory(itemId, args.region);
  } catch (error) {
    failures.push(`${itemId}: failed to fetch stalcraftdb ${args.region.toUpperCase()} auction history: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  if (!Array.isArray(external.prices)) {
    failures.push(`${itemId}: stalcraftdb response did not include prices[]`);
    continue;
  }
  if (typeof external.total !== 'number') warnings.push(`${itemId}: stalcraftdb response did not expose numeric total`);
  const externalPrices = external.prices
    .map((row) => typeof row.price === 'number' ? row.price : undefined)
    .filter((price): price is number => price !== undefined && price > 0);
  if (externalPrices.length === 0) {
    warnings.push(`${itemId}: stalcraftdb returned no positive prices on page 1`);
    continue;
  }

  const newest = Math.max(...external.prices.map(rowTime).filter((time): time is number => time !== undefined));
  if (Number.isFinite(newest)) {
    const ageDays = (Date.now() - newest) / 86_400_000;
    if (ageDays > args.maxAgeDays) warnings.push(`${itemId}: newest stalcraftdb row is ${ageDays.toFixed(1)} days old`);
  } else {
    warnings.push(`${itemId}: stalcraftdb rows did not expose parseable timestamps for recency check`);
  }
  const rowsWithVariantFields = external.prices.filter((row) => {
    if (!row.additional || typeof row.additional !== 'object' || Array.isArray(row.additional)) return false;
    return Object.keys(row.additional as Record<string, unknown>).length > 0;
  }).length;
  if (rowsWithVariantFields === 0) {
    warnings.push(`${itemId}: stalcraftdb page 1 lacks non-empty additional variant fields, so this only sanity-checks artifact-level price shape`);
  }

  const externalMedian = median(externalPrices);
  const ratio = priceRatio(local.medianPrice, externalMedian);
  if (ratio > args.maxRatio) {
    const message = `${itemId}: local median ${local.medianPrice} vs stalcraftdb page median ${externalMedian} ratio ${ratio.toFixed(2)} exceeds ${args.maxRatio}`;
    if (args.strict) failures.push(message);
    else warnings.push(message);
  }
  results.push({
    itemId,
    region: 'NA',
    localMedian: local.medianPrice,
    localSampleCount: local.sampleCount,
    stalcraftdbPageMedian: externalMedian,
    stalcraftdbPageRows: externalPrices.length,
    ratio: Number(ratio.toFixed(2)),
  });
}

console.log(JSON.stringify({ checkedAt: new Date().toISOString(), source: 'https://stalcraftdb.net/na', results, warnings, failures }, null, 2));
if (failures.length > 0) process.exit(1);
