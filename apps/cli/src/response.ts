import type { DerivedStats, SummedStat } from '../../../packages/stalcraft-core/src/index.js';

export type SerializedStat = {
  key: string;
  name: string;
  value: number;
  isPercentage: boolean;
  sources: { origin: string; value: number }[];
};

export function serializeStatsMap(stats: Map<string, SummedStat>): SerializedStat[] {
  return [...stats.values()]
    .map((stat) => ({
      key: stat.key,
      name: stat.name,
      value: stat.value,
      isPercentage: stat.isPercentage,
      sources: stat.sources,
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

export function serializeDerivedStats(stats: DerivedStats): DerivedStats {
  return stats;
}
