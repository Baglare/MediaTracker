import type {
  AiCandidate,
  RecommendationFeedbackAction,
  RecommendationFeedbackEvent,
} from "@/lib/ai/types";
import type { MediaType } from "@/lib/types";

export interface FeedbackAwareScoringResult {
  candidates: AiCandidate[];
  rejected: { title: string; reason: string }[];
  stats: {
    events: number;
    adjusted: number;
    rejectedDismissedExact: number;
    dismissedPenalties: number;
    positiveBoosts: number;
    averageAdjustment: number;
    maxBoost: number;
    maxPenalty: number;
  };
}

const POSITIVE_ACTIONS: ReadonlySet<RecommendationFeedbackAction> = new Set([
  "added",
  "similar_requested",
  "open_discover",
]);

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function compactTitle(title: string): string {
  return normalizeTitle(title).replace(/\s+/g, "");
}

function titleSimilarity(a: string, b: string): "exact" | "close" | "none" {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return "none";
  if (na === nb) return "exact";
  const ca = compactTitle(a);
  const cb = compactTitle(b);
  if (ca.length >= 5 && cb.length >= 5 && (ca.includes(cb) || cb.includes(ca))) return "close";
  return "none";
}

function externalMatch(candidate: AiCandidate, event: RecommendationFeedbackEvent): boolean {
  return Boolean(
    event.externalSource &&
      event.externalId &&
      candidate.source === event.externalSource &&
      candidate.externalId === event.externalId
  );
}

function typeMatch(candidateType: MediaType, eventType: MediaType): boolean {
  return candidateType === eventType;
}

function relevantEvents(events: RecommendationFeedbackEvent[]): RecommendationFeedbackEvent[] {
  return events
    .filter((event) => (
      event &&
      typeof event.title === "string" &&
      typeof event.mediaType === "string" &&
      (event.action === "dismissed" || POSITIVE_ACTIONS.has(event.action))
    ))
    .slice(-300);
}

export function applyFeedbackAwareScoring(args: {
  candidates: AiCandidate[];
  feedbackEvents: RecommendationFeedbackEvent[];
}): FeedbackAwareScoringResult {
  const events = relevantEvents(args.feedbackEvents);
  const rejected: { title: string; reason: string }[] = [];
  let adjusted = 0;
  let rejectedDismissedExact = 0;
  let dismissedPenalties = 0;
  let positiveBoosts = 0;
  let adjustmentSum = 0;
  let maxBoost = 0;
  let maxPenalty = 0;

  const candidates: AiCandidate[] = [];

  for (const candidate of args.candidates) {
    let feedbackScore = 0;
    const feedbackReasons: string[] = [];
    let hardDismissed = false;

    for (const event of events) {
      const sameExternal = externalMatch(candidate, event);
      const similarity = titleSimilarity(candidate.title, event.title);
      const sameType = typeMatch(candidate.type, event.mediaType);
      const sameSource = candidate.source === event.externalSource;

      if (event.action === "dismissed") {
        if (sameExternal || (sameType && similarity === "exact")) {
          hardDismissed = true;
          feedbackScore -= 100;
          feedbackReasons.push(`Daha önce ilgilenmiyorum dediğin "${event.title}" ile aynı aday`);
          dismissedPenalties++;
          continue;
        }
        if (sameType && similarity === "close") {
          feedbackScore -= 12;
          feedbackReasons.push(`Daha önce reddettiğin "${event.title}" başlığına çok yakın`);
          dismissedPenalties++;
          continue;
        }
        if (sameType && sameSource) {
          feedbackScore -= 2;
          dismissedPenalties++;
        }
        continue;
      }

      if (!POSITIVE_ACTIONS.has(event.action)) continue;

      if (sameExternal || (sameType && similarity === "exact")) {
        feedbackScore += event.action === "added" ? 8 : 6;
        feedbackReasons.push(`Önceki olumlu etkileşiminle aynı çizgide: "${event.title}"`);
        positiveBoosts++;
        continue;
      }
      if (sameType && similarity === "close") {
        feedbackScore += 4;
        feedbackReasons.push(`Önceki olumlu etkileşimine yakın başlık: "${event.title}"`);
        positiveBoosts++;
        continue;
      }
      if (sameType && sameSource) {
        feedbackScore += event.action === "added" ? 2 : 1.5;
        positiveBoosts++;
      } else if (sameType) {
        feedbackScore += 0.75;
        positiveBoosts++;
      }
    }

    feedbackScore = Math.round(feedbackScore * 10) / 10;
    if (hardDismissed) {
      rejected.push({ title: candidate.title, reason: "Kalıcı feedback: daha önce ilgilenmiyorum denmiş" });
      rejectedDismissedExact++;
      continue;
    }

    if (feedbackScore !== 0) {
      adjusted++;
      adjustmentSum += feedbackScore;
      if (feedbackScore > maxBoost) maxBoost = feedbackScore;
      if (feedbackScore < maxPenalty) maxPenalty = feedbackScore;
    }

    const nextReasons = Array.from(
      new Set([...(candidate.scoreReasons || []), ...feedbackReasons])
    ).slice(0, 5);

    candidates.push({
      ...candidate,
      score: Math.round(((candidate.score || 0) + feedbackScore) * 10) / 10,
      scoreReasons: nextReasons,
      feedbackScore,
      feedbackReasons: Array.from(new Set(feedbackReasons)).slice(0, 3),
    });
  }

  candidates.sort((a, b) => (b.score || 0) - (a.score || 0));

  return {
    candidates,
    rejected,
    stats: {
      events: events.length,
      adjusted,
      rejectedDismissedExact,
      dismissedPenalties,
      positiveBoosts,
      averageAdjustment: adjusted > 0 ? Math.round((adjustmentSum / adjusted) * 10) / 10 : 0,
      maxBoost: Math.round(maxBoost * 10) / 10,
      maxPenalty: Math.round(maxPenalty * 10) / 10,
    },
  };
}
