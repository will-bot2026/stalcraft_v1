export type ArtifactRarity = 'rarity.unordinary' | 'rarity.special' | 'rarity.rare' | 'rarity.exclusive' | 'rarity.legendary' | 'rarity.unique';

export type ParsedOptimizationRequest = {
  containerId: string;
  objectives: { statKey: string; weight: number; direction: 'maximize' | 'minimize' }[];
  objectiveMetadata?: {
    formula: string;
    components: { statKey: string; weight: number; label: string }[];
  };
  constraints: {
    maxBudget?: number;
    minBudget?: number;
    rarity?: { mode: 'exact' | 'at_or_below' | 'at_or_above'; rarity: ArtifactRarity };
    artifactConstraints?: { artifactId: string; mode: 'include' | 'exclude' }[];
  };
  artifactAssumption: { level: number; quality: number; rarity?: ArtifactRarity };
  budget: { region: 'NA'; priceMode: 'history_median'; includeContainerCost: false };
};

export type ArtifactStatCategory =
  | 'mobility'
  | 'survivability'
  | 'protection'
  | 'healing'
  | 'reaction'
  | 'weaponHandling'
  | 'accumulation'
  | 'specialMechanic';

export type ArtifactResultPanelGroup =
  | 'mobility'
  | 'survivability'
  | 'healing'
  | 'reactions'
  | 'weaponHandling'
  | 'environmental'
  | 'special';

export type ArtifactStatCatalogEntry = {
  key: string;
  label: string;
  aliases: string[];
  category: ArtifactStatCategory;
  resultPanelGroup: ArtifactResultPanelGroup;
  defaultObjectiveDirection: 'maximize' | 'minimize';
  displayUnit: 'flat' | 'percent' | 'seconds';
  sourceTruthStatus: 'verified-normal' | 'wiki-verified' | 'needs-exposure-verification' | 'needs-wiki-verification';
  showInObjectiveOptions: boolean;
  specialMechanic: boolean;
};

function stat(entry: ArtifactStatCatalogEntry): ArtifactStatCatalogEntry {
  return entry;
}

const PREFIX = 'stalker.artefact_properties.factor.';
const MOVEMENT_SPEED_KEY = `${PREFIX}speed_modifier`;
const RUNNING_SPEED_KEY = `${PREFIX}sprint_speed_modifier`;

