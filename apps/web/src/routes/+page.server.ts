import artifactsData from '../../../../data/normalized/artifacts.json' with { type: 'json' };
import containersData from '../../../../data/normalized/containers.json' with { type: 'json' };
import iconManifestData from '../../../../data/normalized/item-icons.json' with { type: 'json' };
import { calculateArtifactPanelStats, calculateFinalArtifactStats, WIKI_DANGER_LIMITS, type SummedStat } from '../../../../packages/stalcraft-core/src/index.js';
import { type Artifact, type Container } from '../../../../packages/stalcraft-data/src/index.js';
import { ARTIFACT_STAT_CATALOG, objectiveDirectionForStatKey, objectiveOptionsFromCatalog, parseOptimizationPrompt, type ParsedOptimizationRequest } from '../../../../packages/stalcraft-nlp/src/index.js';
import { generateArtifactCandidates, optimizeBuild, type ArtifactCandidateInstance, type ArtifactConstraint, type ObjectiveTerm, type OptimizeBuildResult, type OptimizedBuild, type PriceSourceSummary } from '../../../../packages/stalcraft-optimizer/src/index.js';
import { artifactQualityCategoryBracketFromQlt, artifactQualityCategoryBracketFromRarity, optimizerQualityFromApiQltAndPtn } from '../../../../packages/stalcraft-market/src/pricing-helpers.js';

type Tone = 'good' | 'warn' | 'bad' | 'neutral';
type StatLine = { label: string; value: string; tone?: Tone; cap?: string };
type ArtifactCard = {
  slot: number;
  id: string;
  name: string;
  icon: string;
  quality: number;
  level: number;
  rarityKey: string;
  rarity: string;
  rarityColor: string;
  price: string;
  priceStatus: 'fresh' | 'old' | 'unknown';
  stats: StatLine[];
  finalContributions: StatLine[];
  additionalStats: string[];
  traits: StatLine[];
};
type MarketSnapshotItem = {
  itemId: string;
  variantKey?: string;
  variantScope?: string;
  pricingPrecision?: 'artifact_exact' | 'variant_exact' | 'rarity_bracket' | 'source_variant_exact' | 'unknown';
  sourceFields?: Record<string, unknown>;
  sampleCount: number;
  averagePrice?: number | null;
  medianPrice: number | null;
  optimizerPrice?: number | null;
  optimizerPriceStatistic?: 'median' | 'average' | 'unknown';
  valid: boolean;
  unknownReason?: string;
  snapshotAt: string;
  staleAfter: string;
  stale: boolean;
};
type MarketSnapshot = {
  schemaVersion: number;
  generatedAt: string;
  region: 'NA';
  priceMode: string;
  marketWindow?: { region: 'NA'; days: number; statistic: string; source: string };
  includeContainerCost: false;
  variantScope: string;
  variantPricing?: {
    exactVariantEntries?: number;
    optimizerExactVariantEntries?: number;
    sourceExactVariantEntries?: number;
    rarityBracketEntries?: number;
    fallbackPrecision?: string;
    sourceVariantPrecision?: string;
  };
  count: number;
  validCount: number;
  unknownCount: number;
  items: MarketSnapshotItem[];
};
type AlternativeView = {
  rank: number;
  name: string;
  score: number;
  deltaScore: string;
  cost: string;
  objectiveValue: string;
  tradeoffs: StatLine[];
  safety: string;
  artifacts: string[];
};
type BuildDisplayView = {
  title: string;
  status: 'safe' | 'unsafe' | 'empty';
  safetyLabel: string;
  score: number;
  objective: string;
  movementSpeed: string;
  runningSpeed: string;
  cost: string;
  budget: string;
  budgetStatus: string;
  container: { name: string; slots: number; protection: string; note: string; icon: string };
  market: {
    region: string;
    mode: string;
    total: string;
    lastUpdated: string;
    pricingCaveat: string;
    sampleCount: number;
    unknownPrices: number;
    stalePrices: number;
    confidence: string;
  };
  artifacts: ArtifactCard[];
  stats: Record<string, StatLine[]>;
};
type SelectableBuildView = BuildDisplayView & { rank: number; name: string };
type BuildResultView = BuildDisplayView & {
  alternatives: AlternativeView[];
  alternativeBuilds: SelectableBuildView[];
  bestPossibleBuilds: SelectableBuildView[];
  reasoning: string[];
  optimizerStats?: OptimizeBuildResult['stats'];
};
type FormControls = {
  objectiveCount: number;
  objectives: string[];
  budgetValue: string;
  containerId: string;
  artifactConstraintCount: number;
  artifactConstraints: ArtifactConstraint[];
};
type EffectiveRequest = {
  parsed: ParsedOptimizationRequest;
  objectives: ObjectiveTerm[];
  objectiveLabel: string;
  constraints: ParsedOptimizationRequest['constraints'];
  sourceLabel: string;
};

const artifacts = artifactsData as Artifact[];
const containers = containersData as Container[];
const iconEntries = (iconManifestData as { entries: Array<{ id: string; publicPath: string; kind?: string }> }).entries;
const iconByItemId = new Map(iconEntries.map((entry) => [entry.id, entry.publicPath]));
const artifactOptions = artifacts
  .map((artifact) => ({ value: artifact.id, label: artifact.name, icon: iconByItemId.get(artifact.id) ?? '/favicon.png' }))
  .sort((left, right) => left.label.localeCompare(right.label));

const STAT_PREFIX = 'stalker.artefact_properties.factor.';
const SPEED = `${STAT_PREFIX}speed_modifier`;
const RUNNING = `${STAT_PREFIX}sprint_speed_modifier`;
const STAMINA = `${STAT_PREFIX}stamina_bonus`;
const STAMINA_REGEN = `${STAT_PREFIX}stamina_regeneration_bonus`;
const EFFECTIVE_HEALTH = `${STAT_PREFIX}health_bonus`;
const BULLET = `${STAT_PREFIX}bullet_dmg_factor`;
const EXPLOSION = `${STAT_PREFIX}explosion_dmg_factor`;
const LACERATION = `${STAT_PREFIX}tear_dmg_factor`;
const CARRY = `${STAT_PREFIX}max_weight_bonus`;
const RECOIL = `${STAT_PREFIX}recoil_bonus`;
const HEALING = `${STAT_PREFIX}heal_efficiency`;
const PERIODIC_HEALING = `${STAT_PREFIX}artefakt_heal`;
const SURVIVABILITY_KEYS = [EFFECTIVE_HEALTH, BULLET, EXPLOSION, LACERATION];
const CARRY_TRADEOFF_KEYS = [STAMINA];

export const _OBJECTIVE_OPTIONS = objectiveOptionsFromCatalog();

