import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { artifactQualityCategoryBracketFromQlt, artifactQualityCategoryBracketFromRarity, optimizerQualityFromApiQltAndPtn } from './pricing-helpers.js';
import { isQltBracketPriceKey, isRarityBracketPriceKey, priceForStrictBudget, qltLevelPriceKey, variantPriceKey } from './variant-pricing.js';
import type { PricePrecision, PriceVariantScope } from './variant-pricing.js';
export {
  artifactPriceKey,
  priceForStrictBudget,
  isOptimizerVariantPriceKey,
  isQltBracketPriceKey,
  isRarityBracketPriceKey,
  qltLevelPriceKey,
  rarityPriceKey,
  resolveVariantPrice,
  variantPriceKey,
  variantPriceKeyWithoutRarity,
} from './variant-pricing.js';
export type { ArtifactPriceVariant, PricePrecision, PriceVariantScope } from './variant-pricing.js';

export type MarketRegion = 'NA' | 'EU' | 'SEA' | 'RU';

export type PriceFreshness = {
  region: MarketRegion;
  snapshotAt: string;
  ageHours: number;
  stale: boolean;
  strictBudgetUnknownPolicy: 'Infinity';
  variantScope: PriceVariantScope;
  pricingPrecision: PricePrecision;
};

export type LatestArtifactPrice = {
  itemId: string;
  region: MarketRegion;
  variantKey: string;
  medianPrice: number;
  averagePrice?: number;
  sampleCount: number;
  snapshotAt: string;
  staleAfter: string;
  variantScope: PriceVariantScope;
  valid: boolean;
  unknownReason?: string;
  sourceType?: 'history' | 'history-additional';
  sourceFields?: Record<string, unknown>;
};

export type BuildCostLine = {
  artifactId: string;
  quantity: number;
  medianUnitPrice: number;
  subtotal: number;
  sampleSize: number;
};

export type BuildCostEstimate = {
  region: MarketRegion;
  priceMode: 'history_median';
  includeContainerCost: false;
  total: number;
  items: BuildCostLine[];
};

export const SQLITE_MARKET_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS market_pull (
    id TEXT PRIMARY KEY,
    region TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL,
    item_count INTEGER NOT NULL DEFAULT 0,
    error TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS auction_history_sample (
    id TEXT PRIMARY KEY,
    pull_id TEXT NOT NULL,
    region TEXT NOT NULL,
    item_id TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    price INTEGER NOT NULL,
    amount INTEGER,
    raw_json TEXT,
    FOREIGN KEY (pull_id) REFERENCES market_pull(id)
  );`,
  `CREATE TABLE IF NOT EXISTS artifact_price_snapshot (
    id TEXT PRIMARY KEY,
    pull_id TEXT NOT NULL,
    region TEXT NOT NULL,
    item_id TEXT NOT NULL,
    variant_key TEXT NOT NULL,
    variant_scope TEXT NOT NULL,
    sample_count INTEGER NOT NULL,
    min_price REAL,
    average_price REAL,
    median_price REAL,
    p75_price REAL,
    p90_price REAL,
    valid INTEGER NOT NULL,
    unknown_reason TEXT,
    snapshot_at TEXT NOT NULL,
    stale_after TEXT NOT NULL,
    source_type TEXT,
    source_fields_json TEXT,
    FOREIGN KEY (pull_id) REFERENCES market_pull(id)
  );`,
  `CREATE TABLE IF NOT EXISTS latest_artifact_price (
    region TEXT NOT NULL,
    item_id TEXT NOT NULL,
    variant_key TEXT NOT NULL,
    variant_scope TEXT NOT NULL,
    sample_count INTEGER NOT NULL,
    average_price REAL,
    median_price REAL,
    valid INTEGER NOT NULL,
    unknown_reason TEXT,
    snapshot_at TEXT NOT NULL,
    stale_after TEXT NOT NULL,
    source_run_id TEXT NOT NULL,
    source_type TEXT,
    source_fields_json TEXT,
    PRIMARY KEY (region, item_id, variant_key)
  );`,
  'CREATE INDEX IF NOT EXISTS idx_history_region_item_time ON auction_history_sample(region, item_id, observed_at DESC);',
  'CREATE INDEX IF NOT EXISTS idx_snapshot_region_item_time ON artifact_price_snapshot(region, item_id, snapshot_at DESC);',
  'CREATE INDEX IF NOT EXISTS idx_latest_valid_region_item ON latest_artifact_price(region, item_id, variant_key, median_price) WHERE valid = 1 AND median_price IS NOT NULL;',
];

export type StalcraftCredentials = {
  clientId: string;
  clientSecret: string;
};

export type AuctionHistoryEntry = {
  amount?: number;
  price: number;
  time?: string;
  additional?: unknown;
};

export type AuctionHistoryResponse = {
  total?: number;
  prices: AuctionHistoryEntry[];
};

export type MarketPullStatus = 'started' | 'success' | 'failure';

export type MarketPullRow = {
  id: string;
  region: MarketRegion;
  startedAt: string;
  completedAt?: string;
  status: MarketPullStatus;
  itemCount: number;
  error?: string;
};

export type ArtifactPriceSnapshot = {
  id: string;
  pullId: string;
  region: MarketRegion;
  itemId: string;
  variantKey: string;
  variantScope: PriceVariantScope;
  sampleCount: number;
  minPrice?: number;
  averagePrice?: number;
  medianPrice?: number;
  p75Price?: number;
  p90Price?: number;
  valid: boolean;
  unknownReason?: string;
  snapshotAt: string;
  staleAfter: string;
  sourceType?: 'history' | 'history-additional';
  sourceFields?: Record<string, unknown>;
};

export type MarketPullFixture = {
  region?: MarketRegion;
  items: {
    itemId: string;
    history: AuctionHistoryResponse;
  }[];
};

export type StalcraftMarketClient = {
  getAuctionHistory(region: MarketRegion, itemId: string, options?: { limit?: number; offset?: number; additional?: boolean }): Promise<AuctionHistoryResponse>;
};

function qltBucketKey(qlt: number): string {
  return `qlt.${qlt}`;
}

function qltLevelBucketKey(qlt: number, level: number): string {
  return `${qltBucketKey(qlt)}|level.${level}`;
}

function canonicalBonusProperties(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const bonuses = value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0).sort();
  return bonuses.length > 0 ? bonuses : undefined;
}

function qltLevelBonusBucketKey(qlt: number, level: number, bonuses: string[]): string {
  return `${qltLevelBucketKey(qlt, level)}|bonus.${bonuses.join('+')}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))] ?? 0;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function parseStalcraftCredentials(content: string): StalcraftCredentials {
  const entries = new Map<string, string>();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const [key, ...rest] = line.split('=');
    entries.set(key!, rest.join('=').trim());
  }
  const clientId = entries.get('STALCRAFT_CLIENT_ID');
  const clientSecret = entries.get('STALCRAFT_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Missing STALCRAFT_CLIENT_ID or STALCRAFT_CLIENT_SECRET');
  return { clientId, clientSecret };
}

