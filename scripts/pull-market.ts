import { createDefaultMarketClient, pullMarketToSQLite, readMarketPullFixture, type MarketRegion } from '../packages/stalcraft-market/src/index.js';

type Args = {
  db?: string;
  region: MarketRegion;
  fixture?: string;
  items: string[];
  cacheDir?: string;
  credentialsPath?: string;
  limit?: number;
  days?: number | 'all';
  maxPages?: number;
  additional: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { region: 'NA', items: [], additional: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = argv[index + 1];
    if (arg === '--') {
      continue;
    } else if (arg === '--db') {
      args.db = next;
      index += 1;
    } else if (arg === '--region') {
      args.region = next as MarketRegion;
      index += 1;
    } else if (arg === '--fixture') {
      args.fixture = next;
      index += 1;
    } else if (arg === '--items') {
      args.items = (next ?? '').split(',').map((item) => item.trim()).filter(Boolean);
      index += 1;
    } else if (arg === '--cache-dir') {
      args.cacheDir = next;
      index += 1;
    } else if (arg === '--credentials-path') {
      args.credentialsPath = next;
      index += 1;
    } else if (arg === '--limit') {
      args.limit = Number(next);
      index += 1;
    } else if (arg === '--days') {
      args.days = next === 'all' ? 'all' : Number(next);
      index += 1;
    } else if (arg === '--max-pages') {
      args.maxPages = Number(next);
      index += 1;
    } else if (arg === '--additional' || arg === '--variants') {
      args.additional = true;
    } else if (arg === '--help') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`Usage:
  pnpm market:pull -- --db .cache/market.sqlite --fixture fixtures/market.json
  pnpm market:pull -- --db .cache/market.sqlite --region NA --items lj0j,kqgy --additional --days 30
  pnpm market:pull -- --db .cache/market.sqlite --region NA --items wgko --additional --days all

Fixture shape:
  {"region":"NA","items":[{"itemId":"lj0j","history":{"prices":[{"price":100,"amount":1}]}}]}`);
}

const args = parseArgs(process.argv.slice(2));
if (!args.db) throw new Error('Missing required --db path');
if (args.region !== 'NA') throw new Error('UltimateBuild market pulls are fixed to --region NA');

const fixture = args.fixture ? await readMarketPullFixture(args.fixture) : undefined;
const region = fixture?.region ?? args.region;
if (region !== 'NA') throw new Error('UltimateBuild market pulls are fixed to region NA');
const client = fixture ? undefined : await createDefaultMarketClient({
  cacheDir: args.cacheDir,
  credentialsPath: args.credentialsPath,
});

const result = await pullMarketToSQLite({
  dbPath: args.db,
  region,
  itemIds: args.items,
  client,
  fixture,
  historyLimit: args.limit,
  historyAdditional: args.additional,
  historyDays: args.days ?? 30,
  maxHistoryPages: args.maxPages,
});

console.log(JSON.stringify({
  pullId: result.pullId,
  region,
  itemCount: result.itemCount,
  sampleCount: result.sampleCount,
  snapshotCount: result.snapshots.length,
  additional: args.additional,
  historyDays: args.days ?? 30,
}, null, 2));
