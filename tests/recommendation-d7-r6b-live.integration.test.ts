import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import { runActiveGroundedRecommendation } from "@/features/recommendations/research/active/service";
import { processResearchEvidenceCache } from "@/features/recommendations/research/cache/process-cache";
import { createResearchVersionScope } from "@/features/recommendations/research/domain/version-scope";
import { extractGroundedResearch } from "@/features/recommendations/research/extraction/orchestration/service";
import { runGroundedResearchActivePipeline } from "@/features/recommendations/research/shadow/orchestrator";

const LIVE = process.env.D7_R6_FINAL_LIVE_SMOKE === "1"
  && process.env.D7_RESEARCH_ROLLOUT_MODE === "active"
  && process.env.D7_RESEARCH_PUBLIC_CITATIONS_ENABLED === "1"
  && process.env.D7_RESEARCH_EVIDENCE_CACHE_ENABLED === "1"
  && process.env.MEDIA_TRACKER_WIKIMEDIA_RESEARCH_ENABLED === "1"
  && process.env.D7_RESEARCH_DISCOVERY_PROVIDER === "groq"
  && process.env.D7_GROQ_WEB_DISCOVERY_ENABLED === "1"
  && process.env.GROQ_RESEARCH_MODEL === "groq/compound-mini"
  && process.env.D7_RESEARCH_EXTRACTION_PROVIDER === "groq"
  && process.env.D7_GROQ_GROUNDED_EXTRACTION_ENABLED === "1"
  && process.env.GROQ_RESEARCH_EXTRACTION_MODEL === "openai/gpt-oss-20b"
  && Boolean(process.env.GROQ_API_KEY)
  && Boolean(process.env.MEDIA_TRACKER_RESEARCH_USER_AGENT);

describe.skipIf(!LIVE)("D7-R6B conditional active final live", () => {
  it("Steins;Gate active rescue public citation üretir ve ikinci çalışmada process cache hit olur", async () => {
    const identity = createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: "9253", mediaType: "anime", secondaryIds: [{ kind: "anilist", externalId: "9253" }] });
    const versionScope = createResearchVersionScope({ identity, scopeKind: "work" });
    const shadowContext = {
      version: 1 as const,
      structuredRequest: { version: 1 as const, targetMediaTypes: ["anime" as const], aspectConstraints: [{ id: "aspect:romance:must", kind: "aspect" as const, aspectId: "romance" as const, role: "must" as const, source: "explicit" as const, minimumLevel: "significant" as const }], objectiveConstraints: [], strictness: "strict" as const },
      candidates: [{ titleSnapshot: "Steins;Gate", releaseYear: 2011, researchCandidate: { identity, versionScope, mediaType: "anime" as const, preResearchRank: 0, hardObjectiveEligible: true, unresolvedConstraints: [{ aspectId: "romance" as const, role: "must" as const, minimumLevel: "significant" as const, source: "explicit" as const, currentStructuredDecision: "unknown" as const, unresolvedReason: "structured_evidence_unknown" }], structuredEvidenceSummary: [{ aspectId: "romance" as const, decision: "unknown" as const, level: null, confidence: "unknown" as const, sourceKinds: [], warnings: [] }] } }],
    };
    const baselineResponse = { assistantMessage: "baseline", recommendations: [], transparencySummary: "bounded", engineStatus: { provider: "deterministic_v2" }, debug: { provider: "deterministic_v2" } } as never;
    const finalResponse = { assistantMessage: "final", recommendations: [{ externalSource: "anilist", externalId: "9253", title: "Steins;Gate" }], transparencySummary: "bounded", engineStatus: { provider: "deterministic_v2" }, debug: { provider: "deterministic_v2" } } as never;
    let deterministicCalls = 0;
    const runDeterministic = vi.fn(async () => ({ response: deterministicCalls++ % 2 === 0 ? baselineResponse : finalResponse, researchShadowContext: shadowContext })) as never;
    let extractionCalls = 0;
    const extract = async (...args: Parameters<typeof extractGroundedResearch>) => { extractionCalls += 1; return extractGroundedResearch(...args); };
    const runResearch = ((input: Parameters<typeof runGroundedResearchActivePipeline>[0]) => runGroundedResearchActivePipeline(input, { environment: process.env, evidenceCache: processResearchEvidenceCache, extract })) as typeof runGroundedResearchActivePipeline;
    await processResearchEvidenceCache.invalidateByScope(versionScope.scopeKey);
    const engineInput = { intent: {}, retrievalPlan: null, settings: {}, candidates: [], mediaItems: [], feedback: [], dismissed: [], message: "bounded", baseUrl: "http://local" } as never;
    const first = await runActiveGroundedRecommendation({ engineInput, requestId: `d7-r6b-live-${Date.now()}:miss` }, { runDeterministic, runResearch });
    const second = await runActiveGroundedRecommendation({ engineInput, requestId: `d7-r6b-live-${Date.now()}:hit` }, { runDeterministic, runResearch });
    console.info(`[D7-R6B live] first=${first.status} second=${second.status} extraction_calls=${extractionCalls} evidence=${Boolean(second.execution.response.recommendations[0]?.researchEvidence)} cache=${second.provenance[0]?.cacheStatus ?? "none"}`);
    expect(first.status).toBe("active_applied"); expect(second.status).toBe("active_applied");
    expect(first.execution.response.recommendations[0].researchEvidence).toMatchObject({ status: "research_verified", affectedAspects: [{ aspectId: "romance", finding: "supported", level: expect.stringMatching(/significant|primary/), confidence: expect.stringMatching(/low|medium/) }] });
    expect(first.execution.response.recommendations[0].researchEvidence?.sources[0].url).toMatch(/^https:\/\/(en|tr)\.wikipedia\.org\/w\/index\.php\?.*oldid=/);
    expect(second.provenance[0].cacheStatus).toBe("hit"); expect(extractionCalls).toBe(1);
    expect(second.execution.response.recommendations).toEqual(first.execution.response.recommendations);
    expect(JSON.stringify(second.execution.response)).not.toMatch(/passage|evidenceUnit|providerResponse|prompt|modelOutput|citationId|revisionId/i);
  }, 45_000);
});
