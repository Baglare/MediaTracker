import { describe, expect, it } from "vitest";
import { applyFeedbackAwareScoring } from "@/lib/ai/feedback-aware-scorer";
import { mockProvider } from "@/lib/ai/provider";
import type { AiCandidate, RecommendationFeedbackEvent } from "@/lib/ai/types";

const candidate: AiCandidate = {
  source: "tmdb",
  externalId: "42",
  type: "movie",
  title: "Example Movie",
  score: 5,
};

function feedback(action: RecommendationFeedbackEvent["action"]): RecommendationFeedbackEvent {
  return {
    id: `feedback-${action}`,
    action,
    recommendationId: "recommendation-1",
    title: "Example Movie",
    mediaType: "movie",
    source: "TMDB",
    externalSource: "tmdb",
    externalId: "42",
    createdAt: "2026-07-20T10:00:00.000Z",
  };
}

describe("feedback-aware scoring", () => {
  it("increases a candidate score for a positive user signal", () => {
    const scored = applyFeedbackAwareScoring({ candidates: [candidate], feedbackEvents: [feedback("added")] });

    expect(scored.candidates[0].score).toBeGreaterThan(candidate.score ?? 0);
    expect(scored.candidates[0].feedbackScore).toBe(8);
  });

  it("deterministically rejects an exact candidate with negative feedback", () => {
    const args = { candidates: [candidate], feedbackEvents: [feedback("dismissed")] };

    expect(applyFeedbackAwareScoring(args)).toEqual(applyFeedbackAwareScoring(args));
    expect(applyFeedbackAwareScoring(args).candidates).toEqual([]);
  });

  it("moves a positively matched candidate ahead of an otherwise equal candidate", () => {
    const other: AiCandidate = { ...candidate, externalId: "99", title: "Other Movie" };
    const scored = applyFeedbackAwareScoring({
      candidates: [other, candidate],
      feedbackEvents: [feedback("added")],
    });

    expect(scored.candidates.map((item) => item.externalId)).toEqual(["42", "99"]);
    expect(scored.candidates[0].score).toBeGreaterThan(scored.candidates[1].score ?? 0);
  });

  it("penalizes a similar dismissed title enough to move it behind another candidate", () => {
    const similar: AiCandidate = { ...candidate, externalId: "43", title: "Example Movie Extended" };
    const other: AiCandidate = { ...candidate, externalId: "99", title: "Different Movie" };
    const dismissed = { ...feedback("dismissed"), externalId: undefined };
    const scored = applyFeedbackAwareScoring({
      candidates: [similar, other],
      feedbackEvents: [dismissed],
    });

    expect(scored.candidates.map((item) => item.externalId)).toEqual(["99", "43"]);
    expect(scored.candidates[1].feedbackScore).toBeLessThan(0);
  });

  it("keeps feedback scoring and mock provider recommendation order deterministic", async () => {
    const candidates: AiCandidate[] = [
      candidate,
      { ...candidate, externalId: "99", title: "Other Movie" },
    ];
    const feedbackEvents = [feedback("added")];
    const run = async () => {
      const scored = applyFeedbackAwareScoring({ candidates, feedbackEvents }).candidates;
      return mockProvider.generate({
        message: "Bana film öner",
        profile: null,
        intent: {
          kind: "general_recommendation",
          references: [],
          targetTypes: ["movie"],
          sourceTypes: [],
          mood: [],
          avoid: [],
          needsLibraryProfile: true,
          needsCandidateSearch: true,
          needsWebResearch: false,
        },
        settings: {
          useProfile: true,
          useRecentActivity: true,
          usePersonalNotes: false,
          useWebResearch: false,
          deepResearch: false,
          useOpenAIProvider: false,
        },
        candidates: scored,
      });
    };

    const first = await run();
    const second = await run();
    expect(first.recommendations.map((item) => item.externalId)).toEqual(
      second.recommendations.map((item) => item.externalId)
    );
  });
});