const STAT_LABELS = new Map(artifacts.flatMap((artifact) => [...artifact.stats, ...(artifact.additionalStats ?? [])].map((stat) => [stat.key, stat.name])));
const STAT_CATALOG_BY_KEY = new Map(ARTIFACT_STAT_CATALOG.map((entry) => [entry.key, entry]));
const RESULT_PANEL_GROUP_ORDER = ['mobility', 'survivability', 'healing', 'reactions', 'weaponHandling', 'environmental', 'special'] as const;
type ResultPanelGroup = (typeof RESULT_PANEL_GROUP_ORDER)[number];
const RESULT_PANEL_GROUP_KEYS = new Map<ResultPanelGroup, string[]>();
for (const entry of ARTIFACT_STAT_CATALOG) {
  const group = entry.resultPanelGroup as ResultPanelGroup;
  const keys = RESULT_PANEL_GROUP_KEYS.get(group) ?? [];
  keys.push(entry.key);
  RESULT_PANEL_GROUP_KEYS.set(group, keys);
}
const DANGER_LABELS = Object.fromEntries(Object.keys(WIKI_DANGER_LIMITS).map((key) => [key, STAT_LABELS.get(key) ?? STAT_CATALOG_BY_KEY.get(key)?.label ?? key.replace(STAT_PREFIX, '')]));
export const _MARKET_PRICING_CAVEAT = 'Budget covers artifact rarity/color and upgrade level. Market prices use actual NA sale history for the purchasable artifact/color/level; stat rolls, studied values, and selected bonus traits are optimizer assumptions that can be rolled later. Fresh means usable 30-day history; Old means no fresh row was available but all-time NA history exists. Max Builds are theoretical gameplay targets and may include unobserved variants.';

function marketPricingCaveat(snapshot: MarketSnapshot | null): string {
  const pricing = snapshot?.variantPricing;
  if (!pricing) return _MARKET_PRICING_CAVEAT;
  return `${_MARKET_PRICING_CAVEAT} Current snapshot has ${pricing.optimizerExactVariantEntries ?? 0} optimizer-exact Q/level rows, ${pricing.rarityBracketEntries ?? 0} artifact/color/level bucket rows, and ${pricing.sourceExactVariantEntries ?? 0} API source-variant rows retained for audit/search.`;
}

function formatPrice(value: number | undefined): string {
  if (!Number.isFinite(value)) return 'Unknown';
  const price = value ?? 0;
  if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(price >= 10_000_000 ? 1 : 2)}M`;
  if (price >= 1_000) return `${Math.round(price / 1_000)}K`;
  return String(Math.round(price));
}

function formatBudget(value: number | undefined): string {
  return value === undefined ? 'No target budget' : formatPrice(value);
}

function formatBudgetRange(constraints: ParsedOptimizationRequest['constraints']): string {
  if (constraints.maxBudget !== undefined && constraints.minBudget !== undefined) return `${formatPrice(constraints.minBudget)}-${formatPrice(constraints.maxBudget)}`;
  if (constraints.maxBudget !== undefined) return formatBudget(constraints.maxBudget);
  if (constraints.minBudget !== undefined) return `At least ${formatPrice(constraints.minBudget)}`;
  return 'No target budget';
}

function formatStat(value: number, isPercentage = false): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}${isPercentage ? '%' : ''}`;
}

function statValue(stats: Map<string, SummedStat>, key: string): number {
  return stats.get(key)?.value ?? 0;
}

function toneForStat(key: string, value: number): Tone {
  const cap = WIKI_DANGER_LIMITS[key];
  if (cap !== undefined) return value > cap ? 'bad' : value > cap * 0.8 ? 'warn' : 'good';
  if (objectiveDirectionForStatKey(key) === 'minimize') return value <= 0 ? 'good' : 'bad';
  return value > 0 ? 'good' : value < 0 ? 'bad' : 'neutral';
}

function formatRarity(rarity: string): string {
  return rarity.replace('rarity.', '').replace(/^./, (letter) => letter.toUpperCase());
}

const RARITY_COLORS: Record<string, string> = {
  'rarity.ordinary': '#f8fafc',
  'rarity.unordinary': '#22c55e',
  'rarity.special': '#3b82f6',
  'rarity.rare': '#ec4899',
  'rarity.exclusive': '#ef4444',
  'rarity.legendary': '#facc15',
  'rarity.unique': '#f59e0b',
};

function rarityColor(rarity: string): string {
  return RARITY_COLORS[rarity] ?? '#94a3b8';
}

