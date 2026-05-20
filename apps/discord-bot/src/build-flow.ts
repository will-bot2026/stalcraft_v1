import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ARTIFACT_STAT_CATALOG, objectiveOptionsFromCatalog } from '../../../packages/stalcraft-nlp/src/index.js';
import type { Artifact, Container } from '../../../packages/stalcraft-data/src/index.js';

type QuestionKind = 'objective' | 'container' | 'budget' | 'quality' | 'level' | 'rarity';

export type BuildAnswerState = {
  step: number;
  objectives: string[];
  containerId?: string;
  budgetValue?: string;
  quality?: string;
  level?: string;
  rarity?: string;
};

export type BuildQuestion = {
  kind: QuestionKind;
  prompt: string;
  options?: Array<{ value: string; label: string }>;
  optional?: boolean;
};

export type BuildResultSummary = {
  content: string;
  localUrl: string;
};

const STAT_BY_KEY = new Map(ARTIFACT_STAT_CATALOG.map((entry) => [entry.key, entry]));
const RARITY_LABELS = new Map([
  ['rarity.unordinary', 'Unordinary'],
  ['rarity.special', 'Special'],
  ['rarity.rare', 'Rare'],
  ['rarity.exclusive', 'Exclusive'],
  ['rarity.legendary', 'Legendary'],
  ['rarity.unique', 'Unique'],
]);

export function initialState(): BuildAnswerState {
  return { step: 0, objectives: [] };
}

export async function loadCatalogs(root = process.cwd()): Promise<{ containers: Container[]; artifacts: Artifact[] }> {
  const [containersRaw, artifactsRaw] = await Promise.all([
    readFile(join(root, 'data/normalized/containers.json'), 'utf8'),
    readFile(join(root, 'data/normalized/artifacts.json'), 'utf8'),
  ]);
  return { containers: JSON.parse(containersRaw) as Container[], artifacts: JSON.parse(artifactsRaw) as Artifact[] };
}

export function questions(containers: Container[]): BuildQuestion[] {
  const objectiveOptions = objectiveOptionsFromCatalog().map((option) => ({ value: option.value, label: option.label }));
  const topContainers = containers
    .map((container) => ({ value: container.id, label: `${container.name} (${container.capacity} slots, ${container.protection}% protection)` }))
    .sort((left, right) => left.label.localeCompare(right.label));
  return [
    {
      kind: 'objective',
      prompt: 'Pick your first build goal/stat to optimize. Reply with the number or stat name.',
      options: objectiveOptions,
    },
    {
      kind: 'objective',
      prompt: 'Optional: pick a second build goal/stat, or reply `skip`.',
      options: objectiveOptions,
      optional: true,
    },
    {
      kind: 'objective',
      prompt: 'Optional: pick a third build goal/stat, or reply `skip`.',
      options: objectiveOptions,
      optional: true,
    },
    {
      kind: 'container',
      prompt: 'Pick the container/backpack. Reply with a number or name. Default suggestion: Hive/Barrel/Berloga 6 depending on your build.',
      options: topContainers,
    },
    {
      kind: 'budget',
      prompt: 'Budget ceiling? Examples: `5m`, `2500000`, or `none` for no target budget.',
      optional: true,
    },
    {
      kind: 'quality',
      prompt: 'Artifact quality assumption? Examples: `100`, `145`, `175`, or `default`.',
      optional: true,
    },
    {
      kind: 'level',
      prompt: 'Artifact upgrade level? Examples: `0`, `5`, `10`, `15`, or `default`.',
      optional: true,
    },
    {
      kind: 'rarity',
      prompt: 'Rarity filter? Reply `none`, `rare`, `legendary or higher`, `exclusive or lower`, etc.',
      optional: true,
    },
  ];
}

export function renderQuestion(question: BuildQuestion): string {
  const lines = [`**UltimateBuild question ${question.kind === 'objective' ? '— objective' : ''}**`, question.prompt];
  if (question.options) {
    const shown = question.options.slice(0, question.kind === 'container' ? 30 : 34);
    lines.push('', ...shown.map((option, index) => `${index + 1}. ${option.label}`));
    if (question.options.length > shown.length) lines.push(`…or type any other ${question.kind} name from the site.`);
  }
  return lines.join('\n');
}

function matchOption(input: string, options?: Array<{ value: string; label: string }>): string | undefined {
  if (!options) return undefined;
  const trimmed = input.trim();
  const numeric = Number(trimmed);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= options.length) return options[numeric - 1]?.value;
  const normalized = trimmed.toLowerCase();
  return options.find((option) => option.label.toLowerCase() === normalized || option.label.toLowerCase().includes(normalized) || normalized.includes(option.label.toLowerCase()))?.value;
}

