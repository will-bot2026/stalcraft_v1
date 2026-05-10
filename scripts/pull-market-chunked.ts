import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type Args = {
  db: string;
  region: 'NA';
  half: 'first' | 'second' | 'all';
  chunkSize: number;
  sleepSeconds: number;
  limit: number;
  days: number | 'all';
  cacheDir: string;
  logPath: string;
  maxChunks?: number;
  resume: boolean;
  additional: boolean;
  credentialsPath?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    db: '.cache/market-full.sqlite',
    region: 'NA',
    half: 'all',
    chunkSize: 8,
    sleepSeconds: 300,
    limit: 200,
    days: 30,
    cacheDir: '.cache/stalcraft-market-full',
    logPath: `.cache/market-chunked-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`,
    resume: true,
    additional: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = argv[index + 1];
    if (arg === '--') continue;
    if (arg === '--db') { args.db = next!; index += 1; }
    else if (arg === '--region') { args.region = next as 'NA'; index += 1; }
    else if (arg === '--half') { args.half = next as Args['half']; index += 1; }
    else if (arg === '--chunk-size') { args.chunkSize = Number(next); index += 1; }
    else if (arg === '--sleep-seconds') { args.sleepSeconds = Number(next); index += 1; }
    else if (arg === '--limit') { args.limit = Number(next); index += 1; }
    else if (arg === '--days') { args.days = next === 'all' ? 'all' : Number(next); index += 1; }
    else if (arg === '--cache-dir') { args.cacheDir = next!; index += 1; }
    else if (arg === '--log') { args.logPath = next!; index += 1; }
    else if (arg === '--max-chunks') { args.maxChunks = Number(next); index += 1; }
    else if (arg === '--credentials-path') { args.credentialsPath = next!; index += 1; }
    else if (arg === '--no-resume') { args.resume = false; }
    else if (arg === '--additional') { args.additional = true; }
    else if (arg === '--no-additional') { args.additional = false; }
    else if (arg === '--help') { printHelp(); process.exit(0); }
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.region !== 'NA') throw new Error('UltimateBuild market pulls are fixed to --region NA');
  if (!Number.isFinite(args.chunkSize) || args.chunkSize < 1) throw new Error('Invalid --chunk-size');
  if (!Number.isFinite(args.sleepSeconds) || args.sleepSeconds < 0) throw new Error('Invalid --sleep-seconds');
  return args;
}

function printHelp(): void {
  console.log(`Usage:
  pnpm market:pull-chunked -- --db .cache/market-full.sqlite --region NA --half first --chunk-size 8 --sleep-seconds 300 --limit 200 --days 30 --additional
  pnpm market:pull-chunked -- --db .cache/market-full-all.sqlite --region NA --half all --chunk-size 4 --sleep-seconds 300 --limit 200 --days all --additional

Notes:
  - Processes items one-by-one so one HTTP 400 does not fail a chunk.
  - Writes JSONL events to --log and resumes completed item IDs from that log by default.
  - Sleeps between chunks, not between items inside a chunk.
  - Use --max-chunks for a short smoke run.`);
}

function appendJsonl(file: string, event: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
}

function completedFromLog(file: string): Set<string> {
  const done = new Set<string>();
  if (!fs.existsSync(file)) return done;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.event === 'item_pull_complete' && event.itemId) done.add(event.itemId);
    } catch {
      // Ignore corrupted partial log lines; new events will still append.
    }
  }
  return done;
}

function artifactIdsForHalf(half: Args['half']): string[] {
  const artifacts = JSON.parse(fs.readFileSync('data/normalized/artifacts.json', 'utf8')) as Array<{ id: string }>;
  const split = Math.ceil(artifacts.length / 2);
  const selected = half === 'first' ? artifacts.slice(0, split) : half === 'second' ? artifacts.slice(split) : artifacts;
  return selected.map((artifact) => artifact.id);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const args = parseArgs(process.argv.slice(2));
const alreadyDone = args.resume ? completedFromLog(args.logPath) : new Set<string>();
const target = artifactIdsForHalf(args.half).filter((itemId) => !alreadyDone.has(itemId));
const chunks: string[][] = [];
for (let index = 0; index < target.length; index += args.chunkSize) chunks.push(target.slice(index, index + args.chunkSize));
const plannedChunks = args.maxChunks === undefined ? chunks : chunks.slice(0, args.maxChunks);
const failures: Array<{ itemId: string; status: number | null }> = [];

appendJsonl(args.logPath, {
  event: 'chunked_pull_start',
  db: args.db,
  region: args.region,
  half: args.half,
  chunkSize: args.chunkSize,
  sleepSeconds: args.sleepSeconds,
  limit: args.limit,
  days: args.days,
  cacheDir: args.cacheDir,
  targetCount: target.length,
  skippedCompletedCount: alreadyDone.size,
  plannedChunkCount: plannedChunks.length,
  additional: args.additional,
});

for (let chunkIndex = 0; chunkIndex < plannedChunks.length; chunkIndex += 1) {
  const chunk = plannedChunks[chunkIndex]!;
  appendJsonl(args.logPath, { event: 'chunk_start', chunkIndex, chunkCount: plannedChunks.length, items: chunk });
  for (const itemId of chunk) {
    appendJsonl(args.logPath, { event: 'item_pull_start', chunkIndex, itemId });
    const command = [
      'market:pull', '--',
      '--db', args.db,
      '--region', args.region,
      '--items', itemId,
      '--limit', String(args.limit),
      '--days', String(args.days),
      '--cache-dir', args.cacheDir,
    ];
    if (args.additional) command.push('--additional');
    if (args.credentialsPath) command.push('--credentials-path', args.credentialsPath);
    const result = spawnSync('pnpm', command, { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status === 0) {
      appendJsonl(args.logPath, { event: 'item_pull_complete', chunkIndex, itemId, status: result.status });
    } else {
      failures.push({ itemId, status: result.status });
      appendJsonl(args.logPath, {
        event: 'item_pull_failed',
        chunkIndex,
        itemId,
        status: result.status,
        stderrTail: (result.stderr ?? '').slice(-2000),
        stdoutTail: (result.stdout ?? '').slice(-2000),
      });
    }
  }
  appendJsonl(args.logPath, { event: 'chunk_complete', chunkIndex, failureCountSoFar: failures.length });
  if (chunkIndex < plannedChunks.length - 1 && args.sleepSeconds > 0) {
    appendJsonl(args.logPath, { event: 'sleep_start', seconds: args.sleepSeconds, nextChunkIndex: chunkIndex + 1 });
    await sleep(args.sleepSeconds * 1000);
    appendJsonl(args.logPath, { event: 'sleep_complete', nextChunkIndex: chunkIndex + 1 });
  }
}

appendJsonl(args.logPath, {
  event: 'chunked_pull_complete',
  half: args.half,
  attemptedCount: plannedChunks.reduce((sum, chunk) => sum + chunk.length, 0),
  failureCount: failures.length,
  failures,
  logPath: args.logPath,
});

console.log(JSON.stringify({
  half: args.half,
  attemptedCount: plannedChunks.reduce((sum, chunk) => sum + chunk.length, 0),
  skippedCompletedCount: alreadyDone.size,
  failureCount: failures.length,
  failures,
  logPath: args.logPath,
}, null, 2));
