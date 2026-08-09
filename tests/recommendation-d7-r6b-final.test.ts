import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildResearchRescueRequest, searchCandidatesWithDebug } from "@/lib/ai/candidate-search";
import type { AiIntent, AiRetrievalPlan } from "@/lib/ai/types";
import type { RecommendationRequestV2 } from "@/features/recommendations/domain/codec";
import { runActiveGroundedRecommendation } from "@/features/recommendations/research/active/service";
import { buildResearchEvidenceHandoff } from "@/features/recommendations/research/domain/decisions";
import { researchCandidate, researchClaim, researchDecision, wikipediaCitation } from "./fixtures/recommendations-v2/grounded-research";

const intent: AiIntent = { kind: "general_recommendation", references: [], targetTypes: ["anime"], sourceTypes: [], mood: [], avoid: [], needsLibraryProfile: false, needsCandidateSearch: true, needsWebResearch: false };
const plan: AiRetrievalPlan = { taskType: "general_recommendation", interpretation: "bounded", targetMediaTypes: ["anime"], sourceTypes: [], preferenceSignals: [], avoidSignals: [], needsClarification: false, searchPlans: [] };

function steinsRequest(): RecommendationRequestV2 {
  return {
    version: 2,
    queryText: "Bilim kurgu, zaman yolculuğu ve belirgin romantizm içeren anime öner.",
    targetMediaTypes: ["anime"],
    aspectConstraints: [
      { id: "sci-fi", kind: "aspect", aspectId: "sci_fi", role: "must", source: "explicit", minimumLevel: "significant" },
      { id: "time-travel", kind: "aspect", aspectId: "time_travel", role: "must", source: "explicit", minimumLevel: "significant" },
      { id: "romance", kind: "aspect", aspectId: "romance", role: "must", source: "explicit", minimumLevel: "significant" },
    ],
    objectiveConstraints: [{ id: "year", kind: "objective", field: "releaseYear", operator: "gte", value: 2000, role: "must", source: "explicit" }],
    strictness: "strict",
    references: [],
    profileSignalsEnabled: false,
    semanticVerifierMode: "structured_only",
    locale: "tr-TR",
  };
}

function response(recommendations: unknown[] = []) {
  return { assistantMessage: "ok", recommendations, transparencySummary: "bounded", engineStatus: { provider: "deterministic_v2" }, debug: { provider: "deterministic_v2" } } as never;
}

function context(role: "must" | "avoid" = "must") {
  const constraint = role === "must"
    ? { id: "romance:must", kind: "aspect" as const, aspectId: "romance" as const, role, source: "explicit" as const, minimumLevel: "significant" as const }
    : { id: "romance:avoid", kind: "aspect" as const, aspectId: "romance" as const, role, source: "explicit" as const, rejectAtLevel: "significant" as const };
  const base = researchCandidate();
  const candidate = researchCandidate({ identity: base.identity, scope: base.versionScope, constraints: [{ aspectId: "romance", role, minimumLevel: "significant", source: "explicit", currentStructuredDecision: "unknown", unresolvedReason: "structured evidence unresolved" }] });
  return { candidate, constraint, value: { version: 1 as const, structuredRequest: { version: 1 as const, targetMediaTypes: ["anime" as const], aspectConstraints: [constraint], objectiveConstraints: [], strictness: "strict" as const }, candidates: [{ researchCandidate: candidate, titleSnapshot: "Bounded public title" }] } };
}

function supportedHandoff(status: "supported" | "contradicted" = "supported") {
  const candidate = researchCandidate();
  const claim = researchClaim({ polarity: status === "supported" ? "support" : "contradict", level: status === "supported" ? "significant" : null });
  const decision = researchDecision({ status });
  return buildResearchEvidenceHandoff({ candidateIdentity: candidate.identity, versionScope: candidate.versionScope, decisions: [decision], claims: [claim], citations: [wikipediaCitation()], researchStatus: "complete" });
}

