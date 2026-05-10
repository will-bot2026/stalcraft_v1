import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  buildHistoryMedianPriceMap,
  createStalcraftMarketClient,
  extractHistoryPrices,
  parseStalcraftCredentials,
} from '../packages/stalcraft-market/src/index.js';

describe('STALCRAFT market API integration helpers', () => {
  it('parses credentials without exposing secret values', () => {
    const credentials = parseStalcraftCredentials('STALCRAFT_CLIENT_ID=client-id\nSTALCRAFT_CLIENT_SECRET=client-secret\n');
    expect(credentials).toEqual({ clientId: 'client-id', clientSecret: 'client-secret' });
  });

  it('authenticates with client credentials and fetches auction history prices', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 'token-1', token_type: 'Bearer', expires_in: 3600 }), { status: 200 });
      }
      return new Response(JSON.stringify({ total: 3, prices: [{ amount: 1, price: 100 }, { amount: 2, price: 300 }] }), { status: 200 });
    };

    const client = createStalcraftMarketClient({ credentials: { clientId: 'client-id', clientSecret: 'client-secret' }, fetchImpl });
    const history = await client.getAuctionHistory('NA', 'lj0j', { limit: 2 });

    expect(extractHistoryPrices(history)).toEqual([100, 300]);
    expect(calls[0]?.init?.body?.toString()).toContain('grant_type=client_credentials');
    expect(calls[0]?.init?.body?.toString()).toContain('scope=');
    expect(calls[1]?.url).toBe('https://eapi.stalcraft.net/NA/auction/lj0j/history?limit=2&offset=0&additional=false');
    expect((calls[1]?.init?.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
  });

  it('marks missing/invalid market history as Infinity so strict budget builds do not silently use free prices', async () => {
    const fetchImpl: typeof fetch = async (url) => {
      if (String(url).includes('/oauth/token')) return new Response(JSON.stringify({ access_token: 'token-1', token_type: 'Bearer', expires_in: 3600 }), { status: 200 });
      return new Response(JSON.stringify({ error: 'invalid item' }), { status: 400 });
    };

    const client = createStalcraftMarketClient({ credentials: { clientId: 'client-id', clientSecret: 'client-secret' }, fetchImpl });
    const prices = await buildHistoryMedianPriceMap(client, ['bad-id'], { region: 'NA', limit: 3 });

    expect(prices.get('bad-id')).toBe(Number.POSITIVE_INFINITY);
  });

  it('builds a median price map with local cache so optimizer budget checks can use real market prices', async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), 'ultimatebuild-market-'));
    let historyCalls = 0;
    const fetchImpl: typeof fetch = async (url) => {
      if (String(url).includes('/oauth/token')) return new Response(JSON.stringify({ access_token: 'token-1', token_type: 'Bearer', expires_in: 3600 }), { status: 200 });
      historyCalls += 1;
      const item = String(url).split('/auction/')[1]?.split('/')[0];
      const prices = item === 'a1' ? [{ price: 100 }, { price: 300 }, { price: 200 }] : [{ price: 1000 }, { price: 1200 }, { price: 800 }];
      return new Response(JSON.stringify({ total: prices.length, prices }), { status: 200 });
    };

    try {
      const client = createStalcraftMarketClient({ credentials: { clientId: 'client-id', clientSecret: 'client-secret' }, fetchImpl, cacheDir });
      const first = await buildHistoryMedianPriceMap(client, ['a1', 'b2', 'a1'], { region: 'NA', limit: 3 });
      const second = await buildHistoryMedianPriceMap(client, ['a1', 'b2'], { region: 'NA', limit: 3 });

      expect(Object.fromEntries(first)).toEqual({ a1: 200, b2: 1000 });
      expect(Object.fromEntries(second)).toEqual({ a1: 200, b2: 1000 });
      expect(historyCalls).toBe(2);
    } finally {
      await rm(cacheDir, { recursive: true, force: true });
    }
  });
});