export async function loadStalcraftCredentials(path = process.env.STALCRAFT_CREDENTIALS_PATH ?? './.env.local'): Promise<StalcraftCredentials> {
  return parseStalcraftCredentials(await readFile(path, 'utf8'));
}

export function extractHistoryPrices(history: AuctionHistoryResponse): number[] {
  return history.prices.map((entry) => entry.price).filter((price) => Number.isFinite(price) && price > 0);
}

export function latestPriceMapForOptimizer(
  prices: LatestArtifactPrice[],
  options: { strictBudget?: boolean; now?: Date } = {},
): { prices: Map<string, number>; freshness: Map<string, PriceFreshness> } {
  const strictBudget = options.strictBudget ?? true;
  const now = options.now ?? new Date();
  const priceMap = new Map<string, number>();
  const freshness = new Map<string, PriceFreshness>();
  for (const price of prices) {
    const pricingPrice = isRarityBracketPriceKey(price.variantKey) ? price.averagePrice ?? price.medianPrice : price.medianPrice;
    const optimizerPrice = price.valid ? priceForStrictBudget(pricingPrice) : Number.POSITIVE_INFINITY;
    if (price.variantKey === 'artifact') {
      priceMap.set(price.itemId, strictBudget ? optimizerPrice : (Number.isFinite(optimizerPrice) ? optimizerPrice : 0));
    } else if (isRarityBracketPriceKey(price.variantKey) || isQltBracketPriceKey(price.variantKey)) {
      priceMap.set(`${price.itemId}|${price.variantKey}`, strictBudget ? optimizerPrice : (Number.isFinite(optimizerPrice) ? optimizerPrice : 0));
    }
    const snapshotAt = new Date(price.snapshotAt);
    const staleAfter = new Date(price.staleAfter);
    const freshnessKey = price.variantKey !== 'artifact' && (isRarityBracketPriceKey(price.variantKey) || isQltBracketPriceKey(price.variantKey))
      ? `${price.itemId}|${price.variantKey}`
      : price.itemId;
    if (price.variantKey !== 'artifact' && !isRarityBracketPriceKey(price.variantKey) && !isQltBracketPriceKey(price.variantKey)) continue;
    freshness.set(freshnessKey, {
      region: price.region,
      snapshotAt: price.snapshotAt,
      ageHours: Math.max(0, (now.getTime() - snapshotAt.getTime()) / 3_600_000),
      stale: now.getTime() >= staleAfter.getTime(),
      strictBudgetUnknownPolicy: 'Infinity',
      variantScope: price.variantScope,
      pricingPrecision: price.variantKey === 'artifact' ? 'artifact_exact' : isRarityBracketPriceKey(price.variantKey) || isQltBracketPriceKey(price.variantKey) ? 'rarity_bracket' : 'variant_exact',
    });
  }
  return { prices: priceMap, freshness };
}

function isoNow(): string {
  return new Date().toISOString();
}

function addHours(date: Date, hours: number): string {
  return new Date(date.getTime() + hours * 3_600_000).toISOString();
}

function rowText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function rowNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function rowJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function normalizeSourceFields(value: Record<string, unknown>): Record<string, unknown> {
  const entries = Object.entries(value)
    .filter(([key]) => key !== 'spawn_time')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, field]) => [key, Array.isArray(field) ? [...field].sort() : field] as const);
  return Object.fromEntries(entries);
}

function encodeSourceVariantKey(fields: Record<string, unknown>): string {
  return `api:${JSON.stringify(fields)}`;
}

function decodeSourceVariantKey(variantKey: string): Record<string, unknown> | undefined {
  if (!variantKey.startsWith('api:')) return undefined;
  return rowJsonObject(variantKey.slice(4));
}

export function extractAuctionAdditionalSourceVariant(entry: AuctionHistoryEntry): {
  variantKey: string;
  sourceType: 'history-additional';
  sourceFields: Record<string, unknown>;
} | null {
  if (!entry.additional || typeof entry.additional !== 'object' || Array.isArray(entry.additional)) return null;
  const additional = entry.additional as Record<string, unknown>;
  const qlt = rowNumber(additional.qlt);
  const upgradeBonus = rowNumber(additional.upgrade_bonus);
  if (qlt === undefined || upgradeBonus === undefined) return null;
  const sourceFields = normalizeSourceFields(additional);
  if (Object.keys(sourceFields).length === 0) return null;
  return {
    variantKey: encodeSourceVariantKey(sourceFields),
    sourceType: 'history-additional',
    sourceFields,
  };
}

