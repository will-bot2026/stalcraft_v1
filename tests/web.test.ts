import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { _MARKET_PRICING_CAVEAT, _optimizeForPrompt, load } from '../apps/web/src/routes/+page.server.js';
import { handle } from '../apps/web/src/hooks.server.js';

const SPEED = 'stalker.artefact_properties.factor.speed_modifier';
const RUNNING = 'stalker.artefact_properties.factor.sprint_speed_modifier';
const BULLET = 'stalker.artefact_properties.factor.bullet_dmg_factor';
const VITALITY = 'stalker.artefact_properties.factor.health_bonus';
const HEALING = 'stalker.artefact_properties.factor.heal_efficiency';
const CARRY = 'stalker.artefact_properties.factor.max_weight_bonus';
const CHEMICAL_RESISTANCE = 'stalker.artefact_properties.factor.chemical_burn_dmg_factor';
const REACTION_TO_BURNS = 'stalker.artefact_properties.factor.reaction_to_burn';
const SWAY = 'stalker.artefact_properties.factor.wiggle_bonus';

async function snapshotFetch(path: string): Promise<Response> {
  if (path === '/market/latest-NA.json') {
    return new Response(await readFile('apps/web/static/market/latest-NA.json', 'utf8'), { status: 200 });
  }
  return new Response(null, { status: 404 });
}

function params(entries: Record<string, string>): URLSearchParams {
  return new URLSearchParams(entries);
}

function syntheticMarketItem(itemId: string, price: number, sampleCount: number, extra: Record<string, unknown> = {}) {
  const now = new Date('2026-04-28T00:00:00Z').toISOString();
  return {
    itemId,
    variantKey: 'artifact',
    variantScope: 'artifact-id-only',
    pricingPrecision: 'artifact_exact',
    sourceFields: sampleCount === 0 ? { fallbackReason: 'absent market data', ...extra } : extra,
    sampleCount,
    averagePrice: price,
    medianPrice: price,
    optimizerPrice: price,
    optimizerPriceStatistic: 'median',
    valid: true,
    snapshotAt: now,
    staleAfter: now,
    stale: false,
  };
}

function syntheticSourceVariant(itemId: string, price: number, sourceFields: Record<string, unknown>, sampleCount = 1) {
  const now = new Date('2026-04-28T00:00:00Z').toISOString();
  return {
    itemId,
    variantKey: `api:${JSON.stringify(sourceFields)}`,
    variantScope: 'quality-additional-aware',
    pricingPrecision: 'source_variant_exact',
    sourceFields,
    sampleCount,
    averagePrice: price,
    medianPrice: price,
    optimizerPrice: price,
    optimizerPriceStatistic: 'median',
    valid: true,
    snapshotAt: now,
    staleAfter: now,
    stale: false,
  };
}

function syntheticSnapshot(items: Array<ReturnType<typeof syntheticMarketItem> | ReturnType<typeof syntheticSourceVariant>>) {
  return {
    schemaVersion: 1,
    generatedAt: new Date('2026-04-28T00:00:00Z').toISOString(),
    region: 'NA',
    priceMode: 'history_median',
    includeContainerCost: false,
    variantScope: 'artifact-id-only',
    count: items.length,
    validCount: items.length,
    unknownCount: 0,
    items,
  };
}

function snapshotResponse(snapshot: ReturnType<typeof syntheticSnapshot>): typeof fetch {
  return (async (path: string) => {
    if (path === '/market/latest-NA.json') return new Response(JSON.stringify(snapshot), { status: 200 });
    return new Response(null, { status: 404 });
  }) as typeof fetch;
}

function marketTotal(result: Awaited<ReturnType<typeof _optimizeForPrompt>>): number {
  return Number(result.market.total.replace(/[^\d]/g, ''));
}

