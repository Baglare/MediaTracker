import type { ScoredRecommendationCandidate } from "./types";
import { compareScoredCandidates } from "./scorer";

function franchiseKey(item: ScoredRecommendationCandidate): string | null {
  const raw = item.candidate.globalSearch?.raw;
  if (!raw || typeof raw !== "object") return null;
  const value = (raw as { seriesGroupId?: unknown }).seriesGroupId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function rerankForDiversity(input: readonly ScoredRecommendationCandidate[], limit = 5): ScoredRecommendationCandidate[] {
  const remaining = [...input];
  const selected: ScoredRecommendationCandidate[] = [];
  const providerCounts = new Map<string, number>();
  const franchises = new Set<string>();
  while (remaining.length > 0 && selected.length < limit) {
    remaining.sort((a, b) => {
      const penalty = (item: ScoredRecommendationCandidate) => {
        const franchise = franchiseKey(item);
        return (providerCounts.get(item.snapshot.candidateIdentity.primaryProvider) ?? 0) * 0.04 + (franchise && franchises.has(franchise) ? 0.2 : 0);
      };
      const aAdjusted = a.scoreBreakdown.requestFit + a.scoreBreakdown.personalFit * 0.25 + a.scoreBreakdown.evidenceConfidence * 0.2 - penalty(a);
      const bAdjusted = b.scoreBreakdown.requestFit + b.scoreBreakdown.personalFit * 0.25 + b.scoreBreakdown.evidenceConfidence * 0.2 - penalty(b);
      return Math.abs(bAdjusted - aAdjusted) > 1e-9 ? bAdjusted - aAdjusted : compareScoredCandidates(a, b);
    });
    const chosen = remaining.shift() as ScoredRecommendationCandidate;
    const provider = chosen.snapshot.candidateIdentity.primaryProvider;
    const franchise = franchiseKey(chosen);
    const penalty = (providerCounts.get(provider) ?? 0) * 0.04 + (franchise && franchises.has(franchise) ? 0.2 : 0);
    selected.push({ ...chosen, scoreBreakdown: { ...chosen.scoreBreakdown, diversityContribution: Math.max(0, 1 - penalty) } });
    providerCounts.set(provider, (providerCounts.get(provider) ?? 0) + 1);
    if (franchise) franchises.add(franchise);
  }
  return selected;
}
