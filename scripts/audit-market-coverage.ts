import fs from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

type Args = {
  db: string;
  out?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { db: '.cache/market-full-2026-04-28.sqlite' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = argv[index + 1];
    if (arg === '--') continue;
    if (arg === '--db') { args.db = next!; index += 1; }
    else if (arg === '--out') { args.out = next!; index += 1; }
    else if (arg === '--help') { printHelp(); process.exit(0); }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printHelp(): void {
  console.log(`Usage:
  pnpm market:audit-coverage -- --db .cache/market-full.sqlite --out docs/research/market-coverage-audit.json`);
}

function parseJsonMaybe(text: unknown): unknown {
  if (typeof text !== 'string' || text.length === 0) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

function walkAdditional(raw: unknown, cb: (additional: Record<string, unknown>, itemId: string, price: number) => void, itemId = '', price = 0): void {
  if (Array.isArray(raw)) {
    for (const entry of raw) walkAdditional(entry, cb, itemId, price);
    return;
  }
  if (!raw || typeof raw !== 'object') return;
  const obj = raw as Record<string, unknown>;
  const nextItem = typeof obj.item_id === 'string' ? obj.item_id : itemId;
  const nextPrice = typeof obj.price === 'number' ? obj.price : price;
  if (obj.additional && typeof obj.additional === 'object' && !Array.isArray(obj.additional)) {
    cb(obj.additional as Record<string, unknown>, nextItem, nextPrice);
  }
  for (const value of Object.values(obj)) walkAdditional(value, cb, nextItem, nextPrice);
}

function inc(map: Record<string, number>, key: unknown): void {
  const normalized = String(key ?? '(missing)');
  map[normalized] = (map[normalized] ?? 0) + 1;
}

function fingerprint(additional: Record<string, unknown>): string {
  return Object.keys(additional).sort().join('|') || '(empty)';
}

const args = parseArgs(process.argv.slice(2));
const artifacts = JSON.parse(fs.readFileSync('data/normalized/artifacts.json', 'utf8')) as Array<{ id: string; name?: string }>;
const artifactIds = new Set(artifacts.map((artifact) => artifact.id));
const db = new DatabaseSync(args.db, { readOnly: true });
const pulls = db.prepare('select status, count(*) as count from market_pull group by status').all() as Array<{ status: string; count: number }>;
const sampleRows = db.prepare('select item_id as itemId, count(*) as count from auction_history_sample group by item_id').all() as Array<{ itemId: string; count: number }>;
const latestRows = db.prepare('select item_id as itemId, variant_key as variantKey, variant_scope as variantScope, sample_count as sampleCount, valid, median_price as medianPrice, average_price as averagePrice, source_type as sourceType, source_fields_json as sourceFieldsJson from latest_artifact_price').all() as Array<Record<string, unknown>>;

const sampleByItem = Object.fromEntries(sampleRows.map((row) => [row.itemId, row.count]));
const latestItems = new Set(latestRows.map((row) => String(row.itemId)));
const missingLatest = artifacts.map((artifact) => artifact.id).filter((id) => !latestItems.has(id));
const noSamples = artifacts.map((artifact) => artifact.id).filter((id) => !sampleByItem[id]);
const invalidItems = artifacts.map((artifact) => artifact.id).filter((id) => latestRows.filter((row) => row.itemId === id).every((row) => row.valid === 0));
const variantKeyCounts: Record<string, number> = {};
const sourceFieldCounts: Record<string, number> = {};
const sourceFieldFingerprints: Record<string, number> = {};
const upgradeBonusCounts: Record<string, number> = {};
const qltCounts: Record<string, number> = {};
const ptnCounts: Record<string, number> = {};
const sourceTypeCounts: Record<string, number> = {};

for (const row of latestRows) {
  inc(variantKeyCounts, row.variantKey);
  inc(sourceTypeCounts, row.sourceType ?? '(none)');
  const sourceFields = parseJsonMaybe(row.sourceFieldsJson) as Record<string, unknown> | undefined;
  if (sourceFields && typeof sourceFields === 'object') {
    inc(sourceFieldFingerprints, fingerprint(sourceFields));
    for (const key of Object.keys(sourceFields)) sourceFieldCounts[key] = (sourceFieldCounts[key] ?? 0) + 1;
    if ('upgrade_bonus' in sourceFields) inc(upgradeBonusCounts, sourceFields.upgrade_bonus);
    if ('qlt' in sourceFields) inc(qltCounts, sourceFields.qlt);
    if ('ptn' in sourceFields) inc(ptnCounts, sourceFields.ptn);
  }
}

const additionalKeyCounts: Record<string, number> = {};
const additionalFingerprints: Record<string, number> = {};
const rawUpgradeBonusCounts: Record<string, number> = {};
const rawQltCounts: Record<string, number> = {};
const rawPtnCounts: Record<string, number> = {};
let rawAdditionalCount = 0;
const rawRows = db.prepare('select item_id as itemId, price, raw_json as rawJson from auction_history_sample where raw_json is not null').all() as Array<{ itemId: string; price: number; rawJson: string }>;
for (const row of rawRows) {
  const raw = parseJsonMaybe(row.rawJson);
  walkAdditional(raw, (additional) => {
    rawAdditionalCount += 1;
    const fp = fingerprint(additional);
    additionalFingerprints[fp] = (additionalFingerprints[fp] ?? 0) + 1;
    for (const key of Object.keys(additional)) additionalKeyCounts[key] = (additionalKeyCounts[key] ?? 0) + 1;
    if ('upgrade_bonus' in additional) inc(rawUpgradeBonusCounts, additional.upgrade_bonus);
    if ('qlt' in additional) inc(rawQltCounts, additional.qlt);
    if ('ptn' in additional) inc(rawPtnCounts, additional.ptn);
  }, row.itemId, row.price);
}

function topEntries(map: Record<string, number>, limit = 50): Array<{ key: string; count: number }> {
  return Object.entries(map)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

const report = {
  generatedAt: new Date().toISOString(),
  db: args.db,
  artifactCount: artifacts.length,
  marketPullsByStatus: pulls,
  auctionHistory: {
    itemCountWithSamples: sampleRows.length,
    totalRows: sampleRows.reduce((sum, row) => sum + Number(row.count), 0),
    noSamples,
    sampleByItem,
  },
  latestPrices: {
    rowCount: latestRows.length,
    itemCount: latestItems.size,
    missingLatest,
    invalidItems,
    sourceTypeCounts,
    topVariantKeys: topEntries(variantKeyCounts, 25),
    sourceFieldCounts,
    sourceFieldFingerprints: topEntries(sourceFieldFingerprints, 50),
    upgradeBonusCounts: topEntries(upgradeBonusCounts, 200),
    qltCounts,
    ptnCounts: topEntries(ptnCounts, 50),
  },
  rawAdditional: {
    rawRowsInspected: rawRows.length,
    rawAdditionalCount,
    additionalKeyCounts,
    additionalFingerprints: topEntries(additionalFingerprints, 100),
    upgradeBonusCounts: topEntries(rawUpgradeBonusCounts, 200),
    qltCounts: rawQltCounts,
    ptnCounts: topEntries(rawPtnCounts, 50),
  },
  mappingAssessment: {
    optimizerExactCurrentlySafe: 'Rows with lossless optimizer key fields and upgrade_bonus=0 only.',
    unsafeUntilProven: ['nonzero upgrade_bonus', 'bonus_properties', 'md_k', 'ndmg', 'stats_random', 'event/compensation fields', 'other source-only fingerprints'],
    note: 'This report is descriptive. Promotion to optimizer-exact still requires code-level proof and tests.',
  },
};

const text = JSON.stringify(report, null, 2);
if (args.out) {
  fs.mkdirSync(dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${text}\n`);
}
console.log(text);
