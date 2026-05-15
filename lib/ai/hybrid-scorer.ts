import type {
  AiCandidate,
  CandidateFeatureVector,
  HybridScoreBreakdown,
} from "@/lib/ai/types";

export interface HybridScoringResult {
  candidates: AiCandidate[];
  stats: {
    count: number;
    averageFinalScore: number;
    maxFinalScore: number;
    minFinalScore: number;
    contentAdjusted: number;
    behaviorAdjusted: number;
    popularityAdjusted: number;
  };
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildBreakdown(vector: CandidateFeatureVector): HybridScoreBreakdown {
  const finalScore = roundScore(
    vector.ruleScore +
      vector.feedbackScore +
      vector.contentScore +
      vector.behaviorScore +
      vector.popularityScore
  );

  return {
    ruleScore: vector.ruleScore,
    feedbackScore: vector.feedbackScore,
    contentScore: vector.contentScore,
    behaviorScore: vector.behaviorScore,
    popularityScore: vector.popularityScore,
    finalScore,
    reasons: [
      ...vector.contentReasons,
      ...vector.behaviorReasons,
      ...vector.popularityReasons,
    ].slice(0, 4),
  };
}

export function applyHybridScoring(args: {
  candidates: AiCandidate[];
  features: CandidateFeatureVector[];
}): HybridScoringResult {
  const featureByKey = new Map(args.features.map((feature) => [feature.candidateKey, feature]));
  let contentAdjusted = 0;
  let behaviorAdjusted = 0;
  let popularityAdjusted = 0;

  const candidates = args.candidates.map((candidate) => {
    const key = `${candidate.source}:${candidate.externalId}`;
    const feature = featureByKey.get(key);
    if (!feature) return candidate;
    const breakdown = buildBreakdown(feature);
    if (feature.contentScore !== 0) contentAdjusted++;
    if (feature.behaviorScore !== 0) behaviorAdjusted++;
    if (feature.popularityScore !== 0) popularityAdjusted++;

    const scoreReasons = Array.from(
      new Set([...(candidate.scoreReasons || []), ...breakdown.reasons])
    ).slice(0, 6);

    return {
      ...candidate,
      score: breakdown.finalScore,
      finalScore: breakdown.finalScore,
      hybridScoreBreakdown: breakdown,
      scoreReasons,
    };
  }).sort((a, b) => (b.finalScore ?? b.score ?? 0) - (a.finalScore ?? a.score ?? 0));

  const finalScores = candidates.map((candidate) => candidate.finalScore ?? candidate.score ?? 0);
  const total = finalScores.reduce((sum, score) => sum + score, 0);

  return {
    candidates,
    stats: {
      count: candidates.length,
      averageFinalScore: finalScores.length > 0 ? roundScore(total / finalScores.length) : 0,
      maxFinalScore: finalScores.length > 0 ? Math.max(...finalScores) : 0,
      minFinalScore: finalScores.length > 0 ? Math.min(...finalScores) : 0,
      contentAdjusted,
      behaviorAdjusted,
      popularityAdjusted,
    },
  };
}
