import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import artifactsData from '../data/normalized/artifacts.json' with { type: 'json' };
import { createSQLiteMarketStore, isOptimizerVariantPriceKey, isQltBracketPriceKey, isRarityBracketPriceKey, type LatestArtifactPrice, type MarketRegion } from '../packages/stalcraft-market/src/index.js';

type Args = { db?: string; region: MarketRegion; out?: string; stalePolicy: 'keep-valid' | 'mark-unknown' };

function parseArgs(argv: string[]): Args {
  const args: Args = { region: 'NA', stalePolicy: 'keep-valid' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = argv[index + 1];
    if (arg === '--') continue;
    if (arg === '--db') { args.db = next; index += 1; }
    else if (arg === '--region') { args.region = next as MarketRegion; index += 1; }
    else if (arg === '--out') { args.out = next; index += 1; }
    else if (arg === '--stale-policy') { args.stalePolicy = next as Args['stalePolicy']; index += 1; }
    else if (arg === '--help') { printHelp(); process.exit(0); }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printHelp(): void {
  console.log(`Usage:
  pnpm market:export-snapshot -- --db .cache/market.sqlite --region NA --out apps/web/static/market/latest-NA.json

Options:
  --stale-policy keep-valid|mark-unknown   Default: keep-valid`);
}

const args = parseArgs(process.argv.slice(2));
if (!args.db) throw new Error('Missing required --db path');
if (!args.out) throw new Error('Missing required --out path');
if (args.region !== 'NA') throw new Error('UltimateBuild market snapshots are fixed to --region NA');

const store = createSQLiteMarketStore(args.db);
try {
  const latest = store.queryLatestArtifactPrices({ region: args.region, stalePolicy: args.stalePolicy });
  const artifactIds = [...new Set((artifactsData as Array<{ id: string }>).map((artifact) => artifact.id))].sort();
  const latestArtifactByItemId = new Map(latest.filter((price) => price.variantKey === 'artifact').map((price) => [price.itemId, price]));
  const missingArtifactPrices: LatestArtifactPrice[] = artifactIds.filter((itemId) => !latestArtifactByItemId.has(itemId)).map((itemId) => ({
    itemId,
    region: args.region,
    variantKey: 'artifact',
    variantScope: 'artifact-id-only' as const,
    sampleCount: 0,
    averagePrice: undefined,
    medianPrice: 0,
    valid: false,
    unknownReason: 'not-present-in-api-snapshot',
    snapshotAt: new Date().toISOString(),
    staleAfter: new Date().toISOString(),
    sourceFields: {
      marketDataStatus: 'absent-market-data',
      absentMarketPolicy: 'excluded-from-main-builds-and-strict-budget-prices-as-infinity',
    },
  }));
  const prices = [...latest, ...missingArtifactPrices]
    .sort((left, right) => left.itemId.localeCompare(right.itemId) || left.variantKey.localeCompare(right.variantKey));
  const validPrices = prices.filter((price) => price.valid && Number.isFinite(price.medianPrice));
  const hasVariantPrices = prices.some((price) => price.variantKey !== 'artifact');
  const sourceVariantCount = prices.filter((price) => price.variantKey !== 'artifact' && price.valid && !isOptimizerVariantPriceKey(price.variantKey) && !isRarityBracketPriceKey(price.variantKey) && !isQltBracketPriceKey(price.variantKey)).length;
  const rarityBracketCount = prices.filter((price) => price.variantKey !== 'artifact' && price.valid && (isRarityBracketPriceKey(price.variantKey) || isQltBracketPriceKey(price.variantKey))).length;
  const optimizerVariantCount = prices.filter((price) => price.variantKey !== 'artifact' && price.valid && isOptimizerVariantPriceKey(price.variantKey)).length;
  const snapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    region: args.region,
    priceMode: 'history_median',
    marketWindow: { region: 'NA', days: 30, statistic: 'median_with_all_history_and_rarity_category_fallbacks', source: 'auction-history' },
    includeContainerCost: false,
    stalePolicy: args.stalePolicy,
    variantScope: hasVariantPrices ? (optimizerVariantCount > 0 ? 'quality-level-aware' : 'quality-additional-aware') : 'artifact-id-only',
    variantPricing: {
      exactVariantEntries: sourceVariantCount + optimizerVariantCount,
      optimizerExactVariantEntries: optimizerVariantCount,
      sourceExactVariantEntries: sourceVariantCount,
      rarityBracketEntries: rarityBracketCount,
      estimateModel: 'artifact_median_quality_squared_level_8pct_per_level',
      fallbackPrecision: 'variant_estimate',
      rarityBracketPrecision: 'rarity_or_qlt_level_bucket_from_api_additional_for_optimizer_with_median_retained',
      noRecentSalesFallback: 'if an artifact has no sales inside the 30-day window, the pull keeps all available auction-history rows and uses their median',
      noApiRowsFallback: 'if an artifact has no usable API rows, export keeps it invalid/unknown so strict-budget optimizer logic prices it as Infinity and excludes it from main builds',
      sourceVariantPrecision: 'api_additional_exact_not_optimizer_q_level',
      optimizerExactUpgradeBonusValues: [0],
      unsupportedUpgradeBonusCaveat: 'Nonzero API additional.upgrade_bonus rows remain source-only until a lossless optimizer-level mapping is proven; budget-visible qlt|level buckets exclude rolls and studied stat values.',
    },
    source: 'local-sqlite-weekly-pull',
    count: prices.length,
    validCount: validPrices.length,
    unknownCount: prices.length - validPrices.length,
    items: prices.map((price) => ({
      itemId: price.itemId,
      variantKey: price.variantKey,
      variantScope: price.variantScope,
      pricingPrecision: !price.valid
        ? 'unknown'
        : price.variantKey === 'artifact'
          ? 'artifact_exact'
          : isOptimizerVariantPriceKey(price.variantKey)
            ? 'variant_exact'
            : isRarityBracketPriceKey(price.variantKey) || isQltBracketPriceKey(price.variantKey)
              ? 'rarity_bracket'
              : 'source_variant_exact',
      sourceType: price.sourceType,
      sourceFields: price.sourceFields,
      sampleCount: price.sampleCount,
      averagePrice: price.valid ? price.averagePrice ?? null : null,
      medianPrice: price.valid ? price.medianPrice : null,
      optimizerPrice: price.valid && isRarityBracketPriceKey(price.variantKey) ? price.averagePrice ?? price.medianPrice : price.valid ? price.medianPrice : null,
      optimizerPriceStatistic: price.valid && isRarityBracketPriceKey(price.variantKey) ? 'average' : price.valid ? 'median' : 'unknown',
      valid: price.valid,
      unknownReason: price.unknownReason,
      snapshotAt: price.snapshotAt,
      staleAfter: price.staleAfter,
      stale: new Date(price.staleAfter).getTime() <= Date.now(),
    })),
  };
  await mkdir(dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ out: args.out, region: args.region, count: snapshot.count, validCount: snapshot.validCount, unknownCount: snapshot.unknownCount }, null, 2));
} finally {
  store.close();
}
