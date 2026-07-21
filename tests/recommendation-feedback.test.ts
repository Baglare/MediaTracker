import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendRecommendationFeedbackEvent,
  clearDismissedRecommendationFeedback,
  readRecommendationFeedbackEvents,
  removeDismissedRecommendationFeedback,
} from "@/lib/ai/recommendation-feedback";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

beforeEach(() => {
  const localStorage = new MemoryStorage();
  vi.stubGlobal("window", { localStorage });
  vi.stubGlobal("localStorage", localStorage);
});

describe("recommendation feedback persistence", () => {
  it("persists feedback and makes it available to the next request", () => {
    appendRecommendationFeedbackEvent({
      action: "dismissed",
      recommendationId: "r1",
      title: "Example Movie",
      mediaType: "movie",
      source: "TMDB",
      externalSource: "tmdb",
      externalId: "42",
    });

    expect(readRecommendationFeedbackEvents()).toMatchObject([
      { action: "dismissed", title: "Example Movie", externalSource: "tmdb", externalId: "42" },
    ]);
  });

  it("removes one dismissed signal or clears all dismissed signals without deleting positive events", () => {
    const base = {
      recommendationId: "r1",
      title: "Example Movie",
      mediaType: "movie" as const,
      source: "TMDB",
      externalSource: "tmdb" as const,
      externalId: "42",
    };
    appendRecommendationFeedbackEvent({ ...base, action: "dismissed" });
    appendRecommendationFeedbackEvent({ ...base, action: "added" });

    removeDismissedRecommendationFeedback(base);
    expect(readRecommendationFeedbackEvents().map((event) => event.action)).toEqual(["added"]);

    appendRecommendationFeedbackEvent({ ...base, action: "dismissed" });
    clearDismissedRecommendationFeedback();
    expect(readRecommendationFeedbackEvents().map((event) => event.action)).toEqual(["added"]);
  });
});