function median(values: number[]): number {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function hasAbsentMarketDataEstimate(item: MarketSnapshotItem): boolean {
  return item.sourceFields?.fallbackPriceSource === 'rarity-category-median' || item.sampleCount === 0;
}

function hasUsableMarketPrice(item: MarketSnapshotItem): boolean {
  return item.valid && (item.sampleCount ?? 0) > 0 && Number.isFinite(item.optimizerPrice ?? item.medianPrice);
}

function marketMaps(snapshot: MarketSnapshot | null): {
  prices: Map<string, number>;
  inclusivePrices: Map<string, number>;
  items: Map<string, MarketSnapshotItem>;
  sampleCount: number;
  stalePrices: number;
} {
  const prices = new Map<string, number>();
  const inclusivePrices = new Map<string, number>();
  const items = new Map<string, MarketSnapshotItem>();
  let sampleCount = 0;
  let stalePrices = 0;
  const sourceBucketGroups = new Map<string, { prices: number[]; sampleCount: number; template: MarketSnapshotItem; sourceFields: Record<string, unknown> }>();
  for (const item of snapshot?.items ?? []) {
    const key = item.variantKey && item.variantKey !== 'artifact' ? `${item.itemId}|${item.variantKey}` : item.itemId;
    items.set(key, item);
    if (key === item.itemId) items.set(item.itemId, item);
    sampleCount += item.sampleCount ?? 0;
    if (item.stale) stalePrices += 1;
    if (
      hasUsableMarketPrice(item)
      && (item.variantKey === undefined || item.variantKey === 'artifact' || item.pricingPrecision === 'variant_exact' || item.pricingPrecision === 'rarity_bracket')
    ) {
      const price = (item.optimizerPrice ?? item.medianPrice)!;
      if (!hasAbsentMarketDataEstimate(item)) {
        prices.set(key, price);
        inclusivePrices.set(key, price);
      }
    }
    if (hasUsableMarketPrice(item) && !hasAbsentMarketDataEstimate(item) && item.pricingPrecision === 'source_variant_exact') {
      const qlt = typeof item.sourceFields?.qlt === 'number' && Number.isInteger(item.sourceFields.qlt) ? item.sourceFields.qlt : undefined;
      const level = typeof item.sourceFields?.level === 'number' && Number.isInteger(item.sourceFields.level)
        ? item.sourceFields.level
        : typeof item.sourceFields?.upgrade_level === 'number' && Number.isInteger(item.sourceFields.upgrade_level)
          ? item.sourceFields.upgrade_level
          : typeof item.sourceFields?.ptn === 'number' && Number.isInteger(item.sourceFields.ptn)
            ? item.sourceFields.ptn
            : undefined;
      const bracket = qlt === undefined ? undefined : artifactQualityCategoryBracketFromQlt(qlt);
      const addBucket = (bucketKey: string, sourceFields: Record<string, unknown>) => {
        const group = sourceBucketGroups.get(bucketKey) ?? { prices: [], sampleCount: 0, template: item, sourceFields };
        group.prices.push((item.optimizerPrice ?? item.medianPrice)!);
        group.sampleCount += item.sampleCount ?? 0;
        sourceBucketGroups.set(bucketKey, group);
      };
      if (bracket) {
        if (level !== undefined) addBucket(`${item.itemId}|qlt.${qlt}|level.${level}`, { qlt, level, bracketProof: 'derived-from-bundled-source-variant-qlt-level' });
        addBucket(`${item.itemId}|qlt.${qlt}`, { qlt, bracketProof: 'derived-from-bundled-source-variant-qlt' });
        addBucket(`${item.itemId}|${bracket.optimizerRarity}`, { qlt, bracketProof: 'derived-from-bundled-source-variant-qlt' });
      }
    }
  }
  for (const [key, group] of sourceBucketGroups) {
    if (prices.has(key)) continue;
    const price = median(group.prices);
    if (price <= 0) continue;
    prices.set(key, price);
    inclusivePrices.set(key, price);
    items.set(key, {
      ...group.template,
      variantKey: key.split(`${group.template.itemId}|`).at(-1) ?? key,
      variantScope: group.sourceFields.level !== undefined ? 'rarity-level-aware' : 'rarity-aware',
      pricingPrecision: 'rarity_bracket',
      sampleCount: group.sampleCount,
      medianPrice: price,
      optimizerPrice: price,
      optimizerPriceStatistic: 'median',
      sourceFields: group.sourceFields,
    });
  }
  return { prices, inclusivePrices, items, sampleCount, stalePrices };
}

const MARKET_SNAPSHOT_CACHE_TTL_MS = 15 * 60 * 1000;
const marketSnapshotCaches = new WeakMap<typeof fetch, { loadedAt: number; snapshot: MarketSnapshot | null }>();
const marketSnapshotInflight = new WeakMap<typeof fetch, Promise<MarketSnapshot | null>>();

async function loadMarketSnapshot(fetchFn: typeof fetch): Promise<MarketSnapshot | null> {
  const now = Date.now();
  const cached = marketSnapshotCaches.get(fetchFn);
  if (cached && now - cached.loadedAt < MARKET_SNAPSHOT_CACHE_TTL_MS) return cached.snapshot;
  let inflight = marketSnapshotInflight.get(fetchFn);
  if (!inflight) {
    inflight = (async () => {
      try {
        const response = await fetchFn('/market/latest-NA.json');
        if (!response.ok) return null;
        const snapshot = await response.json() as MarketSnapshot;
        return snapshot.schemaVersion === 1 ? snapshot : null;
      } catch {
        return null;
      }
    })();
    marketSnapshotInflight.set(fetchFn, inflight);
  }
  const snapshot = await inflight;
  marketSnapshotCaches.set(fetchFn, { loadedAt: Date.now(), snapshot });
  marketSnapshotInflight.delete(fetchFn);
  return snapshot;
}

function candidateById(candidates: ArtifactCandidateInstance[]): Map<string, ArtifactCandidateInstance> {
  return new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
}

function makeStatLine(stats: Map<string, SummedStat>, key: string): StatLine {
  const stat = stats.get(key);
  const value = stat?.value ?? 0;
  return { label: STAT_CATALOG_BY_KEY.get(key)?.label ?? STAT_LABELS.get(key) ?? key.replace(STAT_PREFIX, ''), value: formatStat(value, stat?.isPercentage ?? false), tone: toneForStat(key, value) };
}

function makeResultPanelLine(stats: Map<string, SummedStat>, key: string): StatLine {
  const cap = WIKI_DANGER_LIMITS[key];
  if (cap !== undefined) {
    const value = stats.get(key)?.value ?? 0;
    return {
      label: DANGER_LABELS[key] ?? STAT_CATALOG_BY_KEY.get(key)?.label ?? key.replace(STAT_PREFIX, ''),
      value: `${value.toFixed(2)} / ${cap.toFixed(2)}`,
      cap: cap.toFixed(2),
      tone: toneForStat(key, value),
    };
  }
  return makeStatLine(stats, key);
}

function makeResultPanelStats(stats: Map<string, SummedStat>, requestedObjectives: ObjectiveTerm[]): Record<string, StatLine[]> {
  const requestedKeys = new Set(requestedObjectives.map((objective) => objective.statKey));
  const grouped = Object.fromEntries(RESULT_PANEL_GROUP_ORDER.map((group) => [group, [] as StatLine[]])) as Record<ResultPanelGroup, StatLine[]>;
  const seen = new Set<string>();

  for (const group of RESULT_PANEL_GROUP_ORDER) {
    const keys = RESULT_PANEL_GROUP_KEYS.get(group) ?? [];
    for (const key of keys) {
      const value = stats.get(key)?.value ?? 0;
      if (value === 0 && !requestedKeys.has(key) && WIKI_DANGER_LIMITS[key] === undefined) continue;
      grouped[group].push(makeResultPanelLine(stats, key));
      seen.add(key);
    }
  }

  for (const [key, stat] of stats) {
    if (seen.has(key) || stat.value === 0) continue;
    const fallbackGroup = (STAT_CATALOG_BY_KEY.get(key)?.resultPanelGroup ?? 'special') as ResultPanelGroup;
    grouped[fallbackGroup].push(makeResultPanelLine(stats, key));
  }

  return grouped;
}

function makeDangerLines(stats: Map<string, SummedStat>): StatLine[] {
  return Object.entries(WIKI_DANGER_LIMITS).map(([key]) => makeResultPanelLine(stats, key));
}

function artifactTraitLines(
  artifact: Artifact,
  candidate: ArtifactCandidateInstance,
  container: Container,
): StatLine[] {
  if (candidate.selectedAdditionalStatKeys.length === 0) return [];
  const selected = new Set(candidate.selectedAdditionalStatKeys);
  const traitStats = (artifact.additionalStats ?? []).filter((stat) => selected.has(stat.key));
  if (traitStats.length === 0) return [];

  const traitArtifact: Artifact = {
    ...artifact,
    stats: traitStats,
    additionalStats: [],
  };
  return calculateArtifactPanelStats(traitArtifact, {
    level: candidate.level,
    quality: candidate.quality,
    rarity: candidate.rarity,
    selectedAdditionalStatKeys: [],
  }).map((stat) => ({
    label: stat.name,
    value: formatStat(stat.value, stat.isPercentage),
    tone: toneForStat(stat.key, stat.value),
  }));
}

function artifactCard(
  slot: number,
  build: OptimizedBuild,
  candidate: ArtifactCandidateInstance,
  container: Container,
): ArtifactCard {
  const artifact = artifacts.find((entry) => entry.id === candidate.artifactId)!;
  const assumption = {
    level: candidate.level,
    quality: candidate.quality,
    rarity: candidate.rarity,
    selectedAdditionalStatKeys: candidate.selectedAdditionalStatKeys,
  };
  const panelStats = calculateArtifactPanelStats(artifact, assumption);
  const finalStats = calculateFinalArtifactStats(artifact, assumption, container);
  const strongest = panelStats
    .map((stat) => ({ stat, abs: Math.abs(stat.value) }))
    .sort((a, b) => b.abs - a.abs)
    .map(({ stat }) => ({ label: stat.name, value: formatStat(stat.value, stat.isPercentage), tone: toneForStat(stat.key, stat.value) }));
  const finalContributions = finalStats
    .map((stat) => ({ stat, abs: Math.abs(stat.value) }))
    .sort((a, b) => b.abs - a.abs)
    .map(({ stat }) => ({ label: stat.name, value: formatStat(stat.value, stat.isPercentage), tone: toneForStat(stat.key, stat.value) }));
  const priceSource = candidate.priceSource;
  return {
    slot,
    id: candidate.artifactId,
    name: candidate.artifactName,
    icon: iconByItemId.get(candidate.artifactId) ?? '/favicon.png',
    rarityKey: candidate.rarity,
    rarity: formatRarity(candidate.rarity),
    rarityColor: rarityColor(candidate.rarity),
    quality: candidate.quality,
    level: candidate.level,
    price: formatPrice(candidate.price),
    priceStatus: priceSource.unknown || priceSource.marketDataStatus === 'absent-estimated'
      ? 'unknown'
      : priceSource.stale
        ? 'old'
        : 'fresh',
    additionalStats: candidate.selectedAdditionalStatKeys.map((key) => STAT_LABELS.get(key) ?? key.replace(STAT_PREFIX, '')),
    traits: artifactTraitLines(artifact, candidate, container),
    stats: strongest,
    finalContributions,
  };
}

function emptyResult(
  prompt: string,
  snapshot: MarketSnapshot | null,
  message: string,
  containerName = 'Hive Container',
  containerSlots = 5,
  containerIcon = '/favicon.png',
): BuildResultView {
  const pricingCaveat = marketPricingCaveat(snapshot);
  return {
    title: 'No legal build found yet',
    status: 'empty',
    safetyLabel: message,
    score: 0,
    objective: prompt,
    movementSpeed: '—',
    runningSpeed: '—',
    cost: '—',
    budget: '—',
    budgetStatus: 'Relax budget, safety caps, or quality.',
    container: { name: containerName, slots: containerSlots, protection: '—', note: 'No result', icon: containerIcon },
    market: {
      region: snapshot?.region ?? 'NA',
      mode: snapshot?.priceMode ?? 'history_median',
      total: '—',
      lastUpdated: snapshot ? `Snapshot generated ${new Date(snapshot.generatedAt).toLocaleString()}` : 'No market snapshot bundled yet',
      pricingCaveat,
      sampleCount: 0,
      unknownPrices: snapshot?.unknownCount ?? artifacts.length,
      stalePrices: 0,
      confidence: 'Unavailable',
    },
    artifacts: [],
    stats: { mobility: [], survivability: [], utility: [{ label: 'Result', value: message, tone: 'warn' }], environmental: [] },
    alternatives: [],
    alternativeBuilds: [],
    bestPossibleBuilds: [],
    reasoning: [message, 'Unknown target-budget prices are excluded, not treated as free.'],
  };
}

function budgetStatus(total: number, constraints: ParsedOptimizationRequest['constraints']): string {
  if (constraints.maxBudget !== undefined) return `${formatPrice(constraints.maxBudget - total)} under budget`;
  if (constraints.minBudget !== undefined) return `${formatPrice(total - constraints.minBudget)} over minimum`;
  return 'No target budget';
}

function budgetReasoning(constraints: ParsedOptimizationRequest['constraints']): string {
  if (constraints.maxBudget !== undefined) return `Used ${formatBudget(constraints.maxBudget)} as a target ceiling; stats win first, then closer price breaks ties.`;
  return 'No target budget was provided, so price is only used as a late tie-breaker and expensive variants stay eligible.';
}

function statLineForKey(stats: Map<string, SummedStat>, key: string): StatLine {
  const stat = stats.get(key);
  const value = stat?.value ?? 0;
  return {
    label: STAT_LABELS.get(key) ?? key.replace(STAT_PREFIX, ''),
    value: formatStat(value, stat?.isPercentage ?? false),
    tone: toneForStat(key, value),
  };
}

function alternativeTradeoffKeys(objectives: ObjectiveTerm[]): string[] {
  const objectiveKeys = objectives.map((objective) => objective.statKey);
  const objectiveSet = new Set(objectiveKeys);
  const keys = new Set<string>();
  const add = (key: string) => {
    if (!objectiveSet.has(key)) keys.add(key);
  };

  if (objectiveSet.has(SPEED) || objectiveSet.has(RUNNING)) {
    // Movement/Running are only pertinent in alternatives when the request actually includes them.
    // Generic mobility parses into both objective keys; direct Movement or Running requests include only that stat.
    return [];
  }

  if (objectiveKeys.some((key) => SURVIVABILITY_KEYS.includes(key))) {
    for (const key of SURVIVABILITY_KEYS) add(key);
  }
  if (objectiveSet.has(CARRY)) {
    for (const key of CARRY_TRADEOFF_KEYS) add(key);
  }
  if (objectiveSet.has(HEALING) || objectiveSet.has(PERIODIC_HEALING)) {
    add(EFFECTIVE_HEALTH);
  }

  return [...keys].slice(0, 4);
}

function alternativeTradeoffs(stats: Map<string, SummedStat>, objectives: ObjectiveTerm[]): StatLine[] {
  return alternativeTradeoffKeys(objectives).map((key) => statLineForKey(stats, key));
}

function resultView(
  prompt: string,
  snapshot: MarketSnapshot | null,
  result: OptimizeBuildResult,
  candidates: ArtifactCandidateInstance[],
  request: EffectiveRequest,
  container: Container,
  bestPossible?: { result: OptimizeBuildResult; candidates: ArtifactCandidateInstance[] },
): BuildResultView {
  const best = result.results[0];
  if (!best) {
    const noResultMessage = request.objectives.length > 1 && result.stats.prunedByObjectiveCoverage > 0
      ? 'Requested traits could not be combined into a legal build.'
      : 'No build satisfied the requested objective, budget, and safety limits.';
    const view = emptyResult(prompt, snapshot, noResultMessage, container.name, container.capacity, iconByItemId.get(container.id) ?? '/favicon.png');
    view.objective = request.objectiveLabel;
    view.budget = formatBudgetRange(request.constraints);
    view.budgetStatus = request.constraints.minBudget !== undefined
      ? `No priced legal build reached ${formatPrice(request.constraints.minBudget)}.`
      : 'Relax budget, safety caps, or quality.';
    view.reasoning = [
      noResultMessage,
      request.sourceLabel,
      budgetReasoning(request.constraints),
      'Final stats are verified through the calculator after optimization; market budget covers rarity/color and upgrade level, not the RNG cost of perfect rolls.',
      'Unknown target-budget prices are excluded from market-priced recommendations, not treated as free.',
      'Max Builds ignore budget and market obtainability so theoretical upgrades can be compared separately from purchasable recommendations.',
    ];
    return view;
  }
  const byId = candidateById(candidates);
  for (const candidate of bestPossible?.candidates ?? []) byId.set(candidate.candidateId, candidate);
  const { sampleCount, stalePrices } = marketMaps(snapshot);
  const objective = request.objectiveLabel;

  const buildType = objective.includes('Carry')
    ? 'Carry'
    : objective.includes('Stamina')
      ? 'Endurance'
      : objective.includes('Vitality') || objective.includes('Bullet') || objective.includes('Explosion') || objective.includes('Laceration')
        ? 'Survivability'
        : 'Mobility';

  const pricingCaveat = marketPricingCaveat(snapshot);
  const displayForBuild = (entry: OptimizedBuild, options: { bestPossible?: boolean } = {}): BuildDisplayView => {
    const chosenCandidates = entry.candidateIds.map((id) => byId.get(id)).filter((candidate): candidate is ArtifactCandidateInstance => Boolean(candidate));
    const unsafe = Object.entries(WIKI_DANGER_LIMITS).find(([key, cap]) => (entry.stats.get(key)?.value ?? 0) > cap);
    const hasUnknownMarketPrice = (candidate: ArtifactCandidateInstance) => candidate.priceSource.unknown || candidate.priceSource.marketDataStatus === 'absent-estimated';
    const unknownItemCount = chosenCandidates.filter(hasUnknownMarketPrice).length;
    const knownPricedTotal = chosenCandidates.reduce((total, candidate) => total + (hasUnknownMarketPrice(candidate) ? 0 : candidate.price), 0);
    const displayCost = unknownItemCount > 0
      ? `${formatPrice(knownPricedTotal)} + ${unknownItemCount} unknown item${unknownItemCount === 1 ? '' : 's'}`
      : formatPrice(entry.budget.total);
    const marketTotal = unknownItemCount > 0
      ? `${Math.round(knownPricedTotal).toLocaleString()} RU + ${unknownItemCount} unknown item${unknownItemCount === 1 ? '' : 's'}`
      : `${Math.round(entry.budget.total).toLocaleString()} RU`;
    return {
      title: `${unsafe ? 'Risky' : 'Safe'} ${buildType} — ${container.name}`,
      status: unsafe ? 'unsafe' : 'safe',
      safetyLabel: unsafe ? `Unsafe: ${DANGER_LABELS[unsafe[0]] ?? unsafe[0]} over cap` : 'Safe under caps',
      score: Math.round(entry.score * 100) / 100,
      objective,
      movementSpeed: formatStat(statValue(entry.stats, SPEED), true),
      runningSpeed: formatStat(statValue(entry.stats, RUNNING), true),
      cost: displayCost,
      budget: formatBudgetRange(request.constraints),
      budgetStatus: options.bestPossible
        ? 'Max build: budget/market obtainability not enforced; use as a theoretical target, not the main purchasable recommendation.'
        : budgetStatus(entry.budget.total, request.constraints),
      container: {
        name: container.name,
        slots: container.capacity,
        protection: 'Container protection applied',
        note: 'Artifact market total only',
        icon: iconByItemId.get(container.id) ?? '/favicon.png',
      },
      market: {
        region: snapshot?.region ?? 'NA',
        mode: snapshot?.priceMode ?? 'history_median',
        total: marketTotal,
        lastUpdated: snapshot ? `Snapshot generated ${new Date(snapshot.generatedAt).toLocaleString()}` : 'No market snapshot bundled yet',
        pricingCaveat,
        sampleCount,
        unknownPrices: unknownItemCount || snapshot?.unknownCount || artifacts.length,
        stalePrices,
        confidence: snapshot && snapshot.validCount >= 80 ? 'High' : snapshot && snapshot.validCount >= 40 ? 'Medium' : 'Low',
      },
      artifacts: chosenCandidates.map((candidate, index) => artifactCard(index + 1, entry, candidate, container)),
      stats: makeResultPanelStats(entry.stats, request.objectives),
    };
  };
  const alternatives = result.results.slice(1, 4).map((entry, index) => ({
    rank: index + 2,
    name: `Alternative ${index + 2}`,
    score: Math.round(entry.score * 100) / 100,
    deltaScore: `${entry.score >= best.score ? '+' : ''}${(entry.score - best.score).toFixed(2)}`,
    cost: formatPrice(entry.budget.total),
    objectiveValue: objectiveValueLine(entry.stats, request.objectives),
    tradeoffs: alternativeTradeoffs(entry.stats, request.objectives),
    safety: Object.entries(WIKI_DANGER_LIMITS).every(([key, cap]) => (entry.stats.get(key)?.value ?? 0) <= cap) ? 'Safe' : 'Unsafe',
    artifacts: alternativeArtifacts(entry, byId),
  }));
  const alternativeBuilds = result.results.slice(1, 4).map((entry, index) => ({
    rank: index + 2,
    name: `Alternative ${index + 2}`,
    ...displayForBuild(entry),
  }));
  const mainBuildKeys = new Set(result.results.map((entry) => entry.candidateIds.join('\0')));
  const bestPossibleBuilds = (bestPossible?.result.results ?? [])
    .filter((entry) => !mainBuildKeys.has(entry.candidateIds.join('\0')))
    .slice(0, 2)
    .map((entry, index) => ({
      rank: index + 1,
      name: `Max Build ${index + 1}`,
      ...displayForBuild(entry, { bestPossible: true }),
    }));

  return {
    ...displayForBuild(best),
    alternatives,
    alternativeBuilds,
    bestPossibleBuilds,
    reasoning: [
      request.sourceLabel,
      budgetReasoning(request.constraints),
      'Final stats are verified through the calculator after optimization; market budget covers rarity/color and upgrade level, not the RNG cost of perfect rolls.',
      'Artifact cards separate artifact-panel values from final container-protected contributions so harmful stat ranges can be audited.',
      'Unknown target-budget prices are excluded from market-priced recommendations, not treated as free.',
      'Max Builds ignore budget and market obtainability so theoretical upgrades can be compared separately from purchasable recommendations.',
    ],
    optimizerStats: result.stats,
  };
}

function parsePriceInput(value: string): number | undefined {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(m|million|k|thousand)?$/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  if (unit === 'm' || unit === 'million') return Math.floor(amount * 1_000_000);
  if (unit === 'k' || unit === 'thousand') return Math.floor(amount * 1_000);
  return Math.floor(amount);
}

const OBJECTIVE_POSITION_WEIGHTS = [1_000_000, 1_000, 1] as const;

function selectedObjectives(searchParams: URLSearchParams): ObjectiveTerm[] {
  const count = Math.max(1, Math.min(3, Number(searchParams.get('objectiveCount') ?? '1') || 1));
  const allowed = new Set(_OBJECTIVE_OPTIONS.map((option) => option.value));
  const statKeys = [1, 2, 3]
    .slice(0, count)
    .map((index) => searchParams.get(`objective${index}`)?.trim() ?? (index === 1 ? SPEED : ''))
    .filter((statKey) => allowed.has(statKey));
  const uniqueStatKeys = [...new Set(statKeys)];
  return uniqueStatKeys.map((statKey, index) => ({
    statKey,
    weight: OBJECTIVE_POSITION_WEIGHTS[index] ?? 1,
    direction: objectiveDirectionForStatKey(statKey),
  }));
}

function artifactConstraintCount(searchParams: URLSearchParams): number {
  return Math.max(0, Math.min(10, Number(searchParams.get('artifactConstraintCount') ?? '0') || 0));
}

function selectedArtifactConstraints(searchParams: URLSearchParams): ArtifactConstraint[] {
  const artifactIds = new Set(artifacts.map((artifact) => artifact.id));
  const count = artifactConstraintCount(searchParams);
  const constraints: ArtifactConstraint[] = [];
  for (let index = 1; index <= count; index += 1) {
    const artifactId = searchParams.get(`artifactConstraint${index}Id`)?.trim() ?? '';
    const mode = searchParams.get(`artifactConstraint${index}Mode`) === 'exclude' ? 'exclude' : 'include';
    if (!artifactIds.has(artifactId)) continue;
    constraints.push({ artifactId, mode });
  }
  return constraints;
}

function artifactConstraintLabel(constraints: ArtifactConstraint[]): string {
  if (constraints.length === 0) return 'No artifact constraints';
  const nameById = new Map(artifacts.map((artifact) => [artifact.id, artifact.name]));
  const includeCounts = new Map<string, number>();
  const excludes: string[] = [];
  for (const constraint of constraints) {
    if (constraint.mode === 'include') includeCounts.set(constraint.artifactId, (includeCounts.get(constraint.artifactId) ?? 0) + 1);
    else excludes.push(nameById.get(constraint.artifactId) ?? constraint.artifactId);
  }
  const parts = [
    ...[...includeCounts].map(([artifactId, count]) => `${nameById.get(artifactId) ?? artifactId}${count > 1 ? ` x${count}` : ''}`),
    ...excludes.map((name) => `exclude ${name}`),
  ];
  return parts.join(', ');
}

function artifactConstraintInvalidMessage(constraints: ArtifactConstraint[], container: Container): string | undefined {
  const includeCounts = new Map<string, number>();
  const excludes = new Set<string>();
  for (const constraint of constraints) {
    if (constraint.mode === 'include') includeCounts.set(constraint.artifactId, (includeCounts.get(constraint.artifactId) ?? 0) + 1);
    else excludes.add(constraint.artifactId);
  }
  const nameById = new Map(artifacts.map((artifact) => [artifact.id, artifact.name]));
  const conflict = [...includeCounts.keys()].find((artifactId) => excludes.has(artifactId));
  if (conflict) return `${nameById.get(conflict) ?? conflict} cannot be both included and excluded.`;
  const requiredCount = [...includeCounts.values()].reduce((total, count) => total + count, 0);
  if (requiredCount > container.capacity) return `Included artifact count (${requiredCount}) exceeds ${container.name}'s ${container.capacity} slots.`;
  return undefined;
}

function objectiveLabel(objectives: ObjectiveTerm[], parsed: ParsedOptimizationRequest): string {
  if (objectives.length > 0) return objectives.map((entry) => STAT_LABELS.get(entry.statKey) ?? entry.statKey.replace(STAT_PREFIX, '')).join(' + ');
  return parsed.objectiveMetadata?.formula
    ?? (parsed.objectives.map((entry) => STAT_LABELS.get(entry.statKey) ?? entry.statKey.replace(STAT_PREFIX, '')).join(' + ') || 'Movement speed');
}

function effectiveRequest(prompt: string, searchParams: URLSearchParams): EffectiveRequest {
  const parsed = parseOptimizationPrompt('');
  const objectives = selectedObjectives(searchParams);
  const constraints: ParsedOptimizationRequest['constraints'] = {};
  const budgetValue = parsePriceInput(searchParams.get('budgetValue') ?? '');
  if (budgetValue !== undefined) constraints.maxBudget = budgetValue;
  const artifactConstraints = selectedArtifactConstraints(searchParams);
  if (artifactConstraints.length > 0) constraints.artifactConstraints = artifactConstraints;
  const label = objectiveLabel(objectives, parsed);
  const artifactLabel = artifactConstraintLabel(artifactConstraints);
  return {
    parsed,
    objectives,
    objectiveLabel: label,
    constraints,
    sourceLabel: `Selected ${label}${constraints.maxBudget !== undefined ? ` with a ${formatPrice(constraints.maxBudget)} target ceiling` : ' with no price ceiling'}; ${artifactLabel}.`,
  };
}

function hasExplicitQuality(prompt: string): boolean {
  return /(\d{2,3}(?:\.\d+)?)\s*(?:quality|qual|q)(?=$|\s|,)|(?:quality|qual|q)\s*(\d{2,3}(?:\.\d+)?)|\bperfect\b|\bmaxed\b/i.test(prompt);
}

function hasExplicitLevel(prompt: string): boolean {
  return /(?:^|\s)\+\d{1,2}(?=$|\s|,)|(?:level|lvl)\s*\d{1,2}/i.test(prompt);
}

const RARITY_QUALITY_DOMAIN: Record<string, number[]> = {
  'rarity.unordinary': [100],
  'rarity.special': [115],
  'rarity.rare': [130],
  'rarity.exclusive': [145],
  'rarity.legendary': [160, 175],
  'rarity.unique': [175, 190],
};

function integerRange(min: number, max: number): number[] {
  const values: number[] = [];
  for (let value = Math.ceil(min); value <= Math.floor(max); value += 1) values.push(value);
  return values;
}

function rarityQualityDomain(rarity: string): number[] {
  const bracket = artifactQualityCategoryBracketFromRarity(rarity);
  if (!bracket) return [100];
  return integerRange(bracket.minQuality, bracket.maxQuality);
}

function qualityDomain(prompt: string, request: EffectiveRequest): number[] {
  if (hasExplicitQuality(prompt)) return [request.parsed.artifactAssumption.quality];
  if (request.constraints.rarity?.mode === 'exact') return rarityQualityDomain(request.constraints.rarity.rarity);
  if (request.constraints.rarity) return RARITY_QUALITY_DOMAIN[request.constraints.rarity.rarity] ?? [request.parsed.artifactAssumption.quality];
  return [...new Set([
    100, 101, 114,
    115, 116, 122, 129,
    130, 131, 137, 144,
    145, 146, 152, 159,
    160, 161, 167, 174, 175,
  ])];
}

function sourceQualityDomain(snapshot: MarketSnapshot | null): number[] {
  const values = new Set<number>();
  for (const item of snapshot?.items ?? []) {
    const qlt = typeof item.sourceFields?.qlt === 'number' && Number.isInteger(item.sourceFields.qlt) ? item.sourceFields.qlt : undefined;
    const ptn = typeof item.sourceFields?.ptn === 'number' && Number.isInteger(item.sourceFields.ptn) ? item.sourceFields.ptn : undefined;
    if (qlt === undefined || ptn === undefined || ![0, 5, 10, 15].includes(ptn)) continue;
    const quality = optimizerQualityFromApiQltAndPtn(qlt, ptn);
    if (quality !== undefined) values.add(quality);
  }
  return [...values];
}

function levelDomain(prompt: string, request: EffectiveRequest): number[] {
  if (hasExplicitLevel(prompt)) return [request.parsed.artifactAssumption.level];
  return [0, 5, 10, 15];
}

function candidateObjectiveScore(candidate: ArtifactCandidateInstance, objectives: ObjectiveTerm[]): number {
  return objectives.reduce((score, objective) => {
    const value = candidate.artifactPanelStats[objective.statKey] ?? 0;
    return score + (objective.direction === 'maximize' ? value : -value) * objective.weight;
  }, 0);
}

function normalizedCandidateObjectives(candidates: ArtifactCandidateInstance[], objectives: ObjectiveTerm[]): ObjectiveTerm[] {
  if (objectives.length <= 1) return objectives;
  return objectives.map((objective) => {
    const maxMagnitude = Math.max(...candidates.map((candidate) => Math.abs(candidate.artifactPanelStats[objective.statKey] ?? 0)), 0);
    return maxMagnitude > 0 ? { ...objective, weight: objective.weight / maxMagnitude } : objective;
  });
}

function webCandidateFrontierCap(container: Container, objectives: ObjectiveTerm[]): number {
  const objectiveCount = Math.max(1, objectives.length);
  const baseFloor = 16;
  const slotPressure = container.capacity * Math.max(2, objectiveCount);
  const multiObjectiveFloor = objectiveCount >= 3 ? objectiveCount * 8 : baseFloor;
  return Math.max(baseFloor, slotPressure, multiObjectiveFloor);
}

function selectCandidateFrontierForWeb(
  candidates: ArtifactCandidateInstance[],
  request: EffectiveRequest,
  container: Container,
): ArtifactCandidateInstance[] {
  const hasVariantBudget = request.constraints.maxBudget !== undefined || request.constraints.minBudget !== undefined;
  const requiredArtifactIds = new Set((request.constraints.artifactConstraints ?? [])
    .filter((constraint) => constraint.mode === 'include')
    .map((constraint) => constraint.artifactId));
  const excludedArtifactIds = new Set((request.constraints.artifactConstraints ?? [])
    .filter((constraint) => constraint.mode === 'exclude')
    .map((constraint) => constraint.artifactId));
  const selected = new Map<string, ArtifactCandidateInstance>();
  const scoringObjectives = normalizedCandidateObjectives(candidates, request.objectives);
  const add = (candidate: ArtifactCandidateInstance | undefined) => {
    if (candidate && Number.isFinite(candidate.price)) selected.set(candidate.candidateId, candidate);
  };
  const scoreSort = (left: ArtifactCandidateInstance, right: ArtifactCandidateInstance) =>
    candidateObjectiveScore(right, scoringObjectives) - candidateObjectiveScore(left, scoringObjectives)
    || (request.constraints.maxBudget !== undefined
      ? Math.abs(request.constraints.maxBudget - left.price) - Math.abs(request.constraints.maxBudget - right.price)
      : right.price - left.price)
    || left.candidateId.localeCompare(right.candidateId);
  const objectiveSort = (objective: ObjectiveTerm) => (left: ArtifactCandidateInstance, right: ArtifactCandidateInstance) =>
    candidateObjectiveScore(right, [objective]) - candidateObjectiveScore(left, [objective])
    || scoreSort(left, right);
  const dangerSort = (left: ArtifactCandidateInstance, right: ArtifactCandidateInstance) => {
    const leftDanger = Object.keys(WIKI_DANGER_LIMITS).reduce((total, key) => total + Math.max(0, left.artifactPanelStats[key] ?? 0), 0);
    const rightDanger = Object.keys(WIKI_DANGER_LIMITS).reduce((total, key) => total + Math.max(0, right.artifactPanelStats[key] ?? 0), 0);
    return leftDanger - rightDanger || scoreSort(left, right);
  };

  const cappedFrontier = (): ArtifactCandidateInstance[] => {
    const frontier = [...selected.values()];
    const capped = new Map<string, ArtifactCandidateInstance>();
    const forced = new Map<string, ArtifactCandidateInstance>();
    const keep = (candidate: ArtifactCandidateInstance | undefined) => {
      if (candidate) capped.set(candidate.candidateId, candidate);
    };
    const force = (candidate: ArtifactCandidateInstance | undefined) => {
      if (candidate) {
        forced.set(candidate.candidateId, candidate);
        capped.set(candidate.candidateId, candidate);
      }
    };
    // Multi-objective builds need reducer/support/low-danger candidates that are
    // not always top scorers for a single trait. Keep the existing buckets but
    // give 3+ objective requests a generic floor above small-container pressure.
    const cap = webCandidateFrontierCap(container, request.objectives);
    for (const artifactId of requiredArtifactIds) {
      const group = frontier.filter((candidate) => candidate.artifactId === artifactId);
      force([...group].sort(scoreSort)[0]);
      force([...group].sort((left, right) => left.price - right.price || scoreSort(left, right))[0]);
      for (const objective of request.objectives) force([...group].sort(objectiveSort(objective))[0]);
    }
    for (const candidate of [...frontier].sort(scoreSort).slice(0, Math.max(8, container.capacity + 1))) keep(candidate);
    for (const objective of request.objectives) {
      for (const candidate of [...frontier].sort(objectiveSort(objective)).slice(0, Math.max(5, request.objectives.length + 2))) keep(candidate);
    }
    for (const candidate of [...frontier].sort(dangerSort).slice(0, Math.max(4, Math.ceil(container.capacity / 2)))) keep(candidate);
    if (hasVariantBudget) {
      for (const candidate of [...frontier].sort((left, right) => left.price - right.price || scoreSort(left, right)).slice(0, 3)) keep(candidate);
    }
    for (const candidate of [...frontier].sort(scoreSort)) {
      if (capped.size >= cap) break;
      keep(candidate);
    }
    const optional = [...capped.values()].filter((candidate) => !forced.has(candidate.candidateId)).slice(0, Math.max(0, cap - forced.size));
    return [...forced.values(), ...optional].sort((left, right) => left.candidateId.localeCompare(right.candidateId));
  };

  const eligibleCandidates = candidates.filter((candidate) => !excludedArtifactIds.has(candidate.artifactId));
  if (!hasVariantBudget) {
    const byVariant = new Map<string, ArtifactCandidateInstance[]>();
    for (const candidate of eligibleCandidates) byVariant.set(candidate.artifactId, [...(byVariant.get(candidate.artifactId) ?? []), candidate]);
    for (const group of byVariant.values()) {
      const finite = group.filter((candidate) => Number.isFinite(candidate.price));
      add([...finite].sort((left, right) => left.price - right.price || scoreSort(left, right))[0]);
      add([...finite].sort(scoreSort)[0]);
      for (const objective of request.objectives) add([...finite].sort(objectiveSort(objective))[0]);
      add([...finite].sort(dangerSort)[0]);
    }
    return cappedFrontier();
  }

  const byArtifact = new Map<string, ArtifactCandidateInstance[]>();
  for (const candidate of eligibleCandidates) byArtifact.set(candidate.artifactId, [...(byArtifact.get(candidate.artifactId) ?? []), candidate]);

  for (const group of byArtifact.values()) {
    const finite = group.filter((candidate) => Number.isFinite(candidate.price));
    const cheapest = [...finite].sort((left, right) => left.price - right.price || scoreSort(left, right))[0];
    if (request.constraints.maxBudget !== undefined && request.constraints.minBudget === undefined) {
      const perSlotBudget = request.constraints.maxBudget / Math.max(1, container.capacity);
      const underPerSlot = finite.filter((candidate) => candidate.price <= perSlotBudget);
      add([...underPerSlot].sort(scoreSort)[0] ?? cheapest);
      for (const objective of request.objectives) add([...underPerSlot].sort(objectiveSort(objective))[0] ?? [...finite].sort(objectiveSort(objective))[0]);
      continue;
    }
    add(cheapest);
    add([...finite].sort(scoreSort)[0]);
    for (const objective of request.objectives) add([...finite].sort(objectiveSort(objective))[0]);
    if (request.constraints.minBudget !== undefined) {
      add([...finite].sort((left, right) => right.price - left.price || scoreSort(left, right))[0]);
    }
  }
  return cappedFrontier();
}

function containerFromControls(searchParams: URLSearchParams, parsed: ParsedOptimizationRequest): Container {
  const selectedContainerId = searchParams.get('containerId')?.trim();
  return containers.find((entry) => selectedContainerId && entry.id === selectedContainerId)
    ?? containers.find((entry) => entry.id === parsed.containerId)
    ?? containers.find((entry) => entry.name === 'Hive Container')
    ?? containers[0]!;
}

function objectiveValueLine(stats: Map<string, SummedStat>, objectives: ObjectiveTerm[]): string {
  return objectives
    .map((objective) => {
      const stat = stats.get(objective.statKey);
      const label = STAT_LABELS.get(objective.statKey) ?? objective.statKey.replace(STAT_PREFIX, '');
      return `${label}: ${formatStat(stat?.value ?? 0, stat?.isPercentage ?? false)}`;
    })
    .join(' · ');
}

function alternativeArtifacts(entry: OptimizedBuild, byId: Map<string, ArtifactCandidateInstance>): string[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const candidateId of entry.candidateIds) {
    const candidate = byId.get(candidateId);
    if (!candidate) continue;
    const current = counts.get(candidate.artifactName) ?? { name: candidate.artifactName, count: 0 };
    current.count += 1;
    counts.set(candidate.artifactName, current);
  }
  return [...counts.values()].map((artifact) => artifact.count > 1 ? `${artifact.name} ×${artifact.count}` : artifact.name);
}