export {
  ARTIFACT_QUALITY_CATEGORY_BRACKETS,
  artifactQualityCategoryBracketFromQlt,
  artifactQualityCategoryBracketFromRarity,
  optimizerQualityFromApiQltAndPtn,
} from './pricing-helpers.js';
export type { ArtifactQualityCategoryBracket } from './pricing-helpers.js';

const API_ADDITIONAL_OPTIMIZER_FIELDS = ['it_transf_count', 'ptn', 'qlt', 'upgrade_bonus'];

function integerField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

function marketLevelFromAdditional(sourceFields: Record<string, unknown>): number | undefined {
  for (const key of ['level', 'upgrade_level', 'upgradeLevel', 'ptn']) {
    const level = integerField(sourceFields[key]);
    if (level !== undefined && level >= 0 && level <= 15) return level;
  }
  return undefined;
}

function optimizerLevelFromUpgradeBonus(value: unknown): 0 | undefined {
  // Local API evidence only proves that the default upgrade bonus maps to level 0.
  // Nonzero values are not a lossless optimizer level signal, including +15.
  return value === 0 ? 0 : undefined;
}

export function mapAuctionAdditionalToOptimizerVariant(
  itemId: string,
  additional: unknown,
): {
  variantKey: string;
  quality: number;
  level: 0;
  rarity: string;
  sourceFields: Record<string, unknown>;
  mappingFields: Record<string, unknown>;
} | null {
  if (!additional || typeof additional !== 'object' || Array.isArray(additional)) return null;
  const sourceFields = normalizeSourceFields(additional as Record<string, unknown>);
  const keys = Object.keys(sourceFields);
  if (keys.some((key) => !API_ADDITIONAL_OPTIMIZER_FIELDS.includes(key))) return null;
  const level = optimizerLevelFromUpgradeBonus(sourceFields.upgrade_bonus);
  if (level === undefined) return null;
  const qlt = integerField(sourceFields.qlt);
  if (qlt === undefined || qlt < 1 || qlt > 6) return null;
  const bracket = artifactQualityCategoryBracketFromQlt(qlt);
  if (!bracket || qlt === 0) return null;
  const rarity = bracket.optimizerRarity;
  const ptn = sourceFields.ptn === undefined ? 0 : integerField(sourceFields.ptn);
  if (ptn === undefined || ptn < 0 || ptn > 15) return null;
  if (sourceFields.it_transf_count !== undefined && integerField(sourceFields.it_transf_count) === undefined) return null;
  const quality = optimizerQualityFromApiQltAndPtn(qlt, ptn);
  if (quality === undefined || quality < 100 || quality > 190) return null;
  const variantKey = variantPriceKey({ artifactId: itemId, quality, level, rarity }).slice(`${itemId}|`.length);
  const mappingFields: Record<string, unknown> = {
    qlt,
    ptn,
    upgrade_bonus: 0,
    sourceQualityCategory: bracket.sourceCategory,
    qualityBracket: `${bracket.minQuality}-${bracket.maxQuality}`,
    optimizerQuality: quality,
    optimizerLevel: level,
    optimizerRarity: rarity,
    levelProof: 'upgrade_bonus_zero',
    unsupportedNonzeroUpgradeBonus: 'source-only: no lossless local proof from nonzero upgrade_bonus to optimizer level, including +15',
  };
  if (sourceFields.it_transf_count !== undefined) mappingFields.ignoredSourceFields = ['it_transf_count'];
  return { variantKey, quality, level, rarity, sourceFields, mappingFields };
}

function mapLatestRow(row: Record<string, unknown>, now: Date, stalePolicy: 'keep-valid' | 'mark-unknown'): LatestArtifactPrice {
  const staleAfter = rowText(row.stale_after) ?? new Date(0).toISOString();
  const stale = now.getTime() >= new Date(staleAfter).getTime();
  const valid = rowNumber(row.valid) === 1 && (!stale || stalePolicy === 'keep-valid');
  const unknownReason = rowText(row.unknown_reason) ?? (!valid && stale ? 'stale' : undefined);
  return {
    itemId: rowText(row.item_id) ?? '',
    region: (rowText(row.region) ?? 'NA') as MarketRegion,
    variantKey: rowText(row.variant_key) ?? 'artifact',
    medianPrice: rowNumber(row.median_price) ?? 0,
    averagePrice: rowNumber(row.average_price),
    sampleCount: rowNumber(row.sample_count) ?? 0,
    snapshotAt: rowText(row.snapshot_at) ?? new Date(0).toISOString(),
    staleAfter,
    variantScope: (rowText(row.variant_scope) ?? 'artifact-id-only') as PriceVariantScope,
    valid,
    unknownReason,
    sourceType: rowText(row.source_type) as LatestArtifactPrice['sourceType'],
    sourceFields: rowJsonObject(row.source_fields_json) ?? decodeSourceVariantKey(rowText(row.variant_key) ?? ''),
  };
}