export const ARTIFACT_STAT_CATALOG: ArtifactStatCatalogEntry[] = [
  stat({ key: "stalker.artefact_properties.factor.artefakt_heal", label: "Periodic healing", aliases: ["periodic healing", "artifact heal", "artefact heal"], category: "healing", resultPanelGroup: "healing", defaultObjectiveDirection: "maximize", displayUnit: "percent", sourceTruthStatus: "verified-normal", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.biological_accumulation", label: "Biological infection", aliases: ["bio", "biological", "biological infection", "bio infection", "biological accumulation"], category: "accumulation", resultPanelGroup: "environmental", defaultObjectiveDirection: "minimize", displayUnit: "flat", sourceTruthStatus: "verified-normal", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.biological_protection", label: "Bioinfection protection", aliases: ["bio protection", "biological protection", "bioinfection protection"], category: "protection", resultPanelGroup: "survivability", defaultObjectiveDirection: "maximize", displayUnit: "flat", sourceTruthStatus: "needs-exposure-verification", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.bleeding_accumulation", label: "Bleeding", aliases: ["bleeding", "bleed", "bleeding accumulation"], category: "accumulation", resultPanelGroup: "environmental", defaultObjectiveDirection: "minimize", displayUnit: "flat", sourceTruthStatus: "wiki-verified", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.bleeding_protection", label: "Bleeding protection", aliases: ["bleeding protection", "bleed protection"], category: "protection", resultPanelGroup: "survivability", defaultObjectiveDirection: "maximize", displayUnit: "percent", sourceTruthStatus: "needs-exposure-verification", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.bullet_dmg_factor", label: "Bullet resistance", aliases: ["bullet resistance", "bullet protection", "bullet damage resistance", "bullet"], category: "protection", resultPanelGroup: "survivability", defaultObjectiveDirection: "maximize", displayUnit: "flat", sourceTruthStatus: "verified-normal", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.burn_dmg_factor", label: "Resistance to fire", aliases: ["fire resistance", "fire protection", "burn resistance", "resistance to fire"], category: "protection", resultPanelGroup: "survivability", defaultObjectiveDirection: "maximize", displayUnit: "flat", sourceTruthStatus: "needs-exposure-verification", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.chemical_burn_dmg_factor", label: "Resistance to chemicals", aliases: ["chemical resistance", "chemical protection", "resistance to chemicals", "chem protection"], category: "protection", resultPanelGroup: "survivability", defaultObjectiveDirection: "maximize", displayUnit: "flat", sourceTruthStatus: "needs-exposure-verification", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.combustion_accumulation", label: "Burning", aliases: ["burning", "combustion", "burn accumulation"], category: "accumulation", resultPanelGroup: "environmental", defaultObjectiveDirection: "minimize", displayUnit: "flat", sourceTruthStatus: "wiki-verified", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.electra_dmg_factor", label: "Resistance to electricity", aliases: ["electricity resistance", "electric resistance", "electro protection", "resistance to electricity"], category: "protection", resultPanelGroup: "survivability", defaultObjectiveDirection: "maximize", displayUnit: "flat", sourceTruthStatus: "needs-exposure-verification", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.explosion_dmg_factor", label: "Explosion protection", aliases: ["explosion protection", "explosion resistance", "blast protection", "explosion", "blast"], category: "protection", resultPanelGroup: "survivability", defaultObjectiveDirection: "maximize", displayUnit: "flat", sourceTruthStatus: "verified-normal", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.frost_accumulation", label: "Frost", aliases: ["frost", "cold", "cold accumulation", "frost accumulation"], category: "accumulation", resultPanelGroup: "environmental", defaultObjectiveDirection: "minimize", displayUnit: "flat", sourceTruthStatus: "verified-normal", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.heal_efficiency", label: "Healing effectiveness", aliases: ["healing", "healing effectiveness", "heal efficiency", "healing efficiency"], category: "healing", resultPanelGroup: "healing", defaultObjectiveDirection: "maximize", displayUnit: "percent", sourceTruthStatus: "verified-normal", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.health_bonus", label: "Vitality", aliases: ["vitality", "health", "health bonus", "survivability", "survival", "effective health", "tankiness"], category: "survivability", resultPanelGroup: "survivability", defaultObjectiveDirection: "maximize", displayUnit: "percent", sourceTruthStatus: "verified-normal", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.max_weight_bonus", label: "Carry weight", aliases: ["carry weight", "max weight", "maximum weight", "weight bonus"], category: "mobility", resultPanelGroup: "mobility", defaultObjectiveDirection: "maximize", displayUnit: "flat", sourceTruthStatus: "verified-normal", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.psycho_accumulation", label: "Psy-emissions", aliases: ["psy", "psycho", "psy emissions", "psy-emissions", "psycho accumulation", "psy accumulation"], category: "accumulation", resultPanelGroup: "environmental", defaultObjectiveDirection: "minimize", displayUnit: "flat", sourceTruthStatus: "verified-normal", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.psycho_protection", label: "Psy-Emission protection", aliases: ["psy protection", "psycho protection", "psy emission protection", "psy-emission protection"], category: "protection", resultPanelGroup: "survivability", defaultObjectiveDirection: "maximize", displayUnit: "flat", sourceTruthStatus: "needs-exposure-verification", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.radiation_accumulation", label: "Radiation", aliases: ["rad", "rads", "radiation", "radiation accumulation"], category: "accumulation", resultPanelGroup: "environmental", defaultObjectiveDirection: "minimize", displayUnit: "flat", sourceTruthStatus: "verified-normal", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.radiation_protection", label: "Radiation protection", aliases: ["rad protection", "radiation protection"], category: "protection", resultPanelGroup: "survivability", defaultObjectiveDirection: "maximize", displayUnit: "flat", sourceTruthStatus: "needs-exposure-verification", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.reaction_to_burn", label: "Reaction to burns", aliases: ["reaction to burns", "reaction to burn", "burn reaction"], category: "reaction", resultPanelGroup: "reactions", defaultObjectiveDirection: "maximize", displayUnit: "percent", sourceTruthStatus: "needs-exposure-verification", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.reaction_to_chemical_burn", label: "Reaction to chemical burns", aliases: ["reaction to chemical burns", "chemical burn reaction", "chem burn reaction"], category: "reaction", resultPanelGroup: "reactions", defaultObjectiveDirection: "maximize", displayUnit: "percent", sourceTruthStatus: "needs-exposure-verification", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.reaction_to_electroshock", label: "Reaction to electricity", aliases: ["reaction to electricity", "reaction to electroshock", "electricity reaction"], category: "reaction", resultPanelGroup: "reactions", defaultObjectiveDirection: "maximize", displayUnit: "percent", sourceTruthStatus: "needs-exposure-verification", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.reaction_to_tear", label: "Reaction to laceration", aliases: ["reaction to laceration", "reaction to tear", "laceration reaction"], category: "reaction", resultPanelGroup: "reactions", defaultObjectiveDirection: "maximize", displayUnit: "percent", sourceTruthStatus: "needs-exposure-verification", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.recoil_bonus", label: "Recoil", aliases: ["recoil", "recoil bonus"], category: "weaponHandling", resultPanelGroup: "weaponHandling", defaultObjectiveDirection: "minimize", displayUnit: "percent", sourceTruthStatus: "wiki-verified", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.regeneration_bonus", label: "Health regeneration", aliases: ["health regeneration", "regeneration", "regen"], category: "healing", resultPanelGroup: "healing", defaultObjectiveDirection: "maximize", displayUnit: "percent", sourceTruthStatus: "needs-exposure-verification", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.speed_modifier", label: "Movement speed", aliases: ["movement speed", "speed"], category: "mobility", resultPanelGroup: "mobility", defaultObjectiveDirection: "maximize", displayUnit: "percent", sourceTruthStatus: "verified-normal", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.sprint_speed_modifier", label: "Running speed", aliases: ["running speed", "sprint speed", "sprint"], category: "mobility", resultPanelGroup: "mobility", defaultObjectiveDirection: "maximize", displayUnit: "percent", sourceTruthStatus: "verified-normal", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.stamina_bonus", label: "Stamina", aliases: ["stamina", "stamina bonus"], category: "mobility", resultPanelGroup: "mobility", defaultObjectiveDirection: "maximize", displayUnit: "percent", sourceTruthStatus: "verified-normal", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.stamina_regeneration_bonus", label: "Stamina regeneration", aliases: ["stamina regeneration", "stamina regen"], category: "mobility", resultPanelGroup: "mobility", defaultObjectiveDirection: "maximize", displayUnit: "percent", sourceTruthStatus: "verified-normal", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.stopping_protection", label: "Stability", aliases: ["stability", "stopping protection"], category: "protection", resultPanelGroup: "survivability", defaultObjectiveDirection: "maximize", displayUnit: "percent", sourceTruthStatus: "needs-exposure-verification", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.tear_dmg_factor", label: "Laceration protection", aliases: ["laceration protection", "tear protection", "tear resistance", "laceration", "tear"], category: "protection", resultPanelGroup: "survivability", defaultObjectiveDirection: "maximize", displayUnit: "flat", sourceTruthStatus: "verified-normal", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.thermal_accumulation", label: "Temperature", aliases: ["temperature", "thermal", "thermal accumulation", "temp"], category: "accumulation", resultPanelGroup: "environmental", defaultObjectiveDirection: "minimize", displayUnit: "flat", sourceTruthStatus: "verified-normal", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.thermal_protection", label: "Thermal protection", aliases: ["thermal protection", "temperature protection", "temp protection"], category: "protection", resultPanelGroup: "survivability", defaultObjectiveDirection: "maximize", displayUnit: "flat", sourceTruthStatus: "needs-exposure-verification", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.artefact_properties.factor.wiggle_bonus", label: "Sway", aliases: ["sway", "wiggle", "weapon sway"], category: "weaponHandling", resultPanelGroup: "weaponHandling", defaultObjectiveDirection: "minimize", displayUnit: "percent", sourceTruthStatus: "wiki-verified", showInObjectiveOptions: true, specialMechanic: false }),
  stat({ key: "stalker.tooltip.item.lifesaver_sniper.info.trigger_damage", label: "Triggers when", aliases: ["triggers when", "trigger damage", "activation threshold"], category: "specialMechanic", resultPanelGroup: "special", defaultObjectiveDirection: "minimize", displayUnit: "flat", sourceTruthStatus: "wiki-verified", showInObjectiveOptions: false, specialMechanic: true }),
  stat({ key: "stalker.tooltip.item.lifesaver_sniper.info.blocking_damage", label: "Reduces damage by", aliases: ["reduces damage by", "damage reduction", "blocking damage"], category: "specialMechanic", resultPanelGroup: "special", defaultObjectiveDirection: "maximize", displayUnit: "flat", sourceTruthStatus: "wiki-verified", showInObjectiveOptions: false, specialMechanic: true }),
  stat({ key: "stalker.tooltip.item.lifesaver.info.recharge", label: "Reload", aliases: ["reload", "recharge"], category: "specialMechanic", resultPanelGroup: "special", defaultObjectiveDirection: "minimize", displayUnit: "seconds", sourceTruthStatus: "wiki-verified", showInObjectiveOptions: false, specialMechanic: true }),
  stat({ key: "stalker.tooltip.item.lifesaver.info.cost", label: "Charge required to activate", aliases: ["charge required to activate", "activation charge", "charge cost"], category: "specialMechanic", resultPanelGroup: "special", defaultObjectiveDirection: "minimize", displayUnit: "percent", sourceTruthStatus: "wiki-verified", showInObjectiveOptions: false, specialMechanic: true }),
];

const ARTIFACT_STAT_CATALOG_BY_KEY = new Map(ARTIFACT_STAT_CATALOG.map((entry) => [entry.key, entry]));

export function objectiveDirectionForStatKey(statKey: string): 'maximize' | 'minimize' {
  return ARTIFACT_STAT_CATALOG_BY_KEY.get(statKey)?.defaultObjectiveDirection ?? 'maximize';
}

export function objectiveOptionsFromCatalog(): Array<{ value: string; label: string }> {
  return ARTIFACT_STAT_CATALOG
    .filter((entry) => entry.showInObjectiveOptions && !entry.specialMechanic)
    .map((entry) => ({ value: entry.key, label: entry.label }));
}

const RARITY_ALIASES: Record<string, ArtifactRarity> = {
  unusual: 'rarity.unordinary',
  unordinary: 'rarity.unordinary',
  special: 'rarity.special',
  rare: 'rarity.rare',
  exclusive: 'rarity.exclusive',
  legendary: 'rarity.legendary',
  unique: 'rarity.unique',
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function aliasPattern(alias: string): RegExp {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(alias).replaceAll('\\ ', '\\s+')}(?=$|[^a-z0-9])`, 'i');
}

export function resolveStatAliases(prompt: string): string[] {
  const matches: { key: string; index: number }[] = [];
  for (const entry of ARTIFACT_STAT_CATALOG) {
    const positions = [entry.label, ...entry.aliases]
      .map((term) => prompt.search(aliasPattern(term)))
      .filter((index) => index >= 0);
    if (positions.length > 0) matches.push({ key: entry.key, index: Math.min(...positions) });
  }

  const keys: string[] = [];
  const seen = new Set<string>();
  for (const match of matches.sort((a, b) => a.index - b.index)) {
    if (!seen.has(match.key)) {
      keys.push(match.key);
      seen.add(match.key);
    }
  }
  return keys;
}

function resolveMovementComposite(prompt: string): ParsedOptimizationRequest['objectiveMetadata'] | undefined {
  if (/\b(running|sprint)\s+speed\b|\bsprint\b/i.test(prompt)) return undefined;
  if (/\bmovement\s+speed\b/i.test(prompt)) return undefined;
  if (!/\bfast(?:est)?\s+movement\b|\bmovement\b|\bfast\s+build\b|\bmobility\b/i.test(prompt)) return undefined;
  return {
    formula: 'Movement speed + Running speed',
    components: [
      { statKey: MOVEMENT_SPEED_KEY, weight: 1, label: 'Movement speed' },
      { statKey: RUNNING_SPEED_KEY, weight: 1, label: 'Running speed' },
    ],
  };
}

const CONTAINER_ALIASES: Array<{ id: string; patterns: RegExp[] }> = [
  { id: 'p92d', patterns: [/\bhive\b/i] },
  { id: '512o', patterns: [/\barcticsafe\b/i, /\barctic\s*safe\b/i, /\bzivcas\s*arcticsafe\s*-?\s*6\b/i] },
  { id: 'l362', patterns: [/\bcraw\s*-?\s*6\b/i] },
  { id: 'j34l', patterns: [/\bfreezer\b/i] },
  { id: 'w42z', patterns: [/\boverton\b/i] },
  { id: 'rgoz', patterns: [/\bbarrel\b/i] },
  { id: '0nok', patterns: [/\bsheaf\b/i] },
  { id: 'zj1k', patterns: [/\bkega\b/i] },
  { id: 'n3v9', patterns: [/\bapiary\b/i] },
  { id: 'yq90', patterns: [/\bchitin\b/i] },
  { id: 'zq3n', patterns: [/\bsecret\s+valley\s+35\b/i] },
  { id: 'g35n', patterns: [/\bberloga\s*(?:—|-)?\s*6\b/i] },
  { id: 'q1m4', patterns: [/\bberloga\s*-?\s*6u\b/i] },
];

function parseContainerId(prompt: string): string {
  for (const container of CONTAINER_ALIASES) {
    if (container.patterns.some((pattern) => pattern.test(prompt))) return container.id;
  }
  return 'p92d';
}

function parsePriceAmount(value: string, unit: string | undefined): number {
  const numericValue = Number(value);
  const normalizedUnit = unit?.toLowerCase();
  if (normalizedUnit === 'm' || normalizedUnit === 'million') return Math.floor(numericValue * 1_000_000);
  if (normalizedUnit === 'k' || normalizedUnit === 'thousand') return Math.floor(numericValue * 1_000);
  return Math.floor(numericValue);
}

function parseBudget(prompt: string): { maxBudget?: number; minBudget?: number } {
  const amount = String.raw`(\d+(?:\.\d+)?)\s*(m|million|k|thousand)?`;
  const upper = prompt.match(new RegExp(String.raw`(?:under|below|less\s+than|max(?:imum)?|budget(?:\s+of)?|within)\s+${amount}`, 'i'));
  const lower = prompt.match(new RegExp(String.raw`(?:over|above|at\s+least|minimum|min|more\s+than)\s+${amount}`, 'i'));
  return {
    ...(upper ? { maxBudget: parsePriceAmount(upper[1]!, upper[2]) } : {}),
    ...(lower ? { minBudget: parsePriceAmount(lower[1]!, lower[2]) } : {}),
  };
}

function parseQuality(prompt: string): number {
  const quality = prompt.match(/(\d{2,3}(?:\.\d+)?)\s*(?:quality|qual|q)(?=$|\s|,)/i) ?? prompt.match(/(?:quality|qual|q)\s*(\d{2,3}(?:\.\d+)?)/i);
  if (quality) return Math.max(0, Math.min(190, Number(quality[1])));
  if (/\bperfect\b|\bmaxed\b|\bmax(?:imum)?\s+(?:quality|qual|q)\b|\b(?:quality|qual|q)\s+max(?:imum)?\b/i.test(prompt)) return 175;
  return 100;
}

function parseLevel(prompt: string): number {
  const plus = prompt.match(/(?:^|\s)\+(\d{1,2})(?=$|\s|,)/i);
  if (plus) return Math.max(0, Math.min(15, Number(plus[1])));
  const level = prompt.match(/(?:level|lvl)\s*(\d{1,2})/i);
  if (level) return Math.max(0, Math.min(15, Number(level[1])));
  return 0;
}

function parseRarity(prompt: string): { constraint?: ParsedOptimizationRequest['constraints']['rarity']; rarity?: ArtifactRarity } {
  for (const [word, rarity] of Object.entries(RARITY_ALIASES)) {
    const exactWord = new RegExp(`(^|[^a-z])${word}(?=$|[^a-z])`, 'i');
    if (!exactWord.test(prompt)) continue;
    const windowPattern = new RegExp(`${word}.{0,20}(or lower|and below|or below|or worse)|(?:up to|at most|max(?:imum)?).{0,20}${word}`, 'i');
    if (windowPattern.test(prompt)) return { rarity, constraint: { mode: 'at_or_below', rarity } };
    const abovePattern = new RegExp(`${word}.{0,20}(or higher|and above|or above|or better)|(?:at least|min(?:imum)?).{0,20}${word}`, 'i');
    if (abovePattern.test(prompt)) return { rarity, constraint: { mode: 'at_or_above', rarity } };
    return { rarity, constraint: { mode: 'exact', rarity } };
  }
  return {};
}

export function parseOptimizationPrompt(prompt: string): ParsedOptimizationRequest {
  const movementComposite = resolveMovementComposite(prompt);
  const aliasKeys = resolveStatAliases(prompt).filter((statKey) => {
    if (statKey !== MOVEMENT_SPEED_KEY) return true;
    if (/\bmovement\s+speed\b/i.test(prompt)) return true;
    return !/\b(running|sprint)\s+speed\b|\bsprint\b/i.test(prompt);
  });
  const objectiveKeys = movementComposite ? [...movementComposite.components.map((component) => component.statKey), ...aliasKeys] : aliasKeys;
  const seenObjectives = new Set<string>();
  const objectives = objectiveKeys
    .filter((statKey) => {
      if (seenObjectives.has(statKey)) return false;
      seenObjectives.add(statKey);
      return true;
    })
    .map((statKey) => ({ statKey, weight: 1, direction: objectiveDirectionForStatKey(statKey) }));
  const rarity = parseRarity(prompt);
  const constraints: ParsedOptimizationRequest['constraints'] = parseBudget(prompt);
  if (rarity.constraint) constraints.rarity = rarity.constraint;

  return {
    containerId: parseContainerId(prompt),
    objectives,
    ...(movementComposite ? { objectiveMetadata: movementComposite } : {}),
    constraints,
    artifactAssumption: {
      level: parseLevel(prompt),
      quality: parseQuality(prompt),
      ...(rarity.rarity ? { rarity: rarity.rarity } : {}),
    },
    budget: { region: 'NA', priceMode: 'history_median', includeContainerCost: false },
  };
}