function priceSourceSummaryForItem(itemId: string, item: MarketSnapshotItem, snapshot: MarketSnapshot | null): PriceSourceSummary {
  const absentEstimated = hasAbsentMarketDataEstimate(item);
  const fallbackReason = typeof item.sourceFields?.fallbackReason === 'string' ? item.sourceFields.fallbackReason : undefined;
  return {
    region: snapshot?.region,
    snapshotAt: item.snapshotAt,
    sampleCount: item.sampleCount,
    stale: item.stale,
    variantScope: item.variantScope === 'rarity-aware' ? 'rarity-aware' : item.variantScope === 'quality-level-aware' ? 'quality-level-aware' : 'artifact-id-only',
    pricingPrecision: item.valid
      ? item.pricingPrecision === 'rarity_bracket'
        ? 'rarity_bracket'
        : itemId.includes('|')
          ? 'variant_exact'
          : 'artifact_exact'
      : 'unknown',
    priceKey: itemId,
    unknown: !item.valid,
    marketDataStatus: absentEstimated ? 'absent-estimated' : 'actual',
    fallbackReason,
  };
}

function candidatePriceSources(items: Map<string, MarketSnapshotItem>, snapshot: MarketSnapshot | null): {
  priceSourceByArtifactId: Map<string, PriceSourceSummary>;
  priceSourceByPriceKey: Map<string, PriceSourceSummary>;
} {
  return {
    priceSourceByArtifactId: new Map([...items]
      .filter(([itemId]) => !itemId.includes('|'))
      .map(([itemId, item]) => [itemId, priceSourceSummaryForItem(itemId, item, snapshot)])),
    priceSourceByPriceKey: new Map([...items]
      .filter(([itemId]) => itemId.includes('|'))
      .map(([itemId, item]) => [itemId, priceSourceSummaryForItem(itemId, item, snapshot)])),
  };
}

