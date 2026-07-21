import { describe, expect, it } from "vitest";
import { buildAiEngineStatus, retainVerifiedRecommendations } from "@/lib/ai/engine-status";
import type { AiCandidate, AiRecommendation } from "@/lib/ai/types";

const verifiedCandidate: AiCandidate = {
  source: "tmdb",
  externalId: "42",
  type: "movie",
  title: "Verified Movie",
  score: 7,
};

describe("AI engine status metadata", () => {
  it("reports provider and embedding fallback without exposing raw failures or secrets", () => {
    const status = buildAiEngineStatus({
      provider: "mock",
      model: "safe-model-v1",
      providerFallbackUsed: true,
      evaluatedCandidateCount: 12,
      candidates: [verifiedCandidate],
      feedbackEventCount: 3,
      feedbackAdjustedCount: 1,
      embedding: {
        provider: "local_mock",
        requested: 12,
        fallbackUsed: true,
        persistentCacheDisabled: true,
      },
    });

    expect(status).toEqual({
      provider: "mock",
      model: "safe-model-v1",
      embeddingMode: "local_mock",
      providerFallbackUsed: true,
      evaluatedCandidateCount: 12,
      sources: ["tmdb"],
      feedbackApplied: true,
      feedbackEventCount: 3,
      persistentCache: "not_used",
    });
    expect(JSON.stringify(status)).not.toContain("secret");
    expect(JSON.stringify(status)).not.toContain("stack");
  });

  it("drops unverified provider recommendations and restores canonical candidate data", () => {
    const recommendations: AiRecommendation[] = [
      {
        id: "verified",
        title: "Provider title",
        mediaType: "movie",
        source: "TMDB",
        externalSource: "tmdb",
        externalId: "42",
        fitLabel: "Yüksek uyum",
        reason: "Doğrulanmış aday",
      },
      {
        id: "hallucinated",
        title: "Made Up Movie",
        mediaType: "movie",
        source: "Unknown",
        externalSource: "tmdb",
        externalId: "not-verified",
        fitLabel: "Bilinmiyor",
        reason: "Doğrulanmamış",
      },
    ];

    const retained = retainVerifiedRecommendations(recommendations, [verifiedCandidate]);

    expect(retained).toHaveLength(1);
    expect(retained[0]).toMatchObject({
      id: "verified",
      title: "Verified Movie",
      externalId: "42",
      candidate: verifiedCandidate,
    });
  });

  it("omits unsafe model strings from user-visible metadata", () => {
    const status = buildAiEngineStatus({
      provider: "openai",
      model: "model\nsecret=should-not-render",
      evaluatedCandidateCount: 0,
      candidates: [],
    });

    expect(status.model).toBeUndefined();
    expect(status.embeddingMode).toBe("disabled");
  });

  it("does not mislabel an embedding fallback as an AI provider fallback", () => {
    const status = buildAiEngineStatus({
      provider: "openai",
      providerFallbackUsed: false,
      evaluatedCandidateCount: 1,
      candidates: [verifiedCandidate],
      embedding: {
        provider: "local_mock",
        requested: 1,
        fallbackUsed: true,
        persistentCacheDisabled: true,
      },
    });

    expect(status.embeddingMode).toBe("local_mock");
    expect(status.providerFallbackUsed).toBe(false);
  });
});
