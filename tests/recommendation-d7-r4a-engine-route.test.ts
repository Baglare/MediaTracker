import { describe, expect, it, vi } from "vitest";
import { runDeterministicRecommendationV2 } from "@/features/recommendations/orchestration";
import { adaptAniListEvidence } from "@/features/recommendations/providers/anilist-adapter";
import { emptyProviderEvidenceTelemetry } from "@/features/recommendations/providers/types";
import { normalizeAniListMedia } from "@/lib/anilist";
import type { AiCandidate } from "@/lib/ai/types";

function engineInput() {
  const raw = normalizeAniListMedia({ id: 9253, type: "ANIME", title: { english: "Steins;Gate" }, genres: ["Sci-Fi"], tags: [{ name: "Time Travel", rank: 90 }], episodes: 24, averageScore: 90, format: "TV", status: "FINISHED" });
  const candidate: AiCandidate = { source: "anilist", externalId: "9253", type: "anime", title: "Steins;Gate", globalSearch: { source: "anilist", externalId: "9253", type: "anime", title: "Steins;Gate", raw } as never };
  const snapshot = adaptAniListEvidence(raw, "2026-08-09T00:00:00.000Z");
  return {
    message: "private raw prompt",
    intent: { kind: "general_recommendation" as const, references: [], targetTypes: ["anime" as const], sourceTypes: [], mood: [], avoid: [], needsLibraryProfile: false, needsCandidateSearch: true, needsWebResearch: false },
    retrievalPlan: null,
    settings: { useProfile: false, useRecentActivity: false, usePersonalNotes: false, useWebResearch: false, deepResearch: false, useOpenAIProvider: false },
    candidates: [candidate], mediaItems: [], feedback: [], dismissed: [], baseUrl: "http://local",
    structuredRequest: { version: 2 as const, queryText: "private raw prompt", targetMediaTypes: ["anime" as const], aspectConstraints: [{ id: "aspect:romance:must", kind: "aspect" as const, aspectId: "romance" as const, role: "must" as const, minimumLevel: "significant" as const, source: "explicit" as const }], objectiveConstraints: [], strictness: "strict" as const, references: [], profileSignalsEnabled: false, semanticVerifierMode: "structured_only" as const, locale: "tr" as const },
    providerPipeline: { candidates: [candidate], evidenceByCandidateKey: new Map([[snapshot.candidateIdentity.canonicalKey, snapshot]]), telemetry: { ...emptyProviderEvidenceTelemetry(), snapshots: 1 }, rejectedCandidates: [] },
  };
}

describe("D7-R4A engine shadow hook", () => {
  it("shadow hook açık/kapalı aynı authoritative sıralama ve public schema'yı üretir", async () => {
    const baseline = await runDeterministicRecommendationV2(engineInput());
    const hook = vi.fn(async () => undefined);
    const shadowed = await runDeterministicRecommendationV2({ ...engineInput(), onResearchShadowContext: hook });
    expect(hook).toHaveBeenCalledTimes(1);
    const context = hook.mock.calls[0][0];
    expect(JSON.stringify(context)).not.toMatch(/queryText|ownerId|userId|mediaItems|private raw prompt/i);
    expect(shadowed.recommendations).toEqual(baseline.recommendations);
    expect(shadowed.nearMatches).toEqual(baseline.nearMatches);
    expect(shadowed.rejectedCandidates).toEqual(baseline.rejectedCandidates);
    expect(JSON.stringify(shadowed)).not.toMatch(/passage|citation|researchShadow|raw claim/i);
  });

  it("shadow timeout/provider failure authoritative response'u bozmaz", async () => {
    const baseline = await runDeterministicRecommendationV2(engineInput());
    const shadowed = await runDeterministicRecommendationV2({ ...engineInput(), onResearchShadowContext: async () => { throw new Error("provider timeout secret"); } });
    expect(shadowed.recommendations).toEqual(baseline.recommendations);
    expect(JSON.stringify(shadowed)).not.toContain("provider timeout secret");
  });
});