export async function _optimizeForPrompt(prompt: string, fetchFn: typeof fetch, searchParams = new URLSearchParams()): Promise<BuildResultView> {
  const snapshot = await loadMarketSnapshot(fetchFn);
  const { prices, inclusivePrices, items } = marketMaps(snapshot);
  const request = effectiveRequest(prompt, searchParams);
  const container = containerFromControls(searchParams, request.parsed);
  const invalidArtifactConstraints = artifactConstraintInvalidMessage(request.constraints.artifactConstraints ?? [], container);
  if (invalidArtifactConstraints) {
    const view = emptyResult(prompt, snapshot, invalidArtifactConstraints, container.name, container.capacity, iconByItemId.get(container.id) ?? '/favicon.png');
    view.objective = request.objectiveLabel;
    view.budget = formatBudgetRange(request.constraints);
    view.reasoning = [invalidArtifactConstraints, request.sourceLabel];
    return view;
  }
  const domains = {
    qualityDomain: [...new Set([...qualityDomain(prompt, request), ...sourceQualityDomain(snapshot)])].sort((left, right) => left - right),
    levelDomain: levelDomain(prompt, request),
  };
  const priceSources = candidatePriceSources(items, snapshot);
  const generationBase = {
    artifacts,
    ...domains,
    strictBudget: true,
    additionalStatPolicy: 'optimize-unlocked' as const,
    additionalStatObjectiveKeys: new Set([
      ...request.objectives.map((objective) => objective.statKey),
      ...Object.keys(WIKI_DANGER_LIMITS),
    ]),
    ...priceSources,
  };
  const generatedCandidates = generateArtifactCandidates({
    ...generationBase,
    prices,
  });
  const candidates = selectCandidateFrontierForWeb(generatedCandidates, request, container);
  const result = optimizeBuild({
    artifacts,
    container,
    candidates,
    objectives: request.objectives,
    constraints: { ...request.constraints, prices, dangerLimits: WIKI_DANGER_LIMITS },
    artifactAssumption: request.parsed.artifactAssumption,
    allowDuplicates: true,
    resultLimit: 4,
  });

  const bestPossibleGeneratedCandidates = generateArtifactCandidates({
    ...generationBase,
    prices: inclusivePrices,
    strictBudget: false,
  });
  const maxBuildRequest: EffectiveRequest = {
    ...request,
    constraints: request.constraints.artifactConstraints ? { artifactConstraints: request.constraints.artifactConstraints } : {},
  };
  const bestPossibleCandidates = selectCandidateFrontierForWeb(bestPossibleGeneratedCandidates, maxBuildRequest, container);
  const bestPossibleResult = optimizeBuild({
    artifacts,
    container,
    candidates: bestPossibleCandidates,
    objectives: request.objectives,
    constraints: { artifactConstraints: request.constraints.artifactConstraints, dangerLimits: WIKI_DANGER_LIMITS },
    artifactAssumption: request.parsed.artifactAssumption,
    allowDuplicates: true,
    resultLimit: 4,
  });

  return resultView(prompt, snapshot, result, candidates, request, container, { result: bestPossibleResult, candidates: bestPossibleCandidates });
}

