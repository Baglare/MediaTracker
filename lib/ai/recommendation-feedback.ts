import type { RecommendationFeedbackEvent } from "@/lib/ai/types";

const RECOMMENDATION_FEEDBACK_KEY = "media-tracker-ai-recommendation-feedback";
const MAX_RECOMMENDATION_FEEDBACK_EVENTS = 1000;

type FeedbackEventInput = Omit<RecommendationFeedbackEvent, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

function createFeedbackId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `rf-${crypto.randomUUID()}`;
  }
  return `rf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function isFeedbackEvent(value: unknown): value is RecommendationFeedbackEvent {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<RecommendationFeedbackEvent>;
  return (
    typeof item.id === "string" &&
    typeof item.action === "string" &&
    typeof item.recommendationId === "string" &&
    typeof item.title === "string" &&
    typeof item.mediaType === "string" &&
    typeof item.source === "string" &&
    typeof item.createdAt === "string"
  );
}

export function readRecommendationFeedbackEvents(): RecommendationFeedbackEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECOMMENDATION_FEEDBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFeedbackEvent).slice(-MAX_RECOMMENDATION_FEEDBACK_EVENTS);
  } catch {
    return [];
  }
}

export function appendRecommendationFeedbackEvent(input: FeedbackEventInput): RecommendationFeedbackEvent | null {
  if (typeof window === "undefined") return null;
  const event: RecommendationFeedbackEvent = {
    ...input,
    id: input.id || createFeedbackId(),
    createdAt: input.createdAt || new Date().toISOString(),
  };
  try {
    const next = [...readRecommendationFeedbackEvents(), event].slice(-MAX_RECOMMENDATION_FEEDBACK_EVENTS);
    window.localStorage.setItem(RECOMMENDATION_FEEDBACK_KEY, JSON.stringify(next));
    return event;
  } catch {
    return null;
  }
}

function sameRecommendation(
  event: RecommendationFeedbackEvent,
  target: { title: string; mediaType: RecommendationFeedbackEvent["mediaType"]; externalSource?: string; externalId?: string }
): boolean {
  if (target.externalSource && target.externalId) {
    return event.externalSource === target.externalSource && event.externalId === target.externalId;
  }
  return event.mediaType === target.mediaType && event.title.trim().toLowerCase() === target.title.trim().toLowerCase();
}

export function removeDismissedRecommendationFeedback(target: {
  title: string;
  mediaType: RecommendationFeedbackEvent["mediaType"];
  externalSource?: string;
  externalId?: string;
}): void {
  if (typeof window === "undefined") return;
  try {
    const next = readRecommendationFeedbackEvents().filter(
      (event) => event.action !== "dismissed" || !sameRecommendation(event, target)
    );
    window.localStorage.setItem(RECOMMENDATION_FEEDBACK_KEY, JSON.stringify(next));
  } catch {
    // localStorage erişimi yoksa aktif oturum state'i çalışmaya devam eder.
  }
}

export function clearDismissedRecommendationFeedback(): void {
  if (typeof window === "undefined") return;
  try {
    const next = readRecommendationFeedbackEvents().filter((event) => event.action !== "dismissed");
    window.localStorage.setItem(RECOMMENDATION_FEEDBACK_KEY, JSON.stringify(next));
  } catch {
    // localStorage erişimi yoksa aktif oturum state'i çalışmaya devam eder.
  }
}