export class SQLiteMarketStore {
  readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
  }

  migrate(): void {
    this.db.exec('PRAGMA foreign_keys = ON;');
    for (const statement of SQLITE_MARKET_SCHEMA) this.db.exec(statement);
    this.ensureColumn('artifact_price_snapshot', 'source_type', 'TEXT');
    this.ensureColumn('artifact_price_snapshot', 'source_fields_json', 'TEXT');
    this.ensureColumn('artifact_price_snapshot', 'average_price', 'REAL');
    this.ensureColumn('latest_artifact_price', 'average_price', 'REAL');
    this.ensureColumn('latest_artifact_price', 'source_type', 'TEXT');
    this.ensureColumn('latest_artifact_price', 'source_fields_json', 'TEXT');
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((entry) => entry.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
    }
  }

  close(): void {
    this.db.close();
  }

  startPull(input: { region: MarketRegion; id?: string; startedAt?: string }): MarketPullRow {
    const row: MarketPullRow = {
      id: input.id ?? randomUUID(),
      region: input.region,
      startedAt: input.startedAt ?? isoNow(),
      status: 'started',
      itemCount: 0,
    };
    this.db.prepare('INSERT INTO market_pull (id, region, started_at, status, item_count) VALUES (?, ?, ?, ?, ?)').run(
      row.id,
      row.region,
      row.startedAt,
      row.status,
      row.itemCount,
    );
    return row;
  }

  completePull(input: { id: string; status: Exclude<MarketPullStatus, 'started'>; itemCount: number; completedAt?: string; error?: string }): void {
    this.db.prepare('UPDATE market_pull SET completed_at = ?, status = ?, item_count = ?, error = ? WHERE id = ?').run(
      input.completedAt ?? isoNow(),
      input.status,
      input.itemCount,
      input.error ?? null,
      input.id,
    );
  }

  insertAuctionHistorySamples(input: {
    pullId: string;
    region: MarketRegion;
    itemId: string;
    history: AuctionHistoryResponse;
    observedAt?: string;
  }): number {
    const insert = this.db.prepare(`INSERT INTO auction_history_sample
      (id, pull_id, region, item_id, observed_at, price, amount, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    let inserted = 0;
    this.db.exec('BEGIN');
    try {
      for (const entry of input.history.prices) {
        if (!Number.isFinite(entry.price) || entry.price <= 0) continue;
        insert.run(
          randomUUID(),
          input.pullId,
          input.region,
          input.itemId,
          entry.time ?? input.observedAt ?? isoNow(),
          entry.price,
          entry.amount ?? null,
          JSON.stringify(entry),
        );
        inserted += 1;
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return inserted;
  }

  computeAndInsertArtifactPriceSnapshots(input: {
    pullId: string;
    region: MarketRegion;
    itemIds?: string[];
    snapshotAt?: string;
    staleHours?: number;
    variantScope?: PriceVariantScope;
  }): ArtifactPriceSnapshot[] {
    const snapshotAt = input.snapshotAt ?? isoNow();
    const staleAfter = addHours(new Date(snapshotAt), input.staleHours ?? 168);
    const variantScope = input.variantScope ?? 'artifact-id-only';
    const itemIds = input.itemIds ?? this.db
      .prepare('SELECT DISTINCT item_id FROM auction_history_sample WHERE pull_id = ? AND region = ? ORDER BY item_id')
      .all(input.pullId, input.region)
      .map((row) => rowText((row as Record<string, unknown>).item_id) ?? '')
      .filter(Boolean);

    const sampleQuery = this.db.prepare('SELECT price, raw_json FROM auction_history_sample WHERE pull_id = ? AND region = ? AND item_id = ? ORDER BY observed_at DESC');
    const snapshotInsert = this.db.prepare(`INSERT INTO artifact_price_snapshot
      (id, pull_id, region, item_id, variant_key, variant_scope, sample_count, min_price, average_price, median_price, p75_price, p90_price, valid, unknown_reason, snapshot_at, stale_after, source_type, source_fields_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const latestUpsert = this.db.prepare(`INSERT INTO latest_artifact_price
      (region, item_id, variant_key, variant_scope, sample_count, average_price, median_price, valid, unknown_reason, snapshot_at, stale_after, source_run_id, source_type, source_fields_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(region, item_id, variant_key) DO UPDATE SET
        variant_scope = excluded.variant_scope,
        sample_count = excluded.sample_count,
        average_price = excluded.average_price,
        median_price = excluded.median_price,
        valid = excluded.valid,
        unknown_reason = excluded.unknown_reason,
        snapshot_at = excluded.snapshot_at,
        stale_after = excluded.stale_after,
        source_run_id = excluded.source_run_id,
        source_type = excluded.source_type,
        source_fields_json = excluded.source_fields_json`);

    const snapshots: ArtifactPriceSnapshot[] = [];
    this.db.exec('BEGIN');
    try {
      for (const itemId of itemIds) {
        const rows = sampleQuery.all(input.pullId, input.region, itemId) as Array<Record<string, unknown>>;
        const prices = rows
          .map((row) => rowNumber(row.price))
          .filter((price): price is number => price !== undefined && price > 0);
        const valid = prices.length > 0;
        const snapshot: ArtifactPriceSnapshot = {
          id: randomUUID(),
          pullId: input.pullId,
          region: input.region,
          itemId,
          variantKey: 'artifact',
          variantScope,
          sampleCount: prices.length,
          minPrice: valid ? Math.min(...prices) : undefined,
          averagePrice: valid ? average(prices) : undefined,
          medianPrice: valid ? median(prices) : undefined,
          p75Price: valid ? percentile(prices, 75) : undefined,
          p90Price: valid ? percentile(prices, 90) : undefined,
          valid,
          unknownReason: valid ? undefined : 'no-history-samples',
          snapshotAt,
          staleAfter,
          sourceType: 'history',
        };
        const insertSnapshot = (entry: ArtifactPriceSnapshot): void => {
          const sourceFieldsJson = entry.sourceFields ? JSON.stringify(entry.sourceFields) : null;
          snapshotInsert.run(
            entry.id,
            entry.pullId,
            entry.region,
            entry.itemId,
            entry.variantKey,
            entry.variantScope,
            entry.sampleCount,
            entry.minPrice ?? null,
            entry.averagePrice ?? null,
            entry.medianPrice ?? null,
            entry.p75Price ?? null,
            entry.p90Price ?? null,
            entry.valid ? 1 : 0,
            entry.unknownReason ?? null,
            entry.snapshotAt,
            entry.staleAfter,
            entry.sourceType ?? null,
            sourceFieldsJson,
          );
          latestUpsert.run(
            entry.region,
            entry.itemId,
            entry.variantKey,
            entry.variantScope,
            entry.sampleCount,
            entry.averagePrice ?? null,
            entry.medianPrice ?? null,
            entry.valid ? 1 : 0,
            entry.unknownReason ?? null,
            entry.snapshotAt,
            entry.staleAfter,
            entry.pullId,
            entry.sourceType ?? null,
            sourceFieldsJson,
          );
          snapshots.push(entry);
        };
        insertSnapshot(snapshot);

        const variantGroups = new Map<string, { prices: number[]; sourceFields: Record<string, unknown> }>();
        const optimizerVariantGroups = new Map<string, { prices: number[]; sourceFields: Record<string, unknown> }>();
        const rarityGroups = new Map<string, { prices: number[]; sourceFields: Record<string, unknown> }>();
        const qltGroups = new Map<string, { prices: number[]; sourceFields: Record<string, unknown> }>();
        const qltLevelGroups = new Map<string, { prices: number[]; sourceFields: Record<string, unknown> }>();
        const qltLevelBonusGroups = new Map<string, { prices: number[]; sourceFields: Record<string, unknown> }>();
        for (const row of rows) {
          const price = rowNumber(row.price);
          if (price === undefined || price <= 0) continue;
          const raw = rowJsonObject(row.raw_json);
          const sourceVariant = raw ? extractAuctionAdditionalSourceVariant(raw as AuctionHistoryEntry) : null;
          if (sourceVariant) {
            const group = variantGroups.get(sourceVariant.variantKey) ?? { prices: [], sourceFields: sourceVariant.sourceFields };
            group.prices.push(price);
            variantGroups.set(sourceVariant.variantKey, group);
            const qlt = integerField(sourceVariant.sourceFields.qlt);
            const bracket = qlt === undefined ? undefined : artifactQualityCategoryBracketFromQlt(qlt);
            if (qlt !== undefined && bracket) {
              const rarity = bracket.optimizerRarity;
              const qltKey = qltBucketKey(qlt);
              const qltGroup = qltGroups.get(qltKey) ?? {
                prices: [],
                sourceFields: {
                  qlt,
                  sourceQualityCategory: bracket.sourceCategory,
                  qualityBracket: `${bracket.minQuality}-${bracket.maxQuality}`,
                  optimizerRarity: rarity,
                  bracketProof: 'api.additional.qlt',
                  bucketPrecision: 'item_qlt_median',
                },
              };
              qltGroup.prices.push(price);
              qltGroups.set(qltKey, qltGroup);

              const level = marketLevelFromAdditional(sourceVariant.sourceFields);
              if (level !== undefined) {
                const qltLevelKey = qltLevelBucketKey(qlt, level);
                const qltLevelGroup = qltLevelGroups.get(qltLevelKey) ?? {
                  prices: [],
                  sourceFields: {
                    qlt,
                    level,
                    sourceQualityCategory: bracket.sourceCategory,
                    qualityBracket: `${bracket.minQuality}-${bracket.maxQuality}`,
                    optimizerRarity: rarity,
                    bracketProof: 'api.additional.qlt+level',
                    bucketPrecision: 'item_qlt_level_median',
                    levelSemantics: 'Market/budget upgrade level; rolls and studied stat values are excluded from optimizer-visible pricing.',
                  },
                };
                qltLevelGroup.prices.push(price);
                qltLevelGroups.set(qltLevelKey, qltLevelGroup);

                const bonuses = canonicalBonusProperties(sourceVariant.sourceFields.bonus_properties);
                if (bonuses) {
                  const bonusKey = qltLevelBonusBucketKey(qlt, level, bonuses);
                  const bonusGroup = qltLevelBonusGroups.get(bonusKey) ?? {
                    prices: [],
                    sourceFields: {
                      qlt,
                      level,
                      bonus_properties: bonuses,
                      sourceQualityCategory: bracket.sourceCategory,
                      qualityBracket: `${bracket.minQuality}-${bracket.maxQuality}`,
                      optimizerRarity: rarity,
                      bracketProof: 'api.additional.qlt+level+bonus_properties',
                      bucketPrecision: 'source_only_qlt_level_bonus_property_median',
                      bonusPropertyModelStatus: 'source-only audit; rolls/additional properties excluded from optimizer-visible market pricing',
                    },
                  };
                  bonusGroup.prices.push(price);
                  qltLevelBonusGroups.set(bonusKey, bonusGroup);
                }
              }

              const rarityGroup = rarityGroups.get(rarity) ?? {
                prices: [],
                sourceFields: {
                  qlt,
                  sourceQualityCategory: bracket.sourceCategory,
                  qualityBracket: `${bracket.minQuality}-${bracket.maxQuality}`,
                  optimizerRarity: rarity,
                  bracketProof: 'api.additional.qlt',
                },
              };
              rarityGroup.prices.push(price);
              rarityGroups.set(rarity, rarityGroup);
            }
          }
          const optimizerVariant = raw ? mapAuctionAdditionalToOptimizerVariant(itemId, (raw as AuctionHistoryEntry).additional) : null;
          if (optimizerVariant) {
            const group = optimizerVariantGroups.get(optimizerVariant.variantKey) ?? { prices: [], sourceFields: optimizerVariant.mappingFields };
            group.prices.push(price);
            optimizerVariantGroups.set(optimizerVariant.variantKey, group);
          }
        }
        for (const [variantKey, group] of [...optimizerVariantGroups].sort(([left], [right]) => left.localeCompare(right))) {
          const variantPrices = group.prices;
          const variantValid = variantPrices.length > 0;
          insertSnapshot({
            id: randomUUID(),
            pullId: input.pullId,
            region: input.region,
            itemId,
            variantKey,
            variantScope: 'quality-level-aware',
            sampleCount: variantPrices.length,
            minPrice: variantValid ? Math.min(...variantPrices) : undefined,
            averagePrice: variantValid ? average(variantPrices) : undefined,
            medianPrice: variantValid ? median(variantPrices) : undefined,
            p75Price: variantValid ? percentile(variantPrices, 75) : undefined,
            p90Price: variantValid ? percentile(variantPrices, 90) : undefined,
            valid: variantValid,
            unknownReason: variantValid ? undefined : 'no-history-samples',
            snapshotAt,
            staleAfter,
            sourceType: 'history-additional',
            sourceFields: group.sourceFields,
          });
        }
        for (const [variantKey, group] of [...rarityGroups].sort(([left], [right]) => left.localeCompare(right))) {
          const variantPrices = group.prices;
          const variantValid = variantPrices.length > 0;
          insertSnapshot({
            id: randomUUID(),
            pullId: input.pullId,
            region: input.region,
            itemId,
            variantKey,
            variantScope: 'rarity-aware',
            sampleCount: variantPrices.length,
            minPrice: variantValid ? Math.min(...variantPrices) : undefined,
            averagePrice: variantValid ? average(variantPrices) : undefined,
            medianPrice: variantValid ? median(variantPrices) : undefined,
            p75Price: variantValid ? percentile(variantPrices, 75) : undefined,
            p90Price: variantValid ? percentile(variantPrices, 90) : undefined,
            valid: variantValid,
            unknownReason: variantValid ? undefined : 'no-history-samples',
            snapshotAt,
            staleAfter,
            sourceType: 'history-additional',
            sourceFields: group.sourceFields,
          });
        }

        for (const [variantKey, group] of [...qltGroups].sort(([left], [right]) => left.localeCompare(right))) {
          const variantPrices = group.prices;
          const variantValid = variantPrices.length > 0;
          insertSnapshot({
            id: randomUUID(),
            pullId: input.pullId,
            region: input.region,
            itemId,
            variantKey,
            variantScope: 'rarity-aware',
            sampleCount: variantPrices.length,
            minPrice: variantValid ? Math.min(...variantPrices) : undefined,
            averagePrice: variantValid ? average(variantPrices) : undefined,
            medianPrice: variantValid ? median(variantPrices) : undefined,
            p75Price: variantValid ? percentile(variantPrices, 75) : undefined,
            p90Price: variantValid ? percentile(variantPrices, 90) : undefined,
            valid: variantValid,
            unknownReason: variantValid ? undefined : 'no-history-samples',
            snapshotAt,
            staleAfter,
            sourceType: 'history-additional',
            sourceFields: group.sourceFields,
          });
        }
        for (const [variantKey, group] of [...qltLevelGroups].sort(([left], [right]) => left.localeCompare(right))) {
          const variantPrices = group.prices;
          const variantValid = variantPrices.length > 0;
          insertSnapshot({
            id: randomUUID(),
            pullId: input.pullId,
            region: input.region,
            itemId,
            variantKey,
            variantScope: 'rarity-level-aware',
            sampleCount: variantPrices.length,
            minPrice: variantValid ? Math.min(...variantPrices) : undefined,
            averagePrice: variantValid ? average(variantPrices) : undefined,
            medianPrice: variantValid ? median(variantPrices) : undefined,
            p75Price: variantValid ? percentile(variantPrices, 75) : undefined,
            p90Price: variantValid ? percentile(variantPrices, 90) : undefined,
            valid: variantValid,
            unknownReason: variantValid ? undefined : 'no-history-samples',
            snapshotAt,
            staleAfter,
            sourceType: 'history-additional',
            sourceFields: group.sourceFields,
          });
        }
        for (const [variantKey, group] of [...qltLevelBonusGroups].sort(([left], [right]) => left.localeCompare(right))) {
          const variantPrices = group.prices;
          const variantValid = variantPrices.length > 0;
          insertSnapshot({
            id: randomUUID(),
            pullId: input.pullId,
            region: input.region,
            itemId,
            variantKey,
            variantScope: 'quality-additional-aware',
            sampleCount: variantPrices.length,
            minPrice: variantValid ? Math.min(...variantPrices) : undefined,
            averagePrice: variantValid ? average(variantPrices) : undefined,
            medianPrice: variantValid ? median(variantPrices) : undefined,
            p75Price: variantValid ? percentile(variantPrices, 75) : undefined,
            p90Price: variantValid ? percentile(variantPrices, 90) : undefined,
            valid: variantValid,
            unknownReason: variantValid ? undefined : 'no-history-samples',
            snapshotAt,
            staleAfter,
            sourceType: 'history-additional',
            sourceFields: group.sourceFields,
          });
        }
        for (const [variantKey, group] of [...variantGroups].sort(([left], [right]) => left.localeCompare(right))) {
          const variantPrices = group.prices;
          const variantValid = variantPrices.length > 0;
          insertSnapshot({
            id: randomUUID(),
            pullId: input.pullId,
            region: input.region,
            itemId,
            variantKey,
            variantScope: 'quality-additional-aware',
            sampleCount: variantPrices.length,
            minPrice: variantValid ? Math.min(...variantPrices) : undefined,
            averagePrice: variantValid ? average(variantPrices) : undefined,
            medianPrice: variantValid ? median(variantPrices) : undefined,
            p75Price: variantValid ? percentile(variantPrices, 75) : undefined,
            p90Price: variantValid ? percentile(variantPrices, 90) : undefined,
            valid: variantValid,
            unknownReason: variantValid ? undefined : 'no-history-samples',
            snapshotAt,
            staleAfter,
            sourceType: 'history-additional',
            sourceFields: group.sourceFields,
          });
        }
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return snapshots;
  }

  queryLatestArtifactPrices(input: {
    region: MarketRegion;
    itemIds?: string[];
    now?: Date;
    stalePolicy?: 'keep-valid' | 'mark-unknown';
  }): LatestArtifactPrice[] {
    const now = input.now ?? new Date();
    const stalePolicy = input.stalePolicy ?? 'keep-valid';
    const rows = input.itemIds && input.itemIds.length > 0
      ? input.itemIds.flatMap((itemId) => this.db.prepare('SELECT * FROM latest_artifact_price WHERE region = ? AND item_id = ? ORDER BY item_id').all(input.region, itemId))
      : this.db.prepare('SELECT * FROM latest_artifact_price WHERE region = ? ORDER BY item_id').all(input.region);
    return rows.map((row) => mapLatestRow(row as Record<string, unknown>, now, stalePolicy));
  }
}

export function createSQLiteMarketStore(path: string): SQLiteMarketStore {
  const store = new SQLiteMarketStore(path);
  store.migrate();
  return store;
}

export async function readMarketPullFixture(path: string): Promise<MarketPullFixture> {
  return JSON.parse(await readFile(path, 'utf8')) as MarketPullFixture;
}

export async function pullMarketToSQLite(input: {
  dbPath: string;
  region: MarketRegion;
  itemIds?: string[];
  client?: StalcraftMarketClient;
  fixture?: MarketPullFixture;
  historyLimit?: number;
  historyAdditional?: boolean;
  historyDays?: number | 'all';
  maxHistoryPages?: number;
  staleHours?: number;
  now?: Date;
}): Promise<{ pullId: string; itemCount: number; sampleCount: number; snapshots: ArtifactPriceSnapshot[] }> {
  const store = createSQLiteMarketStore(input.dbPath);
  const startedAt = input.now?.toISOString() ?? isoNow();
  const pull = store.startPull({ region: input.region, startedAt });
  let itemCount = 0;
  let sampleCount = 0;
  try {
    const fixtureItems = input.fixture?.items;
    const itemIds = fixtureItems?.map((item) => item.itemId) ?? input.itemIds ?? [];
    if (!fixtureItems && !input.client) throw new Error('pullMarketToSQLite requires either a fixture or a market client');
    for (const itemId of itemIds) {
      const history = fixtureItems?.find((item) => item.itemId === itemId)?.history
        ?? await collectRecentAuctionHistory(input.client!, input.region, itemId, {
          limit: input.historyLimit ?? 200,
          additional: input.historyAdditional ?? false,
          historyDays: input.historyDays ?? 30,
          maxPages: input.maxHistoryPages ?? (input.historyDays === 'all' ? 1000 : 25),
          now: input.now,
        });
      sampleCount += store.insertAuctionHistorySamples({ pullId: pull.id, region: input.region, itemId, history, observedAt: startedAt });
      itemCount += 1;
    }
    const snapshots = store.computeAndInsertArtifactPriceSnapshots({
      pullId: pull.id,
      region: input.region,
      itemIds,
      snapshotAt: startedAt,
      staleHours: input.staleHours,
    });
    store.completePull({ id: pull.id, status: 'success', itemCount, completedAt: startedAt });
    return { pullId: pull.id, itemCount, sampleCount, snapshots };
  } catch (error) {
    store.completePull({
      id: pull.id,
      status: 'failure',
      itemCount,
      completedAt: startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    store.close();
  }
}

function historyEntryTime(entry: AuctionHistoryEntry): number | undefined {
  if (!entry.time) return undefined;
  const value = new Date(entry.time).getTime();
  return Number.isFinite(value) ? value : undefined;
}

function filterRecentHistory(history: AuctionHistoryResponse, cutoffMs: number): AuctionHistoryResponse {
  return {
    ...history,
    prices: history.prices.filter((entry) => {
      const time = historyEntryTime(entry);
      return time === undefined || time >= cutoffMs;
    }),
  };
}

async function collectRecentAuctionHistory(
  client: StalcraftMarketClient,
  region: MarketRegion,
  itemId: string,
  options: { limit: number; additional: boolean; historyDays: number | 'all'; maxPages: number; now?: Date },
): Promise<AuctionHistoryResponse> {
  const cutoffMs = options.historyDays === 'all'
    ? Number.NEGATIVE_INFINITY
    : (options.now ?? new Date()).getTime() - options.historyDays * 86_400_000;
  const prices: AuctionHistoryEntry[] = [];
  const allFetchedPrices: AuctionHistoryEntry[] = [];
  let total: number | undefined;
  for (let page = 0; page < options.maxPages; page += 1) {
    const offset = page * options.limit;
    const history = await client.getAuctionHistory(region, itemId, { limit: options.limit, offset, additional: options.additional });
    total = history.total ?? total;
    allFetchedPrices.push(...history.prices);
    prices.push(...filterRecentHistory(history, cutoffMs).prices);
    const times = history.prices.map(historyEntryTime).filter((time): time is number => time !== undefined);
    if (history.prices.length < options.limit) break;
    if (times.length > 0 && Math.min(...times) < cutoffMs && prices.length > 0) break;
    if (total !== undefined && offset + history.prices.length >= total) break;
  }
  return { ...(total === undefined ? {} : { total }), prices: prices.length > 0 ? prices : allFetchedPrices };
}

type ClientOptions = {
  credentials: StalcraftCredentials;
  fetchImpl?: typeof fetch;
  apiBaseUrl?: string;
  tokenUrl?: string;
  cacheDir?: string;
};

type TokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

function cachePath(cacheDir: string, region: MarketRegion, itemId: string, limit: number, offset: number, additional: boolean): string {
  return resolve(cacheDir, `${region}-${itemId}-history-${limit}-offset-${offset}-${additional ? 'additional' : 'basic'}.json`);
}

async function readCachedHistory(path: string): Promise<AuctionHistoryResponse | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as AuctionHistoryResponse;
  } catch {
    return null;
  }
}

async function writeCachedHistory(path: string, history: AuctionHistoryResponse): Promise<void> {
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(history, null, 2)}\n`);
}

export function createStalcraftMarketClient(options: ClientOptions): StalcraftMarketClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBaseUrl = options.apiBaseUrl ?? 'https://eapi.stalcraft.net';
  const tokenUrl = options.tokenUrl ?? 'https://exbo.net/oauth/token';
  let token: { value: string; expiresAt: number } | null = null;

  async function getToken(): Promise<string> {
    const now = Date.now();
    if (token && token.expiresAt > now + 60_000) return token.value;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: options.credentials.clientId,
      client_secret: options.credentials.clientSecret,
      scope: '',
    });
    const response = await fetchImpl(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) throw new Error(`STALCRAFT auth failed with HTTP ${response.status}`);
    const data = (await response.json()) as TokenResponse;
    if (!data.access_token) throw new Error('STALCRAFT auth response did not include access_token');
    token = { value: data.access_token, expiresAt: now + (data.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  return {
    async getAuctionHistory(region, itemId, historyOptions = {}) {
      const limit = historyOptions.limit ?? 200;
      const offset = historyOptions.offset ?? 0;
      const additional = historyOptions.additional ?? false;
      const cachedPath = options.cacheDir ? cachePath(options.cacheDir, region, itemId, limit, offset, additional) : undefined;
      if (cachedPath) {
        const cached = await readCachedHistory(cachedPath);
        if (cached) return cached;
      }

      const bearer = await getToken();
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset), additional: String(additional) });
      const url = `${apiBaseUrl}/${region}/auction/${encodeURIComponent(itemId)}/history?${params.toString()}`;
      const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${bearer}` } });
      if (!response.ok) throw new Error(`STALCRAFT history request failed for ${itemId} with HTTP ${response.status}`);
      const history = (await response.json()) as AuctionHistoryResponse;
      if (cachedPath) await writeCachedHistory(cachedPath, history);
      return history;
    },
  };
}