export const load = async (event: { fetch?: typeof globalThis.fetch; url?: URL } = {}) => {
  const fetchFn = event.fetch ?? (async () => new Response(null, { status: 404 }));
  const url = event.url ?? new URL('https://ultimatebuild.local/');
  const prompt = '';
  const objectiveCount = Math.max(1, Math.min(3, Number(url.searchParams.get('objectiveCount') ?? '1') || 1));
  const selectedContainer = containerFromControls(url.searchParams, parseOptimizationPrompt(''));
  const selectedArtifactConstraintCount = artifactConstraintCount(url.searchParams);
  const parsedArtifactConstraints = selectedArtifactConstraints(url.searchParams);
  const formControls: FormControls = {
    objectiveCount,
    objectives: [1, 2, 3].map((index) => url.searchParams.get(`objective${index}`) ?? (index === 1 ? SPEED : '')),
    budgetValue: url.searchParams.get('budgetValue') ?? '',
    containerId: selectedContainer.id,
    artifactConstraintCount: selectedArtifactConstraintCount,
    artifactConstraints: Array.from({ length: selectedArtifactConstraintCount }, (_, index) => ({
      artifactId: url.searchParams.get(`artifactConstraint${index + 1}Id`) ?? parsedArtifactConstraints[index]?.artifactId ?? '',
      mode: (url.searchParams.get(`artifactConstraint${index + 1}Mode`) === 'exclude' ? 'exclude' : parsedArtifactConstraints[index]?.mode ?? 'include') as 'include' | 'exclude',
    })),
  };
  return {
    defaults: { region: 'NA', priceMode: 'history_median', includeContainerCost: false },
    objectiveOptions: _OBJECTIVE_OPTIONS.filter((option) => ARTIFACT_STAT_CATALOG.some((entry) => entry.key === option.value)),
    containerOptions: containers
      .map((container) => ({ value: container.id, label: container.name, slots: container.capacity, icon: iconByItemId.get(container.id) ?? '/favicon.png' }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    artifactOptions,
    formControls,
    examplePrompt: prompt,
    result: await _optimizeForPrompt(prompt, fetchFn, url.searchParams),
  };
};