describe("D7-R6B retrieval rescue and final transparency", () => {
  it("yalnız researchable explicit hard must filtresini gevşetir; objective ve queryable must'ları korur", () => {
    const original = steinsRequest();
    const rescue = buildResearchRescueRequest(original);
    expect(rescue?.relaxedAspectIds).toEqual(["romance"]);
    expect(rescue?.request.aspectConstraints.map((item) => item.aspectId)).toEqual(["sci_fi", "time_travel"]);
    expect(rescue?.request.objectiveConstraints).toEqual(original.objectiveConstraints);
    expect(original.aspectConstraints.map((item) => item.aspectId)).toEqual(["sci_fi", "time_travel", "romance"]);
    expect(JSON.stringify(buildResearchRescueRequest({ ...original, aspectConstraints: original.aspectConstraints.map((item) => ({ ...item, source: "inferred" as const })) }))).not.toContain("relaxedAspectIds");
  });

  it("dual pass normal havuz boşken Romance filtresini kaldırır, Sci-Fi query filtresini korur ve evidence-only Time Travel'ı uydurmaz", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const genres = url.searchParams.get("genres") ?? "";
      const tags = url.searchParams.get("tags") ?? "";
      const rescued = genres.includes("Sci-Fi") && !genres.includes("Romance") && tags === "";
      return new Response(JSON.stringify({ results: rescued ? [{ externalSource: "anilist", externalId: "9253", type: "anime", title: "Steins;Gate", genres: ["Sci-Fi"], tags: [{ name: "Time Travel", rank: 90 }], totalProgress: 24, popularity: 500000, averageScore: 90 }] : [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await searchCandidatesWithDebug({ intent, retrievalPlan: plan, profile: null, message: steinsRequest().queryText, mediaItems: [], progressLogs: [], structuredRequest: steinsRequest(), researchRescue: true });
    expect(fetcher.mock.calls.map((call) => ({ genres: new URL(String(call[0])).searchParams.get("genres"), tags: new URL(String(call[0])).searchParams.get("tags") }))).toEqual(expect.arrayContaining([{ genres: "Sci-Fi", tags: null }]));
    expect(result.candidates.map((item) => item.externalId)).toContain("9253");
    expect(fetcher.mock.calls.some((call) => new URL(String(call[0])).searchParams.get("genres")?.includes("Romance"))).toBe(true);
    expect(fetcher.mock.calls.some((call) => new URL(String(call[0])).searchParams.get("genres") === "Sci-Fi" && !new URL(String(call[0])).searchParams.has("tags"))).toBe(true);
    expect(result.debug.notes).toContain("research_rescue:relaxed=romance candidates=1");
    vi.unstubAllGlobals();
  });

  it("Kakegurui-benzeri omission unknown kalır ve no-verified-match notice üretir", async () => {
    const fixture = context("must");
    const baseline = { response: response(), researchShadowContext: fixture.value };
    const result = await runActiveGroundedRecommendation({ engineInput: {} as never, requestId: "kakegurui" }, {
      runDeterministic: vi.fn(async () => baseline) as never,
      runResearch: vi.fn(async () => ({ result: { status: "complete", results: [{ researchStatus: "no_claims_extracted" }] }, handoffs: [] })) as never,
    });
    expect(result.execution.response.recommendations).toEqual([]);
    expect(result.execution.response.researchOutcomeNotice).toMatchObject({ status: "no_verified_match", aspects: [{ aspectId: "romance", outcome: "could_not_verify_required" }] });
    expect(JSON.stringify(result.execution.response)).not.toMatch(/researchEvidence|Kakegurui|popularity/i);
  });

  it("avoid presence adayı eler ve yalnız bounded exclusion notice üretir", async () => {
    const fixture = context("avoid");
    const rec = { externalSource: fixture.candidate.identity.primaryProvider, externalId: fixture.candidate.identity.primaryExternalId };
    const baseline = { response: response([rec]), researchShadowContext: fixture.value };
    const final = { response: response(), researchShadowContext: fixture.value };
    const result = await runActiveGroundedRecommendation({ engineInput: {} as never, requestId: "avoid" }, {
      runDeterministic: vi.fn().mockResolvedValueOnce(baseline).mockResolvedValueOnce(final) as never,
      runResearch: vi.fn(async () => ({ result: { status: "complete", results: [{ candidateIdentity: fixture.candidate.identity, aspectId: "romance", hypotheticalEffect: "would_reject_avoid" }] }, handoffs: [{ handoff: supportedHandoff(), cacheStatus: "miss" }] })) as never,
    });
    expect(result.execution.response.recommendations).toEqual([]);
    expect(result.execution.response.researchOutcomeNotice).toMatchObject({ status: "candidates_excluded_by_research", aspects: [{ outcome: "verified_avoided_element" }] });
    expect(JSON.stringify(result.execution.response)).not.toMatch(/researchEvidence|citationId|passage|providerResponse/i);
  });

  it("explicit absence avoid riskini temizler ve revision-bound public evidence taşır", async () => {
    const fixture = context("avoid");
    const rec = { externalSource: fixture.candidate.identity.primaryProvider, externalId: fixture.candidate.identity.primaryExternalId };
    const baseline = { response: response(), researchShadowContext: fixture.value };
    const final = { response: response([rec]), researchShadowContext: fixture.value };
    const result = await runActiveGroundedRecommendation({ engineInput: {} as never, requestId: "absence" }, {
      runDeterministic: vi.fn().mockResolvedValueOnce(baseline).mockResolvedValueOnce(final) as never,
      runResearch: vi.fn(async () => ({ result: { status: "complete", results: [{ candidateIdentity: fixture.candidate.identity, aspectId: "romance", hypotheticalEffect: "would_clear_avoid" }] }, handoffs: [{ handoff: supportedHandoff("contradicted"), cacheStatus: "hit" }] })) as never,
    });
    expect(result.execution.response.recommendations[0].researchEvidence).toMatchObject({ status: "research_verified", affectedAspects: [{ finding: "explicit_absence" }] });
    expect(result.execution.response.recommendations[0].researchEvidence?.sources[0].url).toMatch(/^https:\/\/(en|tr)\.wikipedia\.org\/w\/index\.php\?.*oldid=/);
  });

  it("provider failure baseline'ı korur, raw hatayı gizler ve research-unavailable bildirir", async () => {
    const fixture = context("must");
    const rec = { externalSource: fixture.candidate.identity.primaryProvider, externalId: fixture.candidate.identity.primaryExternalId };
    const baseline = { response: response([rec]), researchShadowContext: fixture.value };
    const result = await runActiveGroundedRecommendation({ engineInput: {} as never, requestId: "failure" }, {
      runDeterministic: vi.fn(async () => baseline) as never,
      runResearch: vi.fn(async () => { throw new Error("secret raw provider response"); }) as never,
    });
    expect(result.execution.response.recommendations).toEqual([rec]);
    expect(result.execution.response.researchOutcomeNotice?.status).toBe("research_unavailable");
    expect(JSON.stringify(result.execution.response)).not.toContain("secret raw provider response");
  });
});