function allStatLines(result: Awaited<ReturnType<typeof _optimizeForPrompt>>) {
  return [
    ...(result.stats.mobility ?? []),
    ...(result.stats.survivability ?? []),
    ...(result.stats.healing ?? []),
    ...(result.stats.reactions ?? []),
    ...(result.stats.weaponHandling ?? []),
    ...(result.stats.environmental ?? []),
  ];
}

function statValue(result: Awaited<ReturnType<typeof _optimizeForPrompt>>, label: string): number {
  return Number.parseFloat(allStatLines(result).find((line) => line.label === label)?.value ?? '0');
}

describe('SvelteKit local web shell', () => {
  it('builds generic three-trait requests instead of treating the example as a one-off', async () => {
    const result = await _optimizeForPrompt(
      'ignored prompt',
      snapshotFetch as typeof fetch,
      params({ objectiveCount: '3', objective1: VITALITY, objective2: HEALING, objective3: BULLET }),
    );

    expect(result.status).toBe('safe');
    expect(result.objective).toBe('Vitality + Healing effectiveness + Bullet resistance');
    expect(result.artifacts).toHaveLength(result.container.slots);
    expect(statValue(result, 'Vitality')).toBeGreaterThan(0);
    expect(statValue(result, 'Healing effectiveness')).toBeGreaterThan(0);
    expect(statValue(result, 'Bullet resistance')).toBeGreaterThan(0);
    expect(result.reasoning.join('\n')).toContain('Final stats are verified');
  });

  it('keeps enough generic frontier coverage for six-slot Chitin three-trait builds', async () => {
    const result = await _optimizeForPrompt(
      'ignored prompt',
      snapshotFetch as typeof fetch,
      params({ objectiveCount: '3', objective1: VITALITY, objective2: HEALING, objective3: BULLET, containerId: 'yq90' }),
    );

    expect(result.status).toBe('safe');
    expect(result.container.name).toBe('Chitin Backpack');
    expect(result.artifacts).toHaveLength(6);
    expect(result.objective).toBe('Vitality + Healing effectiveness + Bullet resistance');
    expect(statValue(result, 'Vitality')).toBeGreaterThan(0);
    expect(statValue(result, 'Healing effectiveness')).toBeGreaterThan(0);
    expect(statValue(result, 'Bullet resistance')).toBeGreaterThan(0);
    expect(result.optimizerStats?.candidateCount).toBeGreaterThan(18);
  });

  it('keeps representative six-slot containers from collapsing from frontier truncation', async () => {
    const representativeSixSlotContainers = ['g35n', 'l362', 'w42z', 'zq3n'];
    for (const containerId of representativeSixSlotContainers) {
      const result = await _optimizeForPrompt(
        'ignored prompt',
        snapshotFetch as typeof fetch,
        params({ objectiveCount: '3', objective1: VITALITY, objective2: HEALING, objective3: BULLET, containerId }),
      );

      expect(result.status, `${result.container.name} should produce a legal three-trait build`).toBe('safe');
      expect(result.artifacts).toHaveLength(6);
      expect(statValue(result, 'Vitality')).toBeGreaterThan(0);
      expect(statValue(result, 'Healing effectiveness')).toBeGreaterThan(0);
      expect(statValue(result, 'Bullet resistance')).toBeGreaterThan(0);
    }
  });

  it('keeps enough root-cause frontier coverage for seven-slot Barrel three-trait builds', async () => {
    const result = await _optimizeForPrompt(
      'ignored prompt',
      snapshotFetch as typeof fetch,
      params({ objectiveCount: '3', objective1: VITALITY, objective2: HEALING, objective3: BULLET, containerId: 'rgoz' }),
    );

    expect(result.status).toBe('safe');
    expect(result.container.name).toBe('Barrel Container');
    expect(result.artifacts).toHaveLength(7);
    expect(result.objective).toBe('Vitality + Healing effectiveness + Bullet resistance');
    expect(statValue(result, 'Vitality')).toBeGreaterThan(0);
    expect(statValue(result, 'Healing effectiveness')).toBeGreaterThan(0);
    expect(statValue(result, 'Bullet resistance')).toBeGreaterThan(0);
    expect(result.optimizerStats?.candidateCount).toBeGreaterThan(16);
  });

  it('sends rarity color data for every artifact card and styles the icon outline from it', async () => {
    const [result, pageSource] = await Promise.all([
      _optimizeForPrompt('ignored prompt', snapshotFetch as typeof fetch, params({ objectiveCount: '1', objective1: BULLET, budgetValue: '50m' })),
      readFile('apps/web/src/routes/+page.svelte', 'utf8'),
    ]);

    expect(result.artifacts.length).toBeGreaterThan(0);
    expect(result.artifacts.every((artifact) => artifact.rarityColor && artifact.rarityKey)).toBe(true);
    expect(pageSource).toContain('--rarity-color');
    expect(pageSource).toContain('artifact-icon');
  });

  it('does not build a no-budget main result from artifacts with absent market data', async () => {
    const result = await _optimizeForPrompt(
      'ignored prompt',
      snapshotResponse(syntheticSnapshot([])),
      params({ objectiveCount: '1', objective1: BULLET }),
    );

    expect(result.status).toBe('empty');
    expect(result.artifacts).toHaveLength(0);
    expect(result.cost).toBe('—');
    expect(result.reasoning.join('\n')).toContain('Unknown target-budget prices are excluded');
  });

  it('excludes no-all-time-sale artifacts while exposing expandable Best Possible builds', async () => {
    const result = await _optimizeForPrompt(
      'ignored prompt',
      snapshotFetch as typeof fetch,
      params({ objectiveCount: '1', objective1: SPEED, containerId: 'q1m4', budgetValue: '5m' }),
    );

    expect(result.status).toBe('safe');
    expect(result.artifacts.every((artifact) => artifact.priceStatus !== 'unknown')).toBe(true);
    expect(result.bestPossibleBuilds).toHaveLength(2);
    expect(result.bestPossibleBuilds.every((build) => build.budgetStatus.includes('Max build'))).toBe(true);
    expect(result.reasoning.join('\n')).toContain('Max Builds ignore budget and market obtainability');
  });

  it('uses source qlt+level rows as purchasable availability without treating rolls as price dimensions', async () => {
    const snapshot = syntheticSnapshot([
      syntheticSourceVariant('6goy', 2_000_000, { qlt: 2, level: 10, upgrade_bonus: 0, bonus_properties: ['SPEED'] }),
      syntheticSourceVariant('6goy', 9_000_000, { qlt: 2, level: 15, upgrade_bonus: 0, bonus_properties: ['CARRY'] }),
    ]);
    const result = await _optimizeForPrompt(
      'ignored prompt',
      snapshotResponse(snapshot),
      params({ objectiveCount: '1', objective1: SPEED, containerId: 'yqq0', budgetValue: '50m' }),
    );

    expect(result.status).toBe('safe');
    expect(result.artifacts.length).toBeGreaterThan(0);
    expect(result.artifacts.every((artifact) => artifact.priceStatus !== 'unknown')).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.id === '6goy' && artifact.quality === 130)).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.id === '6goy' && artifact.level === 15)).toBe(true);
  });

  it('labels stale/all-time median market rows as Old actual market data', async () => {
    const snapshot = syntheticSnapshot([
      { ...syntheticMarketItem('6goy', 1_000, 3, { fallbackReason: 'all-time median' }), stale: true },
    ]);
    const result = await _optimizeForPrompt(
      'ignored prompt',
      snapshotResponse(snapshot),
      params({ objectiveCount: '1', objective1: SPEED, containerId: 'yqq0' }),
    );

    expect(result.market.pricingCaveat).toContain('Fresh means usable 30-day history');
    expect(result.market.pricingCaveat).toContain('Budget covers artifact rarity/color and upgrade level');
    if (result.status === 'safe') {
      expect(result.artifacts.every((artifact) => artifact.priceStatus !== 'unknown')).toBe(true);
      expect(result.artifacts.some((artifact) => artifact.priceStatus === 'old')).toBe(true);
    }
  });

  it('states when selected traits cannot be combined into a legal build', async () => {
    const snapshot = syntheticSnapshot([
      syntheticMarketItem('x22sxr4', 1_000, 5),
    ]);
    const result = await _optimizeForPrompt(
      'ignored prompt',
      snapshotResponse(snapshot),
      params({ objectiveCount: '2', objective1: SPEED, objective2: CARRY, containerId: 'q1m4' }),
    );

    expect(result.status).toBe('empty');
    expect(result.reasoning[0]).toMatch(/Requested traits could not be combined|No build satisfied/);
  });

  it('exposes dropdown-only UltimateBuild controls to the local page', async () => {
    const data = await load({ fetch: snapshotFetch as typeof fetch });
    const pageSource = await readFile('apps/web/src/routes/+page.svelte', 'utf8');

    expect(data.defaults).toEqual({ region: 'NA', priceMode: 'history_median', includeContainerCost: false });
    expect(data.formControls.objectiveCount).toBe(1);
    expect(data.formControls.objectives[0]).toBe(SPEED);
    expect(data.formControls.artifactConstraintCount).toBe(0);
    expect(data.objectiveOptions.map((option) => option.label)).toEqual(expect.arrayContaining([
      'Movement speed',
      'Running speed',
      'Resistance to chemicals',
      'Reaction to burns',
      'Sway',
      'Bleeding',
      'Burning',
    ]));
    expect(pageSource).toContain('name="objective1"');
    expect(pageSource).toContain('name="objective2"');
    expect(pageSource).toContain('name="objective3"');
    expect(pageSource).toContain('name="containerId"');
    expect(pageSource).toContain('name="budgetValue"');
    expect(pageSource).toContain('name="artifactConstraintCount"');
    expect(pageSource).toContain('artifactConstraint${row}Id');
    expect(pageSource).toContain('artifactConstraint${row}Mode');
    expect(pageSource).not.toContain('name="prompt"');
    expect(pageSource).not.toContain('name="promptMode"');
    expect(pageSource).not.toContain('name="budgetMode"');
  });

  it('renders requested previously-hidden traits in the final result panel groups', async () => {
    const result = await _optimizeForPrompt(
      'ignored prompt',
      snapshotFetch as typeof fetch,
      params({
        objectiveCount: '3',
        objective1: CHEMICAL_RESISTANCE,
        objective2: REACTION_TO_BURNS,
        objective3: SWAY,
      }),
    );

    expect((result.stats.survivability ?? []).map((stat) => stat.label)).toContain('Resistance to chemicals');
    expect((result.stats.reactions ?? []).map((stat) => stat.label)).toContain('Reaction to burns');
    expect((result.stats.weaponHandling ?? []).map((stat) => stat.label)).toContain('Sway');
    expect((result.stats.environmental ?? []).map((stat) => stat.label)).toEqual(expect.arrayContaining(['Radiation', 'Biological infection', 'Psy-emissions', 'Temperature', 'Frost']));
  });

  it('parses shareable artifact include/exclude GET controls', async () => {
    const data = await load({
      fetch: snapshotFetch as typeof fetch,
      url: new URL(`https://ultimatebuild.local/?${params({
        objectiveCount: '1',
        objective1: SPEED,
        artifactConstraintCount: '2',
        artifactConstraint1Id: '6goy',
        artifactConstraint1Mode: 'include',
        artifactConstraint2Id: '9nvy',
        artifactConstraint2Mode: 'exclude',
      })}`),
    });

    expect(data.formControls.artifactConstraintCount).toBe(2);
    expect(data.formControls.artifactConstraints).toEqual([
      { artifactId: '6goy', mode: 'include' },
      { artifactId: '9nvy', mode: 'exclude' },
    ]);
    expect(data.result.reasoning[0]).toContain('exclude');
  });

  it('returns a clear invalid message for conflicting artifact constraints', async () => {
    const result = await _optimizeForPrompt(
      'ignored prompt',
      snapshotFetch as typeof fetch,
      params({
        objectiveCount: '1',
        objective1: SPEED,
        artifactConstraintCount: '2',
        artifactConstraint1Id: '6goy',
        artifactConstraint1Mode: 'include',
        artifactConstraint2Id: '6goy',
        artifactConstraint2Mode: 'exclude',
      }),
    );

    expect(result.status).toBe('empty');
    expect(result.safetyLabel).toContain('cannot be both included and excluded');
  });

  it('applies artifact constraints to purchasable and Max Builds', async () => {
    const result = await _optimizeForPrompt(
      'ignored prompt',
      snapshotFetch as typeof fetch,
      params({
        objectiveCount: '1',
        objective1: SPEED,
        containerId: 'yqq0',
        artifactConstraintCount: '1',
        artifactConstraint1Id: '6goy',
        artifactConstraint1Mode: 'exclude',
      }),
    );

    expect(result.artifacts.map((artifact) => artifact.id)).not.toContain('6goy');
    for (const build of result.bestPossibleBuilds) {
      expect(build.artifacts.map((artifact) => artifact.id)).not.toContain('6goy');
    }
  });

  it('includes selected container icon paths in page data and results', async () => {
    const data = await load({
      fetch: snapshotFetch as typeof fetch,
      url: new URL(`https://ultimatebuild.local/?${params({ objectiveCount: '1', objective1: SPEED, containerId: 'q1m4' })}`),
    });

    expect(data.containerOptions.find((option) => option.value === 'q1m4')?.icon).toBe('/item-icons/containers/q1m4.png');
    expect(data.result.container.icon).toBe('/item-icons/containers/q1m4.png');
  });

  it('has valid local PNG files for every container icon manifest entry', async () => {
    const manifest = JSON.parse(await readFile('data/normalized/item-icons.json', 'utf8')) as {
      entries: Array<{ kind: string; localPath: string; publicPath: string }>;
    };
    const containers = manifest.entries.filter((entry) => entry.kind === 'container');

    expect(containers.length).toBeGreaterThan(0);
    for (const entry of containers) {
      expect(entry.publicPath).toMatch(/^\/item-icons\/containers\/.+\.png$/);
      const bytes = await readFile(entry.localPath);
      expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    }
  });

  it('treats movement speed and running speed as separate dropdown traits', async () => {
    const [movement, running, both] = await Promise.all([
      _optimizeForPrompt('ignored prompt', snapshotFetch as typeof fetch, params({ objectiveCount: '1', objective1: SPEED, budgetValue: '1m' })),
      _optimizeForPrompt('ignored prompt', snapshotFetch as typeof fetch, params({ objectiveCount: '1', objective1: RUNNING, budgetValue: '1m' })),
      _optimizeForPrompt('ignored prompt', snapshotFetch as typeof fetch, params({ objectiveCount: '2', objective1: SPEED, objective2: RUNNING, budgetValue: '1m' })),
    ]);

    expect(movement.objective).toBe('Movement speed');
    expect(running.objective).toBe('Running speed');
    expect(both.objective).toBe('Movement speed + Running speed');
    expect(movement.objective).not.toContain('Running speed');
    expect(running.objective).not.toContain('Movement speed');
    expect(both.alternatives[0]?.objectiveValue).toContain('Movement speed');
    expect(both.alternatives[0]?.objectiveValue).toContain('Running speed');
  });

  it('ignores old prompt text in favor of selected dropdown requirements', async () => {
    const result = await _optimizeForPrompt(
      'best mobility build for Hive over 40 million',
      snapshotFetch as typeof fetch,
      params({ objectiveCount: '2', objective1: VITALITY, objective2: CARRY, budgetValue: '5m', containerId: 'q1m4' }),
    );

    expect(result.objective).toBe('Vitality + Carry weight');
    expect(result.budget).toBe('5.00M');
    expect(marketTotal(result)).toBeLessThanOrEqual(5_000_000);
    expect(result.container.name).toBe('Berloga-6U Container');
    expect(result.reasoning[0]).toContain('Selected Vitality + Carry weight');
    expect(result.reasoning[0]).not.toContain('best mobility');
  });

  it('uses target budget as a ceiling while preserving stat-first ranking', async () => {
    const cheapTarget = await _optimizeForPrompt('ignored prompt', snapshotFetch as typeof fetch, params({ objectiveCount: '1', objective1: BULLET, budgetValue: '5m' }));
    const noBudget = await _optimizeForPrompt('ignored prompt', snapshotFetch as typeof fetch, params({ objectiveCount: '1', objective1: BULLET }));

    expect(cheapTarget.objective).toBe('Bullet resistance');
    expect(cheapTarget.budget).toBe('5.00M');
    expect(marketTotal(cheapTarget)).toBeLessThanOrEqual(5_000_000);
    expect(cheapTarget.budgetStatus).toContain('under budget');
    expect(noBudget.budget).toBe('No target budget');
    expect(noBudget.reasoning.join('\n')).toContain('No target budget');
    expect(noBudget.status).toBe('safe');
    expect(noBudget.artifacts.length).toBeGreaterThan(0);
  });

  it('keeps contextual alternative rows without unconditional movement or score copy', async () => {
    const [bulletResult, pageSource] = await Promise.all([
      _optimizeForPrompt('ignored prompt', snapshotFetch as typeof fetch, params({ objectiveCount: '1', objective1: BULLET, budgetValue: '50m' })),
      readFile('apps/web/src/routes/+page.svelte', 'utf8'),
    ]);

    expect(pageSource).not.toContain('move · {alt.running} run');
    expect(pageSource).not.toContain('{alt.score}');
    expect(pageSource).not.toContain('{alt.deltaScore}');
    expect(pageSource).toContain('alt.tradeoffs');
    expect(pageSource).toContain('Max Builds');
    expect(pageSource).toContain('currentResult.bestPossibleBuilds');
    expect(pageSource).toContain('build-detail-card');
    expect(pageSource).toContain('{@render buildDetails(build, { showHeading: false })}');
    expect(bulletResult.alternatives.length).toBeGreaterThan(0);
    expect(bulletResult.alternatives[0]?.objectiveValue).toContain('Bullet resistance');
    expect(bulletResult.alternatives[0]?.tradeoffs.map((line) => line.label)).toEqual(
      expect.arrayContaining(['Vitality', 'Explosion protection', 'Laceration protection']),
    );
    expect(bulletResult.alternatives[0]?.tradeoffs.map((line) => line.label)).not.toEqual(
      expect.arrayContaining(['Movement speed', 'Running speed']),
    );
  });

  it('simplifies result flow to requirements, final stats, then artifact breakdown', async () => {
    const pageSource = await readFile('apps/web/src/routes/+page.svelte', 'utf8');
    const requirements = pageSource.indexOf('Build requirements');
    const stats = pageSource.indexOf('{@render buildDetails(currentResult)}');
    const loadout = pageSource.indexOf('Artifact loadout');

    expect(requirements).toBeGreaterThan(-1);
    expect(stats).toBeGreaterThan(requirements);
    expect(loadout).toBeGreaterThan(-1);
    expect(pageSource).not.toContain('#1 Recommended');
    expect(pageSource).not.toContain('Exact Final Stats');
    expect(pageSource).not.toContain('Combined Mobility');
    expect(pageSource).not.toContain('combinedMobility');
  });

  it('removes visible Wiki wording from page copy and result reasoning', async () => {
    const [result, pageSource] = await Promise.all([
      _optimizeForPrompt('ignored prompt', snapshotFetch as typeof fetch, params({ objectiveCount: '1', objective1: BULLET, budgetValue: '5m' })),
      readFile('apps/web/src/routes/+page.svelte', 'utf8'),
    ]);

    expect(pageSource).not.toContain('Wiki');
    expect(result.container.protection).toBe('Container protection applied');
    expect(result.reasoning.join('\n')).not.toContain('Wiki');
  });

  it('moves market and generator details into expandable callouts without duplicate market caveat in generator info', async () => {
    const [data, pageSource] = await Promise.all([
      load({ fetch: snapshotFetch as typeof fetch }),
      readFile('apps/web/src/routes/+page.svelte', 'utf8'),
    ]);

    expect(pageSource).toContain('<summary>Market Data Info</summary>');
    expect(pageSource).toContain('Budget covers artifact rarity/color and upgrade level');
    expect(pageSource).toContain('stat rolls, studied values, and selected traits are optimizer assumptions');
    expect(pageSource).toContain('<summary>Generator Info</summary>');
    expect(pageSource).not.toContain('Intelligence</');
    expect(data.result.market.pricingCaveat).toContain(_MARKET_PRICING_CAVEAT);
    expect(data.result.reasoning.some((line) => line.includes(_MARKET_PRICING_CAVEAT))).toBe(false);
  });

  it('keeps artifact panel values separate from final container-protected harmful contributions', async () => {
    const result = await _optimizeForPrompt(
      'ignored prompt',
      snapshotFetch as typeof fetch,
      params({ objectiveCount: '3', objective1: RUNNING, objective2: CARRY, objective3: VITALITY, containerId: 'rgoz', budgetValue: '50m' }),
    );
    const harmfulArtifact = result.artifacts.find((artifact) => artifact.finalContributions.some((stat) => stat.label === 'Radiation' && Number.parseFloat(stat.value) > 0));

    expect(harmfulArtifact).toBeDefined();
    const panelRadiation = Number.parseFloat(harmfulArtifact?.stats.find((stat) => stat.label === 'Radiation')?.value ?? '0');
    const finalRadiation = Number.parseFloat(harmfulArtifact?.finalContributions.find((stat) => stat.label === 'Radiation')?.value ?? '0');
    expect(panelRadiation).toBeGreaterThan(0);
    expect(finalRadiation).toBeGreaterThan(0);
    expect(finalRadiation).toBeLessThan(panelRadiation);
    const finalBuildRadiation = Number.parseFloat((result.stats.environmental ?? []).find((stat) => stat.label === 'Radiation')?.value ?? 'NaN');
    expect(finalBuildRadiation).toBeLessThanOrEqual(0.5);
  });

  it('does not expose an in-site feedback submission path', async () => {
    const pageSource = await readFile('apps/web/src/routes/+page.svelte', 'utf8');

    expect(pageSource).not.toContain('sendFeedback');
    expect(pageSource).not.toContain('String.fromCharCode(47, 117, 45, 47, 102)');
    expect(pageSource).not.toContain('Help improve UltimateBuild');
    expect(pageSource).not.toContain('/api/feedback');
    expect(pageSource).not.toContain('api.telegram.org');
  });

  it('keeps web imports away from job-only market credential and SQLite code', async () => {
    const pageServerSource = await readFile('apps/web/src/routes/+page.server.ts', 'utf8');
    const helperSource = await readFile('packages/stalcraft-market/src/pricing-helpers.ts', 'utf8');

    expect(pageServerSource).toContain("packages/stalcraft-market/src/pricing-helpers.js");
    expect(pageServerSource).not.toContain("packages/stalcraft-market/src/index.js");
    expect(helperSource).not.toMatch(/node:sqlite|STALCRAFT_CLIENT_SECRET|readFile|process\.env/);
  });

  it('sets security headers and snapshot cache headers from the SvelteKit hook', async () => {
    const response = await handle({
      event: { url: new URL('https://ultimatebuild.local/market/latest-NA.json') },
      resolve: async () => new Response('ok'),
    } as unknown as Parameters<typeof handle>[0]);

    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toContain('stale-while-revalidate');
  });
});