export async function buildHistoryMedianPriceMap(
  client: StalcraftMarketClient,
  artifactIds: string[],
  options: { region?: MarketRegion; limit?: number } = {},
): Promise<Map<string, number>> {
  const region = options.region ?? 'NA';
  const uniqueIds = [...new Set(artifactIds)];
  const entries: (readonly [string, number])[] = [];
  const concurrency = 5;
  for (let offset = 0; offset < uniqueIds.length; offset += concurrency) {
    const batch = uniqueIds.slice(offset, offset + concurrency);
    entries.push(...await Promise.all(batch.map(async (artifactId) => {
      try {
        const history = await client.getAuctionHistory(region, artifactId, { limit: options.limit ?? 200, additional: false });
        const price = median(extractHistoryPrices(history));
        return [artifactId, price > 0 ? price : Number.POSITIVE_INFINITY] as const;
      } catch {
        return [artifactId, Number.POSITIVE_INFINITY] as const;
      }
    })));
  }
  return new Map(entries);
}

export async function createDefaultMarketClient(options: { cacheDir?: string; credentialsPath?: string } = {}): Promise<StalcraftMarketClient> {
  const credentials = await loadStalcraftCredentials(options.credentialsPath);
  return createStalcraftMarketClient({
    credentials,
    cacheDir: options.cacheDir ?? resolve(process.cwd(), '.cache/stalcraft-market'),
  });
}

export function estimateBuildCostFromHistory(
  quantities: { artifactId: string; quantity: number }[],
  historyByArtifact: Map<string, number[]>,
  options: { region?: MarketRegion } = {},
): BuildCostEstimate {
  const items = quantities.map((entry) => {
    const samples = historyByArtifact.get(entry.artifactId) ?? [];
    const medianUnitPrice = median(samples);
    return {
      artifactId: entry.artifactId,
      quantity: entry.quantity,
      medianUnitPrice,
      subtotal: medianUnitPrice * entry.quantity,
      sampleSize: samples.length,
    };
  });

  return {
    region: options.region ?? 'NA',
    priceMode: 'history_median',
    includeContainerCost: false,
    total: items.reduce((sum, item) => sum + item.subtotal, 0),
    items,
  };
}
