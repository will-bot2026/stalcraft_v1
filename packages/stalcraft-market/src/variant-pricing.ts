export type PriceVariantScope = 'artifact-id-only' | 'quality-level-aware' | 'quality-aware' | 'quality-additional-aware' | 'rarity-aware' | 'rarity-level-aware';
export type PricePrecision = 'artifact_exact' | 'variant_exact' | 'rarity_bracket' | 'unknown';

export type ArtifactPriceVariant = {
  artifactId: string;
  quality: number;
  level: number;
  rarity?: string;
};

export function priceForStrictBudget(price: number | undefined): number {
  return Number.isFinite(price) && price! > 0 ? price! : Number.POSITIVE_INFINITY;
}

export function artifactPriceKey(artifactId: string): string {
  return artifactId;
}

export function variantPriceKey(variant: ArtifactPriceVariant): string {
  const rarity = variant.rarity ? `|${variant.rarity}` : '';
  return `${variant.artifactId}|q${variant.quality}|l${variant.level}${rarity}`;
}

export function variantPriceKeyWithoutRarity(variant: ArtifactPriceVariant): string {
  return `${variant.artifactId}|q${variant.quality}|l${variant.level}`;
}

export function rarityPriceKey(variant: Pick<ArtifactPriceVariant, 'artifactId' | 'rarity'>): string | undefined {
  return variant.rarity ? `${variant.artifactId}|${variant.rarity}` : undefined;
}

export function isOptimizerVariantPriceKey(variantKey: string): boolean {
  return /^q\d+(\.\d+)?\|l\d+(\.\d+)?(\|[^|]+)?$/.test(variantKey);
}

export function isRarityBracketPriceKey(variantKey: string): boolean {
  return /^rarity\.[a-z_]+$/.test(variantKey);
}

export function isQltBracketPriceKey(variantKey: string): boolean {
  return /^qlt\.\d+(\|level\.\d+)?$/.test(variantKey);
}

export function isLevelAwareBracketPriceKey(variantKey: string): boolean {
  return /\|level\.\d+$/.test(variantKey);
}

export function qltLevelPriceKey(artifactId: string, qlt: number, level: number): string {
  return `${artifactId}|qlt.${qlt}|level.${level}`;
}

function qltFromQuality(quality: number): number | undefined {
  if (!Number.isFinite(quality)) return undefined;
  if (quality < 100) return 0;
  if (quality <= 115) return 1;
  if (quality <= 130) return 2;
  if (quality <= 145) return 3;
  if (quality <= 160) return 4;
  if (quality <= 175) return 5;
  if (quality <= 190) return 6;
  return undefined;
}

function qltFromRarity(rarity: string | undefined): number | undefined {
  switch (rarity) {
    case 'rarity.ordinary': return 0;
    case 'rarity.unordinary': return 1;
    case 'rarity.special': return 2;
    case 'rarity.rare': return 3;
    case 'rarity.exclusive': return 4;
    case 'rarity.legendary': return 5;
    case 'rarity.unique': return 6;
    default: return undefined;
  }
}

function qltPtnFromQuality(quality: number): { qlt: number; ptn: number } | undefined {
  const qlt = qltFromQuality(quality);
  if (qlt === undefined) return undefined;
  const bracketMin = qlt === 0 ? 85 : 85 + qlt * 15;
  const ptn = Math.round(quality - bracketMin);
  if (!Number.isInteger(ptn) || ptn < 0 || ptn > 15) return undefined;
  return { qlt, ptn };
}


export function resolveVariantPrice(
  variant: ArtifactPriceVariant,
  prices: Map<string, number> | undefined,
  options: { strictBudget?: boolean } = {},
): { price: number; priceKey?: string; pricingPrecision: PricePrecision; estimatedFromKey?: string } {
  const strictBudget = options.strictBudget ?? true;
  const exactKeys = [variantPriceKey(variant), variantPriceKeyWithoutRarity(variant)];
  for (const key of exactKeys) {
    const exact = priceForStrictBudget(prices?.get(key));
    if (Number.isFinite(exact)) return { price: exact, priceKey: key, pricingPrecision: 'variant_exact' };
  }

  const qlt = qltFromRarity(variant.rarity) ?? qltFromQuality(variant.quality);
  if (qlt !== undefined) {
    if (variant.level > 0) {
      const levelKey = qltLevelPriceKey(variant.artifactId, qlt, variant.level);
      const levelPrice = priceForStrictBudget(prices?.get(levelKey));
      if (Number.isFinite(levelPrice)) return { price: levelPrice, priceKey: levelKey, pricingPrecision: 'rarity_bracket' };
      return {
        price: strictBudget ? Number.POSITIVE_INFINITY : 0,
        priceKey: levelKey,
        pricingPrecision: 'unknown',
      };
    }

    const qltKey = `${variant.artifactId}|qlt.${qlt}`;
    const qltPrice = priceForStrictBudget(prices?.get(qltKey));
    if (Number.isFinite(qltPrice)) return { price: qltPrice, priceKey: qltKey, pricingPrecision: 'rarity_bracket' };
  }

  if (variant.level > 0) {
    return {
      price: strictBudget ? Number.POSITIVE_INFINITY : 0,
      priceKey: artifactPriceKey(variant.artifactId),
      pricingPrecision: 'unknown',
    };
  }

  const rarityKey = rarityPriceKey(variant);
  const rarityPrice = priceForStrictBudget(rarityKey ? prices?.get(rarityKey) : undefined);
  if (Number.isFinite(rarityPrice)) return { price: rarityPrice, priceKey: rarityKey, pricingPrecision: 'rarity_bracket' };

  const artifactKey = artifactPriceKey(variant.artifactId);
  const artifactPrice = priceForStrictBudget(prices?.get(artifactKey));
  if (Number.isFinite(artifactPrice) && variant.quality === 100 && variant.level === 0) {
    return { price: artifactPrice, priceKey: artifactKey, pricingPrecision: 'artifact_exact' };
  }

  return {
    price: strictBudget ? Number.POSITIVE_INFINITY : 0,
    priceKey: artifactKey,
    pricingPrecision: 'unknown',
  };
}
