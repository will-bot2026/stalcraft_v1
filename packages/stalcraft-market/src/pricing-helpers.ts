export type ArtifactQualityCategoryBracket = {
  /** EXBO auction additional.qlt category index, not an optimizer upgrade level. */
  qlt: number;
  optimizerRarity: string;
  sourceCategory: 'common' | 'uncommon' | 'special' | 'rare' | 'exclusive' | 'legendary' | 'unique';
  minQuality: number;
  maxQuality: number;
};

export const ARTIFACT_QUALITY_CATEGORY_BRACKETS: readonly ArtifactQualityCategoryBracket[] = [
  { qlt: 0, optimizerRarity: 'rarity.ordinary', sourceCategory: 'common', minQuality: 85, maxQuality: 100 },
  { qlt: 1, optimizerRarity: 'rarity.unordinary', sourceCategory: 'uncommon', minQuality: 100, maxQuality: 115 },
  { qlt: 2, optimizerRarity: 'rarity.special', sourceCategory: 'special', minQuality: 115, maxQuality: 130 },
  { qlt: 3, optimizerRarity: 'rarity.rare', sourceCategory: 'rare', minQuality: 130, maxQuality: 145 },
  { qlt: 4, optimizerRarity: 'rarity.exclusive', sourceCategory: 'exclusive', minQuality: 145, maxQuality: 160 },
  { qlt: 5, optimizerRarity: 'rarity.legendary', sourceCategory: 'legendary', minQuality: 160, maxQuality: 175 },
  { qlt: 6, optimizerRarity: 'rarity.unique', sourceCategory: 'unique', minQuality: 175, maxQuality: 190 },
];

export function artifactQualityCategoryBracketFromQlt(qlt: number): ArtifactQualityCategoryBracket | undefined {
  return ARTIFACT_QUALITY_CATEGORY_BRACKETS.find((bracket) => bracket.qlt === qlt);
}

export function artifactQualityCategoryBracketFromRarity(rarity: string): ArtifactQualityCategoryBracket | undefined {
  return ARTIFACT_QUALITY_CATEGORY_BRACKETS.find((bracket) => bracket.optimizerRarity === rarity);
}

export function optimizerQualityFromApiQltAndPtn(qlt: number, ptn = 0): number | undefined {
  const bracket = artifactQualityCategoryBracketFromQlt(qlt);
  if (!bracket || !Number.isInteger(ptn) || ptn < 0 || ptn > 15) return undefined;
  const quality = bracket.minQuality + ptn;
  return quality >= bracket.minQuality && quality <= bracket.maxQuality ? quality : undefined;
}
