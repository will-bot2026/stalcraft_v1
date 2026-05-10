import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  createSQLiteMarketStore,
  estimateBuildCostFromHistory,
  artifactQualityCategoryBracketFromQlt,
  optimizerQualityFromApiQltAndPtn,
  extractAuctionAdditionalSourceVariant,
  latestPriceMapForOptimizer,
  mapAuctionAdditionalToOptimizerVariant,
  priceForStrictBudget,
  pullMarketToSQLite,
  resolveVariantPrice,
  SQLITE_MARKET_SCHEMA,
  variantPriceKeyWithoutRarity,
} from '../packages/stalcraft-market/src/index.js';
import { buildArtifactMarketDebugReport } from '../scripts/debug-artifact-market.js';

const execFileAsync = promisify(execFile);

describe('market price estimator', () => {
  it('uses NA median recent sale history and prices duplicates as median times quantity', () => {
    const history = new Map([
      ['lj0j', [100, 300, 200]],
      ['kqgy', [1000, 800, 1200]],
    ]);

    const estimate = estimateBuildCostFromHistory(
      [
        { artifactId: 'lj0j', quantity: 3 },
        { artifactId: 'kqgy', quantity: 1 },
      ],
      history,
      { region: 'NA' },
    );

    expect(estimate.region).toBe('NA');
    expect(estimate.total).toBe(1600);
    expect(estimate.items).toEqual([
      { artifactId: 'lj0j', quantity: 3, medianUnitPrice: 200, subtotal: 600, sampleSize: 3 },
      { artifactId: 'kqgy', quantity: 1, medianUnitPrice: 1000, subtotal: 1000, sampleSize: 3 },
    ]);
  });

  it('uses Infinity for unknown strict-budget prices', () => {
    expect(priceForStrictBudget(undefined)).toBe(Number.POSITIVE_INFINITY);
    expect(priceForStrictBudget(0)).toBe(Number.POSITIVE_INFINITY);
    expect(priceForStrictBudget(123)).toBe(123);
  });

  it('exports SQLite market snapshot schema and latest optimizer price lookup metadata', () => {
    expect(SQLITE_MARKET_SCHEMA.join('\n')).toContain('CREATE TABLE IF NOT EXISTS latest_artifact_price');
    expect(SQLITE_MARKET_SCHEMA.join('\n')).toContain('average_price REAL');

    const { prices, freshness } = latestPriceMapForOptimizer([
      {
        itemId: 'known',
        region: 'NA',
        variantKey: 'artifact',
        medianPrice: 500,
        sampleCount: 4,
        snapshotAt: '2026-04-20T00:00:00.000Z',
        staleAfter: '2026-05-04T00:00:00.000Z',
        variantScope: 'artifact-id-only',
        valid: true,
      },
      {
        itemId: 'unknown',
        region: 'NA',
        variantKey: 'artifact',
        medianPrice: 0,
        sampleCount: 0,
        snapshotAt: '2026-04-20T00:00:00.000Z',
        staleAfter: '2026-04-21T00:00:00.000Z',
        variantScope: 'artifact-id-only',
        valid: false,
      },
    ], { now: new Date('2026-04-25T00:00:00.000Z') });

    expect(prices.get('known')).toBe(500);
    expect(prices.get('unknown')).toBe(Number.POSITIVE_INFINITY);
    expect(freshness.get('known')).toMatchObject({ region: 'NA', stale: false, variantScope: 'artifact-id-only' });
    expect(freshness.get('unknown')?.stale).toBe(true);
  });

  it('does not estimate upgraded variants from artifact-only snapshots', () => {
    const prices = new Map([['known', 1_000_000]]);
    const base = resolveVariantPrice({ artifactId: 'known', quality: 100, level: 0 }, prices);
    const upgraded = resolveVariantPrice({ artifactId: 'known', quality: 175, level: 15 }, prices);

    expect(base).toMatchObject({ price: 1_000_000, pricingPrecision: 'artifact_exact', priceKey: 'known' });
    expect(upgraded.price).toBe(Number.POSITIVE_INFINITY);
    expect(upgraded).toMatchObject({
      priceKey: 'known|qlt.5|level.15',
      pricingPrecision: 'unknown',
    });
  });

  it('prefers exact variant prices over artifact-level rows when present', () => {
    const exactKey = variantPriceKeyWithoutRarity({ artifactId: 'known', quality: 175, level: 15 });
    const resolved = resolveVariantPrice(
      { artifactId: 'known', quality: 175, level: 15 },
      new Map([
        ['known', 1_000_000],
        [exactKey, 9_000_000],
      ]),
    );

    expect(resolved).toMatchObject({ price: 9_000_000, priceKey: exactKey, pricingPrecision: 'variant_exact' });
  });

  it('prices upgraded variants from level-aware qlt buckets, not broad +0 rows', () => {
    const upgraded = resolveVariantPrice(
      { artifactId: 'known', quality: 160, level: 15, rarity: 'rarity.legendary' },
      new Map([
        ['known', 1_000_000],
        ['known|qlt.4', 22_000_000],
        ['known|rarity.legendary', 35_000_000],
        ['known|qlt.5|level.15', 51_000_000],
      ]),
    );
    const missingLevel = resolveVariantPrice(
      { artifactId: 'known', quality: 160, level: 15, rarity: 'rarity.legendary' },
      new Map([
        ['known', 1_000_000],
        ['known|qlt.5', 22_000_000],
        ['known|rarity.legendary', 35_000_000],
      ]),
    );
    const levelZero = resolveVariantPrice(
      { artifactId: 'known', quality: 160, level: 0, rarity: 'rarity.legendary' },
      new Map([['known|rarity.legendary', 35_000_000]]),
    );

    expect(upgraded).toMatchObject({ price: 51_000_000, priceKey: 'known|qlt.5|level.15', pricingPrecision: 'rarity_bracket' });
    expect(missingLevel).toMatchObject({ price: Number.POSITIVE_INFINITY, priceKey: 'known|qlt.5|level.15', pricingPrecision: 'unknown' });
    expect(levelZero).toMatchObject({ price: 35_000_000, priceKey: 'known|rarity.legendary', pricingPrecision: 'rarity_bracket' });
  });

  it('uses level-aware buckets instead of exact roll ptn buckets for purchasable upgraded variants', () => {
    const level15 = resolveVariantPrice(
      { artifactId: 'known', quality: 130, level: 15, rarity: 'rarity.special' },
      new Map([
        ['known|qlt.2', 400_000],
        ['known|qlt.2|ptn.10', 900_000],
        ['known|qlt.2|level.15', 1_750_000],
      ]),
    );
    const levelZero = resolveVariantPrice(
      { artifactId: 'known', quality: 129, level: 0, rarity: 'rarity.special' },
      new Map([
        ['known|qlt.2', 400_000],
        ['known|qlt.2|level.15', 1_750_000],
      ]),
    );

    expect(level15).toMatchObject({ price: 1_750_000, priceKey: 'known|qlt.2|level.15', pricingPrecision: 'rarity_bracket' });
    expect(levelZero).toMatchObject({ price: 400_000, priceKey: 'known|qlt.2', pricingPrecision: 'rarity_bracket' });
  });

  it('prefers item qlt buckets over broad fallback rows and ignores roll ptn buckets', () => {
    const qltOnly = resolveVariantPrice(
      { artifactId: 'known', quality: 130, level: 0, rarity: 'rarity.special' },
      new Map([
        ['known', 1_000_000],
        ['known|qlt.2', 400_000],
        ['known|qlt.2|ptn.15', 1_750_000],
      ]),
    );
    expect(qltOnly).toMatchObject({
      price: 400_000,
      priceKey: 'known|qlt.2',
      pricingPrecision: 'rarity_bracket',
    });
  });

  it('extracts API additional source variants without labeling them optimizer q/level exact', () => {
    const source = extractAuctionAdditionalSourceVariant({
      price: 123,
      additional: {
        qlt: 2,
        upgrade_bonus: 0.0045,
        ptn: 11,
        bonus_properties: ['STAMINA_BONUS', 'REGENERATION_BONUS'],
        spawn_time: 1772924797909,
      },
    });

    expect(source).toMatchObject({
      sourceType: 'history-additional',
      sourceFields: {
        qlt: 2,
        upgrade_bonus: 0.0045,
        ptn: 11,
        bonus_properties: ['REGENERATION_BONUS', 'STAMINA_BONUS'],
      },
    });
    expect(source?.variantKey).toContain('api:');
    expect(source?.variantKey).not.toContain('q130|l');
  });

  it('maps only lossless API additional variants to optimizer Q/level keys', () => {
    expect([
      artifactQualityCategoryBracketFromQlt(0),
      artifactQualityCategoryBracketFromQlt(1),
      artifactQualityCategoryBracketFromQlt(2),
      artifactQualityCategoryBracketFromQlt(3),
      artifactQualityCategoryBracketFromQlt(4),
      artifactQualityCategoryBracketFromQlt(5),
      artifactQualityCategoryBracketFromQlt(6),
    ].map((bracket) => [bracket?.qlt, bracket?.sourceCategory, bracket?.optimizerRarity, bracket?.minQuality, bracket?.maxQuality])).toEqual([
      [0, 'common', 'rarity.ordinary', 85, 100],
      [1, 'uncommon', 'rarity.unordinary', 100, 115],
      [2, 'special', 'rarity.special', 115, 130],
      [3, 'rare', 'rarity.rare', 130, 145],
      [4, 'exclusive', 'rarity.exclusive', 145, 160],
      [5, 'legendary', 'rarity.legendary', 160, 175],
      [6, 'unique', 'rarity.unique', 175, 190],
    ]);
    expect(optimizerQualityFromApiQltAndPtn(1, 4)).toBe(104);
    expect(optimizerQualityFromApiQltAndPtn(5, 15)).toBe(175);
    expect(optimizerQualityFromApiQltAndPtn(6, 15)).toBe(190);
    expect(optimizerQualityFromApiQltAndPtn(6, 16)).toBeUndefined();

    expect(mapAuctionAdditionalToOptimizerVariant('known', {
      qlt: 1,
      ptn: 4,
      upgrade_bonus: 0,
      it_transf_count: 3,
      spawn_time: 1773186991183,
    })).toMatchObject({
      variantKey: 'q104|l0|rarity.unordinary',
      quality: 104,
      level: 0,
      rarity: 'rarity.unordinary',
      sourceFields: { it_transf_count: 3, ptn: 4, qlt: 1, upgrade_bonus: 0 },
      mappingFields: {
        sourceQualityCategory: 'uncommon',
        qualityBracket: '100-115',
        levelProof: 'upgrade_bonus_zero',
        unsupportedNonzeroUpgradeBonus: expect.stringContaining('+15'),
      },
    });
    expect(mapAuctionAdditionalToOptimizerVariant('known', {
      qlt: 2,
      upgrade_bonus: 0,
    })).toMatchObject({
      variantKey: 'q115|l0|rarity.special',
      quality: 115,
      level: 0,
      rarity: 'rarity.special',
      sourceFields: { qlt: 2, upgrade_bonus: 0 },
    });
    expect(mapAuctionAdditionalToOptimizerVariant('known', {
      qlt: 2,
      ptn: 3,
      upgrade_bonus: 0.12240001,
      it_transf_count: 1,
    })).toBeNull();
    expect(mapAuctionAdditionalToOptimizerVariant('known', {
      qlt: 2,
      ptn: 15,
      upgrade_bonus: 0.5,
    })).toBeNull();
    for (const unsafeAdditional of [
      { qlt: 3, ptn: 15, upgrade_bonus: 0, bonus_properties: ['STAMINA_BONUS'] },
      { qlt: 3, ptn: 15, upgrade_bonus: 0, ndmg: 0.018572973422706238 },
      { qlt: 3, ptn: 15, upgrade_bonus: 0, md_k: 0.05000019 },
      { qlt: 3, ptn: 15, upgrade_bonus: 0, stats_random: -1.5729547 },
      { qlt: 3, ptn: 15, upgrade_bonus: 0, compens_2026_owner: 'SuperVac', compens_2026_ptn: 10 },
      { qlt: 3, ptn: 15, upgrade_bonus: 0, ls_rc_start: 1777324598265, ls_rc_duration: 11403 },
    ]) {
      expect(mapAuctionAdditionalToOptimizerVariant('known', unsafeAdditional)).toBeNull();
    }
    expect(mapAuctionAdditionalToOptimizerVariant('known', {
      qlt: 0,
      upgrade_bonus: 0,
    })).toBeNull();
  });

  it('persists fixture pulls, snapshots, latest prices, and stale unknown metadata in SQLite', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ultimatebuild-market-'));
    const dbPath = join(directory, 'market.sqlite');
    try {
      const result = await pullMarketToSQLite({
        dbPath,
        region: 'NA',
        now: new Date('2026-04-25T00:00:00.000Z'),
        staleHours: 24,
        fixture: {
          region: 'NA',
          items: [
            { itemId: 'known', history: { prices: [{ price: 100 }, { price: 300 }, { price: 200 }] } },
            { itemId: 'unknown', history: { prices: [] } },
          ],
        },
      });

      expect(result.itemCount).toBe(2);
      expect(result.sampleCount).toBe(3);
      expect(result.snapshots).toHaveLength(2);
      expect(result.snapshots.find((snapshot) => snapshot.itemId === 'known')?.medianPrice).toBe(200);
      expect(result.snapshots.find((snapshot) => snapshot.itemId === 'known')?.averagePrice).toBe(200);
      expect(result.snapshots.find((snapshot) => snapshot.itemId === 'unknown')?.unknownReason).toBe('no-history-samples');

      const store = createSQLiteMarketStore(dbPath);
      try {
        const latest = store.queryLatestArtifactPrices({
          region: 'NA',
          now: new Date('2026-04-27T00:00:00.000Z'),
          stalePolicy: 'mark-unknown',
        });
        const { prices, freshness } = latestPriceMapForOptimizer(latest, {
          now: new Date('2026-04-27T00:00:00.000Z'),
        });
        expect(prices.get('known')).toBe(Number.POSITIVE_INFINITY);
        expect(freshness.get('known')?.stale).toBe(true);
        expect(latest.find((price) => price.itemId === 'unknown')).toMatchObject({ valid: false, unknownReason: 'no-history-samples' });

        const pull = store.db.prepare('SELECT status, item_count FROM market_pull WHERE id = ?').get(result.pullId) as { status: string; item_count: number };
        expect(pull).toEqual({ status: 'success', item_count: 2 });
      } finally {
        store.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('persists additional source variant rows and emits safe optimizer Q/level rows separately', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ultimatebuild-market-variants-'));
    const dbPath = join(directory, 'market.sqlite');
    try {
      const result = await pullMarketToSQLite({
        dbPath,
        region: 'NA',
        now: new Date('2026-04-25T00:00:00.000Z'),
        fixture: {
          region: 'NA',
          items: [
            {
              itemId: 'known',
              history: {
                prices: [
                  { price: 100, additional: { qlt: 1, upgrade_bonus: 0 } },
                  { price: 300, additional: { qlt: 1, upgrade_bonus: 0 } },
                  { price: 900, additional: { qlt: 2, upgrade_bonus: 0, ptn: 4 } },
                  { price: 1200, additional: { qlt: 2, upgrade_bonus: 0.25, ptn: 4 } },
                  { price: 5000, additional: { qlt: 2, upgrade_bonus: 0.5, ptn: 15 } },
                  { price: 7000, additional: { qlt: 2, upgrade_bonus: 0.5, ptn: 15, md_k: 0.02 } },
                ],
              },
            },
          ],
        },
      });

      expect(result.snapshots).toHaveLength(14);
      const sourceSnapshots = result.snapshots.filter((snapshot) => snapshot.variantKey.startsWith('api:'));
      expect(sourceSnapshots.map((snapshot) => snapshot.medianPrice).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([200, 900, 1200, 5000, 7000]);
      expect(sourceSnapshots.every((snapshot) => snapshot.variantScope === 'quality-additional-aware')).toBe(true);
      const optimizerSnapshots = result.snapshots.filter((snapshot) => /^q\d/.test(snapshot.variantKey));
      expect(optimizerSnapshots.map((snapshot) => [snapshot.variantKey, snapshot.medianPrice]).sort()).toEqual([
        ['q100|l0|rarity.unordinary', 200],
        ['q119|l0|rarity.special', 900],
      ]);
      expect(optimizerSnapshots.every((snapshot) => snapshot.variantScope === 'quality-level-aware')).toBe(true);
      const raritySnapshots = result.snapshots.filter((snapshot) => snapshot.variantKey.startsWith('rarity.'));
      expect(raritySnapshots.map((snapshot) => [snapshot.variantKey, snapshot.medianPrice]).sort()).toEqual([
        ['rarity.special', 3100],
        ['rarity.unordinary', 200],
      ]);
      expect(raritySnapshots.find((snapshot) => snapshot.variantKey === 'rarity.special')?.averagePrice).toBe(3525);
      expect(raritySnapshots.every((snapshot) => snapshot.variantScope === 'rarity-aware')).toBe(true);
      const qltSnapshots = result.snapshots.filter((snapshot) => snapshot.variantKey.startsWith('qlt.'));
      expect(qltSnapshots.map((snapshot) => [snapshot.variantKey, snapshot.medianPrice]).sort()).toEqual([
        ['qlt.1', 200],
        ['qlt.2', 3100],
        ['qlt.2|level.15', 6000],
        ['qlt.2|level.4', 1050],
      ]);
      expect(qltSnapshots.find((snapshot) => snapshot.variantKey === 'qlt.2|level.15')?.sourceFields).toMatchObject({
        qlt: 2,
        level: 15,
        bucketPrecision: 'item_qlt_level_median',
      });

      const store = createSQLiteMarketStore(dbPath);
      try {
        const latest = store.queryLatestArtifactPrices({ region: 'NA' });
        const { prices, freshness } = latestPriceMapForOptimizer(latest);
        expect(prices.get('known')).toBe(1050);
        expect([...prices.keys()].filter((key) => key.includes('|api:'))).toEqual([]);
        expect(prices.get('known|q100|l0|rarity.unordinary')).toBeUndefined();
        expect(prices.get('known|q119|l0|rarity.special')).toBeUndefined();
        expect(prices.get('known|rarity.special')).toBe(3525);
        expect(prices.get('known|qlt.2')).toBe(3100);
        expect(prices.get('known|qlt.2|level.15')).toBe(6000);
        expect([...prices.keys()].filter((key) => /\|q\d+\|l\d+\|rarity\./.test(key))).toEqual([]);
        expect(resolveVariantPrice(
          { artifactId: 'known', quality: 130, level: 0, rarity: 'rarity.special' },
          prices,
        )).toMatchObject({ price: 3100, priceKey: 'known|qlt.2', pricingPrecision: 'rarity_bracket' });
        expect(freshness.get('known')?.pricingPrecision).toBe('artifact_exact');
        expect(freshness.get('known|q100|l0|rarity.unordinary')).toBeUndefined();
        expect(freshness.get('known|qlt.2')?.pricingPrecision).toBe('rarity_bracket');
        expect(latest.filter((price) => price.variantKey.startsWith('api:'))).toHaveLength(5);
      } finally {
        store.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('collects paged auction history until rows are older than the 30-day market window', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ultimatebuild-market-paged-'));
    const dbPath = join(directory, 'market.sqlite');
    const calls: Array<{ limit?: number; offset?: number; additional?: boolean }> = [];
    try {
      const result = await pullMarketToSQLite({
        dbPath,
        region: 'NA',
        itemIds: ['known'],
        now: new Date('2026-04-27T00:00:00.000Z'),
        historyLimit: 2,
        historyAdditional: true,
        client: {
          async getAuctionHistory(_region, _itemId, options) {
            calls.push(options ?? {});
            const pages = [
              [
                { price: 100, time: '2026-04-26T00:00:00.000Z' },
                { price: 300, time: '2026-04-20T00:00:00.000Z' },
              ],
              [
                { price: 500, time: '2026-03-29T00:00:00.000Z' },
                { price: 9_999, time: '2026-03-01T00:00:00.000Z' },
              ],
            ];
            const page = Math.floor((options?.offset ?? 0) / 2);
            return { total: 4, prices: pages[page] ?? [] };
          },
        },
      });

      expect(calls).toEqual([
        { limit: 2, offset: 0, additional: true },
        { limit: 2, offset: 2, additional: true },
      ]);
      expect(result.sampleCount).toBe(3);
      expect(result.snapshots.find((snapshot) => snapshot.variantKey === 'artifact')?.medianPrice).toBe(300);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('falls back to all available auction history when a 30-day window has no prices', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ultimatebuild-market-all-history-'));
    const dbPath = join(directory, 'market.sqlite');
    const calls: Array<{ limit?: number; offset?: number; additional?: boolean }> = [];
    try {
      const result = await pullMarketToSQLite({
        dbPath,
        region: 'NA',
        itemIds: ['stale-only'],
        now: new Date('2026-04-27T00:00:00.000Z'),
        historyLimit: 2,
        historyAdditional: true,
        client: {
          async getAuctionHistory(_region, _itemId, options) {
            calls.push(options ?? {});
            const pages = [
              [
                { price: 100, time: '2026-02-26T00:00:00.000Z' },
                { price: 500, time: '2026-02-20T00:00:00.000Z' },
              ],
              [
                { price: 900, time: '2026-01-29T00:00:00.000Z' },
              ],
            ];
            const page = Math.floor((options?.offset ?? 0) / 2);
            return { total: 3, prices: pages[page] ?? [] };
          },
        },
      });

      expect(calls).toEqual([
        { limit: 2, offset: 0, additional: true },
        { limit: 2, offset: 2, additional: true },
      ]);
      expect(result.sampleCount).toBe(3);
      expect(result.snapshots.find((snapshot) => snapshot.variantKey === 'artifact')).toMatchObject({
        medianPrice: 500,
        sampleCount: 3,
        valid: true,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('reports artifact market debug summaries from persisted raw history', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ultimatebuild-market-debug-'));
    const dbPath = join(directory, 'market.sqlite');
    try {
      await pullMarketToSQLite({
        dbPath,
        region: 'NA',
        now: new Date('2026-04-25T00:00:00.000Z'),
        fixture: {
          region: 'NA',
          items: [{
            itemId: 'gyq5',
            history: {
              prices: [
                { price: 500_000, time: '2026-04-24T00:00:00.000Z', additional: { qlt: 2, upgrade_bonus: 0 } },
                { price: 1_500_000, time: '2026-04-24T00:00:00.000Z', additional: { qlt: 2, ptn: 10, upgrade_bonus: 0, bonus_properties: ['SPEED_MOD', 'HEAL_EFFICIENCY'] } },
              ],
            },
          }],
        },
      });

      const store = createSQLiteMarketStore(dbPath);
      const report = buildArtifactMarketDebugReport({
        db: store.db,
        region: 'NA',
        item: 'gyq5',
        days: 30,
        now: new Date('2026-04-25T00:00:00.000Z'),
      }) as { itemId: string; rawRows: { count: number; average: number }; byQlt: Record<string, { count: number; average: number }> };
      store.close();

      expect(report.itemId).toBe('gyq5');
      expect(report.rawRows).toMatchObject({ count: 2, average: 1_000_000 });
      expect(report.byQlt['2:rarity.special']).toMatchObject({ count: 2, average: 1_000_000 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('exports artifacts with no API pricing rows as absent market data, not fallback-priced main-build candidates', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ultimatebuild-market-absent-data-'));
    const dbPath = join(directory, 'market.sqlite');
    const outPath = join(directory, 'snapshot.json');
    try {
      await pullMarketToSQLite({
        dbPath,
        region: 'NA',
        now: new Date('2026-04-25T00:00:00.000Z'),
        fixture: {
          region: 'NA',
          items: [
            { itemId: 'ljn2', history: { prices: [{ price: 100 }] } },
            { itemId: 'qokj', history: { prices: [{ price: 300 }] } },
            { itemId: 'x22sxr4', history: { prices: [] } },
          ],
        },
      });

      await execFileAsync('node', ['--import', 'tsx', 'scripts/export-market-snapshot.ts', '--', '--db', dbPath, '--region', 'NA', '--out', outPath], {
        cwd: process.cwd(),
      });
      const snapshot = JSON.parse(await readFile(outPath, 'utf8')) as {
        unknownCount: number;
        variantPricing: { noApiRowsFallback: string };
        items: Array<{ itemId: string; variantKey: string; medianPrice: number | null; optimizerPrice: number | null; valid: boolean; pricingPrecision: string; unknownReason?: string; sourceFields?: Record<string, unknown> }>;
      };
      const absent = snapshot.items.find((item) => item.itemId === 'x22sxr4' && item.variantKey === 'artifact');
      expect(absent).toMatchObject({
        valid: false,
        medianPrice: null,
        optimizerPrice: null,
        pricingPrecision: 'unknown',
        unknownReason: 'no-history-samples',
      });
      expect(snapshot.unknownCount).toBeGreaterThan(0);
      expect(snapshot.variantPricing.noApiRowsFallback).toContain('Infinity');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('keeps pull and export scripts fixed to NA region', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ultimatebuild-market-na-only-'));
    const dbPath = join(directory, 'market.sqlite');
    const fixturePath = join(directory, 'fixture.json');
    const outPath = join(directory, 'snapshot.json');
    await writeFile(fixturePath, JSON.stringify({ region: 'EU', items: [{ itemId: 'known', history: { prices: [{ price: 100 }] } }] }));

    try {
      await expect(execFileAsync('node', ['--import', 'tsx', 'scripts/pull-market.ts', '--', '--db', dbPath, '--region', 'EU', '--fixture', fixturePath], {
        cwd: process.cwd(),
      })).rejects.toMatchObject({ stderr: expect.stringContaining('fixed to --region NA') });
      await expect(execFileAsync('node', ['--import', 'tsx', 'scripts/export-market-snapshot.ts', '--', '--db', dbPath, '--region', 'EU', '--out', outPath], {
        cwd: process.cwd(),
      })).rejects.toMatchObject({ stderr: expect.stringContaining('fixed to --region NA') });
      await expect(execFileAsync('pnpm', ['market:debug-artifact', '--', '--db', dbPath, '--region', 'EU', '--item', 'known'], {
        cwd: process.cwd(),
      })).rejects.toMatchObject({ stderr: expect.stringContaining('fixed to --region NA') });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('records failed SQLite pull attempts without requiring live credentials', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ultimatebuild-market-fail-'));
    const dbPath = join(directory, 'market.sqlite');
    try {
      await expect(pullMarketToSQLite({
        dbPath,
        region: 'NA',
        itemIds: ['known'],
        client: {
          async getAuctionHistory() {
            throw new Error('fixture failure');
          },
        },
      })).rejects.toThrow('fixture failure');

      const store = createSQLiteMarketStore(dbPath);
      try {
        const pull = store.db.prepare('SELECT status, item_count, error FROM market_pull').get() as { status: string; item_count: number; error: string };
        expect(pull.status).toBe('failure');
        expect(pull.item_count).toBe(0);
        expect(pull.error).toContain('fixture failure');
      } finally {
        store.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
