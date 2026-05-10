import { DatabaseSync } from 'node:sqlite';
import { artifactQualityCategoryBracketFromQlt, createSQLiteMarketStore, type MarketRegion } from '../packages/stalcraft-market/src/index.js';

type Args = {
  db?: string;
  region: MarketRegion;
  item: string;
  days: number;
  now?: string;
};

type Row = {
  price: number;
  amount?: number;
  observed_at: string;
  raw_json?: string;
};

type ParsedRow = Row & {
  saleTime?: string;
  saleTimeMs?: number;
  additional: Record<string, unknown>;
};

type Summary = {
  count: number;
  min: number | null;
  median: number | null;
  average: number | null;
  p75: number | null;
  p90: number | null;
  max: number | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { region: 'NA', item: 'gyq5', days: 30 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = argv[index + 1];
    if (arg === '--') continue;
    if (arg === '--db') { args.db = next; index += 1; }
    else if (arg === '--region') { args.region = next as MarketRegion; index += 1; }
    else if (arg === '--item') { args.item = next ?? args.item; index += 1; }
    else if (arg === '--days') { args.days = Number(next); index += 1; }
    else if (arg === '--now') { args.now = next; index += 1; }
    else if (arg === '--help') { printHelp(); process.exit(0); }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printHelp(): void {
  console.log(`Usage:
  pnpm market:debug-artifact -- --db .cache/market.sqlite --item gyq5 --region NA --days 30

Reports raw auction-history rows, 30-day median/average, qlt bracket summaries, and common source grouping patterns.`);
}

function percentile(sorted: number[], percentileValue: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))] ?? null;
}

function summarize(values: number[]): Summary {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((left, right) => left - right);
  const count = sorted.length;
  if (count === 0) return { count, min: null, median: null, average: null, p75: null, p90: null, max: null };
  const middle = Math.floor(count / 2);
  const median = count % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return {
    count,
    min: sorted[0]!,
    median,
    average: sorted.reduce((total, value) => total + value, 0) / count,
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
    max: sorted[count - 1]!,
  };
}

function parseRow(row: Row): ParsedRow {
  if (!row.raw_json) return { ...row, additional: {} };
  try {
    const parsed = JSON.parse(row.raw_json) as { time?: unknown; additional?: unknown };
    const additional = parsed.additional && typeof parsed.additional === 'object' && !Array.isArray(parsed.additional)
      ? parsed.additional as Record<string, unknown>
      : {};
    const saleTime = typeof parsed.time === 'string' ? parsed.time : undefined;
    const saleTimeMs = saleTime ? new Date(saleTime).getTime() : undefined;
    return { ...row, saleTime, saleTimeMs: Number.isFinite(saleTimeMs) ? saleTimeMs : undefined, additional };
  } catch {
    return { ...row, additional: {} };
  }
}

function groupingKey(additional: Record<string, unknown>): string {
  const bonusProperties = Array.isArray(additional.bonus_properties) ? additional.bonus_properties.length : 0;
  const keys = ['qlt', 'ptn', 'upgrade_bonus', 'it_transf_count', 'md_k', 'ndmg', 'stats_random']
    .filter((key) => additional[key] !== undefined);
  if (bonusProperties > 0) keys.push(`bonus_properties:${bonusProperties}`);
  return keys.length > 0 ? keys.join('|') : 'no-additional-fields';
}

export function buildArtifactMarketDebugReport(input: { db: DatabaseSync; region: MarketRegion; item: string; days: number; now: Date }) {
  const cutoffMs = input.now.getTime() - input.days * 86_400_000;
  const cutoff = new Date(cutoffMs).toISOString();
  const rows = (input.db.prepare(`
    SELECT price, amount, observed_at, raw_json
    FROM auction_history_sample
    WHERE region = ? AND item_id = ?
    ORDER BY observed_at DESC
  `).all(input.region, input.item) as Row[])
    .map(parseRow)
    .filter((row) => row.saleTimeMs === undefined || row.saleTimeMs >= cutoffMs);

  const byQlt = new Map<string, ParsedRow[]>();
  const byGrouping = new Map<string, ParsedRow[]>();
  for (const row of rows) {
    const additional = row.additional;
    const qlt = typeof additional.qlt === 'number' ? additional.qlt : 'missing';
    const bracket = typeof qlt === 'number' ? artifactQualityCategoryBracketFromQlt(qlt) : undefined;
    const qltKey = bracket ? `${qlt}:${bracket.optimizerRarity}` : String(qlt);
    byQlt.set(qltKey, [...(byQlt.get(qltKey) ?? []), row]);
    const groupKey = groupingKey(additional);
    byGrouping.set(groupKey, [...(byGrouping.get(groupKey) ?? []), row]);
  }

  const latest = input.db.prepare(`
    SELECT variant_key, sample_count, average_price, median_price, source_fields_json
    FROM latest_artifact_price
    WHERE region = ? AND item_id = ? AND variant_key IN ('artifact', 'rarity.special', 'rarity.unordinary', 'rarity.rare')
    ORDER BY variant_key
  `).all(input.region, input.item);

  return {
    itemId: input.item,
    region: input.region,
    window: { days: input.days, now: input.now.toISOString(), cutoff },
    rawRows: summarize(rows.map((row) => row.price)),
    amounts: summarize(rows.map((row) => row.amount ?? 0).filter((amount) => amount > 0)),
    latestRows: latest,
    byQlt: Object.fromEntries([...byQlt].sort(([left], [right]) => left.localeCompare(right)).map(([key, group]) => [key, summarize(group.map((row) => row.price))])),
    topGroupings: [...byGrouping]
      .map(([key, group]) => ({ key, ...summarize(group.map((row) => row.price)) }))
      .sort((left, right) => right.count - left.count || (right.average ?? 0) - (left.average ?? 0))
      .slice(0, 12),
  };
}

if (process.argv[1]?.endsWith('debug-artifact-market.ts')) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.db) throw new Error('Missing required --db path');
  if (args.region !== 'NA') throw new Error('UltimateBuild market debugging is fixed to --region NA');
  const now = args.now ? new Date(args.now) : new Date();
  const store = createSQLiteMarketStore(args.db);
  const db: DatabaseSync = store.db;
  try {
    const report = buildArtifactMarketDebugReport({ db, region: args.region, item: args.item, days: args.days, now });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    store.close();
  }
}
