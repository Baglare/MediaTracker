import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runDeterministicRecommendationV2, runDeterministicRecommendationV2WithShadowSeed } from "@/features/recommendations/orchestration";
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

describe("D7-R4 engine purity and shadow seed", () => {
  it("aynı inputta aynı authoritative sıralamayı ve minimized seed'i üretir", async () => {
    const first = await runDeterministicRecommendationV2WithShadowSeed(engineInput());
    const second = await runDeterministicRecommendationV2WithShadowSeed(engineInput());
    expect(second.response.recommendations).toEqual(first.response.recommendations);
    expect(second.response.nearMatches).toEqual(first.response.nearMatches);
    expect(second.researchShadowContext).toEqual(first.researchShadowContext);
    expect(JSON.stringify(first.researchShadowContext)).not.toMatch(/queryText|ownerId|userId|mediaItems|private raw prompt/i);
    expect(JSON.stringify(first.response)).not.toMatch(/passage|citation|researchShadow|raw claim/i);
  });

  it("legacy engine API yalnız public response döndürür", async () => {
    const response = await runDeterministicRecommendationV2(engineInput());
    expect(response.engineStatus?.provider).toBe("deterministic_v2");
    expect(response).not.toHaveProperty("researchShadowContext");
  });

  it("engine framework, environment veya shadow orchestrator import etmez", () => {
    const source = readFileSync("features/recommendations/orchestration/deterministic-engine.ts", "utf8");
    expect(source).not.toMatch(/next\/server|process\.env|shadow\/orchestrator|shadow\/lifecycle|PostResponseTaskScheduler/);
    expect(source).not.toContain("onResearchShadowContext");
  });
});