export function applyAnswer(state: BuildAnswerState, question: BuildQuestion, input: string): { state: BuildAnswerState; error?: string } {
  const value = input.trim();
  const skipped = /^(skip|none|no|default|n\/a|na)$/i.test(value);
  if (question.optional && skipped) return { state: { ...state, step: state.step + 1 } };

  if (question.kind === 'objective') {
    const matched = matchOption(value, question.options);
    if (!matched) return { state, error: 'I could not match that to a build stat. Reply with the number from the list or a stat name like `movement speed`, `carry weight`, or `bullet resistance`.' };
    return { state: { ...state, objectives: [...state.objectives, matched], step: state.step + 1 } };
  }
  if (question.kind === 'container') {
    const matched = matchOption(value, question.options);
    if (!matched) return { state, error: 'I could not match that container. Reply with the number from the list or a container name like `Hive`, `Barrel`, or `Berloga 6`.' };
    return { state: { ...state, containerId: matched, step: state.step + 1 } };
  }
  if (question.kind === 'budget') return { state: { ...state, budgetValue: value, step: state.step + 1 } };
  if (question.kind === 'quality') return { state: { ...state, quality: value, step: state.step + 1 } };
  if (question.kind === 'level') return { state: { ...state, level: value, step: state.step + 1 } };
  return { state: { ...state, rarity: value, step: state.step + 1 } };
}

function budgetToPrompt(value?: string): string {
  if (!value || /^(none|skip|default)$/i.test(value)) return '';
  const match = value.match(/^(\d+(?:\.\d+)?)(m|million|k|thousand)?$/i);
  return match ? ` under ${match[1]}${match[2] ?? ''}` : ` under ${value}`;
}

export function stateToSearchParams(state: BuildAnswerState): URLSearchParams {
  const params = new URLSearchParams();
  const objectives = state.objectives.slice(0, 3);
  params.set('objectiveCount', String(Math.max(1, objectives.length)));
  objectives.forEach((objective, index) => params.set(`objective${index + 1}`, objective));
  if (state.containerId) params.set('containerId', state.containerId);
  if (state.budgetValue && !/^(none|skip|default)$/i.test(state.budgetValue)) params.set('budgetValue', state.budgetValue);
  return params;
}

export function stateToPrompt(state: BuildAnswerState, containers: Container[]): string {
  const objectiveLabels = state.objectives.map((key) => STAT_BY_KEY.get(key)?.label ?? key).join(' plus ');
  const container = containers.find((entry) => entry.id === state.containerId)?.name ?? 'Hive Container';
  const quality = state.quality && !/^(default|none|skip)$/i.test(state.quality) ? ` ${state.quality} quality` : '';
  const level = state.level && !/^(default|none|skip)$/i.test(state.level) ? ` +${state.level.replace(/^\+/, '')}` : '';
  const rarity = state.rarity && !/^(none|skip|default)$/i.test(state.rarity) ? ` ${state.rarity}` : '';
  return `Generate a ${container} build for ${objectiveLabels}${budgetToPrompt(state.budgetValue)}${quality}${level}${rarity}`;
}

async function fileFetch(root: string, input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  if (url === '/market/latest-NA.json') {
    try {
      const text = await readFile(join(root, 'apps/web/static/market/latest-NA.json'), 'utf8');
      return new Response(text, { status: 200, headers: { 'content-type': 'application/json' } });
    } catch {
      return new Response(null, { status: 404 });
    }
  }
  return new Response(null, { status: 404 });
}

export async function runBuild(state: BuildAnswerState, root = process.cwd(), localBaseUrl = 'http://127.0.0.1:5173'): Promise<BuildResultSummary> {
  const { containers } = await loadCatalogs(root);
  const prompt = stateToPrompt(state, containers);
  const params = stateToSearchParams(state);
  const moduleUrl = pathToFileURL(join(root, 'apps/web/src/routes/+page.server.ts')).href;
  const webServer = await import(moduleUrl) as { _optimizeForPrompt: (prompt: string, fetchFn: typeof fetch, searchParams?: URLSearchParams) => Promise<any> };
  const result = await webServer._optimizeForPrompt(prompt, ((input: RequestInfo | URL) => fileFetch(root, input)) as typeof fetch, params);
  const top = result.alternativeBuilds?.[0] ?? result;
  const artifactLines = (top.artifacts ?? []).map((artifact: any) => `• ${artifact.name} +${artifact.level} Q${artifact.quality} ${artifact.rarity}`).slice(0, 8);
  const statLines = Object.values(top.stats ?? {})
    .flatMap((group: any) => group as Array<{ label: string; value: string }>)
    .slice(0, 18)
    .map((line) => `• ${line.label}: ${line.value}`);
  const localUrl = `${localBaseUrl}/?${params.toString()}`;
  const content = [
    `**UltimateBuild result: ${top.title ?? 'Build'}**`,
    `Prompt: ${prompt}`,
    `Status: ${top.safetyLabel ?? result.safetyLabel ?? 'computed'}`,
    `Cost: ${top.cost ?? result.cost ?? 'Unknown'} / Budget: ${top.budget ?? result.budget ?? 'No target budget'}`,
    `Container: ${top.container?.name ?? 'Unknown'}`,
    '',
    '**Artifacts**',
    ...(artifactLines.length ? artifactLines : ['No legal build found. Try a larger budget, different container, or fewer objectives.']),
    '',
    '**Stats**',
    ...(statLines.length ? statLines : ['No stat output returned.']),
    '',
    `Open locally: ${localUrl}`,
  ].join('\n');
  return { content: content.slice(0, 1900), localUrl };
}

export function rarityLabel(value: string): string {
  return RARITY_LABELS.get(value) ?? value;
}
