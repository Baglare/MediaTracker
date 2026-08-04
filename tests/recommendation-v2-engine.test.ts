import { describe, expect, it } from "vitest";
import { runDeterministicRecommendationV2 } from "@/features/recommendations/orchestration";
import { adaptAniListEvidence } from "@/features/recommendations/providers/anilist-adapter";
import { emptyProviderEvidenceTelemetry } from "@/features/recommendations/providers/types";
import { normalizeAniListMedia } from "@/lib/anilist";
import type { AiCandidate } from "@/lib/ai/types";

describe("D6-3 deterministic recommendation engine", () => {
  it("LLM ranking olmadan V1 response/Quick Add contract'ını korur", async () => {
    const raw = normalizeAniListMedia({ id: 700, type: "ANIME", title: { english: "Grounded Anime" }, genres: ["Romance"], tags: [{ name: "Romance", rank: 88 }], episodes: 12, averageScore: 80, format: "TV", status: "FINISHED" });
    const candidate: AiCandidate = { source: "anilist", externalId: "700", type: "anime", title: "Grounded Anime", globalSearch: { source: "anilist", externalId: "700", type: "anime", title: "Grounded Anime", raw } as never };
    const snapshot = adaptAniListEvidence(raw, "2026-08-04T00:00:00.000Z");
    const response = await runDeterministicRecommendationV2({
      message: "Güçlü romantizmi olan 13 bölümden kısa anime öner",
      intent: { kind: "general_recommendation", references: [], targetTypes: ["anime"], sourceTypes: [], mood: [], avoid: [], needsLibraryProfile: false, needsCandidateSearch: true, needsWebResearch: false },
      retrievalPlan: { taskType: "general_recommendation", interpretation: "anime", targetMediaTypes: ["anime"], sourceTypes: [], preferenceSignals: [], avoidSignals: [], needsClarification: false, searchPlans: [] },
      settings: { useProfile: true, useRecentActivity: true, usePersonalNotes: false, useWebResearch: false, deepResearch: false, useOpenAIProvider: false },
      candidates: [candidate], mediaItems: [], feedback: [], dismissed: [], baseUrl: "http://local",
      providerPipeline: { candidates: [candidate], evidenceByCandidateKey: new Map([[snapshot.candidateIdentity.canonicalKey, snapshot]]), telemetry: { ...emptyProviderEvidenceTelemetry(), snapshots: 1 }, rejectedCandidates: [] },
    });
    expect(response.engineStatus).toMatchObject({ provider: "deterministic_v2", embeddingMode: "disabled" });
    expect(response.recommendations).toHaveLength(1);
    expect(response.recommendations[0]).toMatchObject({ title: "Grounded Anime", externalSource: "anilist", externalId: "700", candidate });
    expect(response.recommendations[0].reason).toContain("AniList");
  });

  it("exact dismissed identity'yi title/source geneline yaymadan eler", async () => {
    const candidates = ["701", "702"].map((id) => ({ source: "anilist", externalId: id, type: "anime", title: "Same Title" } satisfies AiCandidate));
    const snapshots = candidates.map((candidate) => adaptAniListEvidence(normalizeAniListMedia({ id: Number(candidate.externalId), type: "ANIME", title: { english: candidate.title }, genres: ["Fantasy"] })));
    const response = await runDeterministicRecommendationV2({
      message: "fantastik anime öner", intent: { kind: "general_recommendation", references: [], targetTypes: ["anime"], sourceTypes: [], mood: [], avoid: [], needsLibraryProfile: false, needsCandidateSearch: true, needsWebResearch: false }, retrievalPlan: null,
      settings: { useProfile: false, useRecentActivity: false, usePersonalNotes: false, useWebResearch: false, deepResearch: false, useOpenAIProvider: false }, candidates, mediaItems: [], feedback: [], dismissed: [{ title: "Same Title", mediaType: "anime", externalSource: "anilist", externalId: "701" }], baseUrl: "http://local",
      providerPipeline: { candidates, evidenceByCandidateKey: new Map(snapshots.map((item) => [item.candidateIdentity.canonicalKey, item])), telemetry: { ...emptyProviderEvidenceTelemetry(), snapshots: 2 }, rejectedCandidates: [] },
    });
    expect(response.rejectedCandidates).toContainEqual({ title: "Same Title", reason: "dismissed_exact_identity" });
    expect(response.recommendations.some((item) => item.externalId === "702")).toBe(true);
  });
});
