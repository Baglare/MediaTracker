import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import { createResearchVersionScope } from "@/features/recommendations/research/domain/version-scope";
import { processResearchEvidenceCache } from "@/features/recommendations/research/cache/process-cache";
import { extractGroundedResearch } from "@/features/recommendations/research/extraction/orchestration/service";
import { runGroundedResearchShadow } from "@/features/recommendations/research/shadow/orchestrator";
import type { GroundedResearchShadowInput } from "@/features/recommendations/research/shadow/types";

const LIVE = process.env.D7_R5C_CACHE_LIVE_SMOKE === "1"
  && process.env.D7_RESEARCH_SHADOW_ENABLED === "1"
  && process.env.D7_RESEARCH_EVIDENCE_CACHE_ENABLED === "1"
  && process.env.MEDIA_TRACKER_WIKIMEDIA_RESEARCH_ENABLED === "1"
  && process.env.D7_RESEARCH_EXTRACTION_PROVIDER === "groq"
  && process.env.D7_GROQ_GROUNDED_EXTRACTION_ENABLED === "1"
  && process.env.GROQ_RESEARCH_EXTRACTION_MODEL === "openai/gpt-oss-20b"
  && Boolean(process.env.GROQ_API_KEY)
  && Boolean(process.env.MEDIA_TRACKER_RESEARCH_USER_AGENT);

describe.skipIf(!LIVE)("D7-R5C conditional process-cache live", () => {
  it("Steins;Gate miss -> validated write -> hit keeps shadow non-authoritative", async () => {
    const identity = createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: "9253", mediaType: "anime", secondaryIds: [{ kind: "anilist", externalId: "9253" }] });
    const versionScope = createResearchVersionScope({ identity, scopeKind: "work" });
    const request: GroundedResearchShadowInput = {
      version: 1, requestId: `d7-r5c-live-${Date.now()}`,
      structuredRequest: { version: 1, targetMediaTypes: ["anime"], aspectConstraints: [{ id: "aspect:romance:must", kind: "aspect", aspectId: "romance", role: "must", source: "explicit", minimumLevel: "significant" }], objectiveConstraints: [], strictness: "strict" },
      candidates: [{ titleSnapshot: "Steins;Gate", releaseYear: 2011, researchCandidate: { identity, versionScope, mediaType: "anime", preResearchRank: 0, hardObjectiveEligible: true, unresolvedConstraints: [{ aspectId: "romance", role: "must", minimumLevel: "significant", source: "explicit", currentStructuredDecision: "unknown", unresolvedReason: "structured_evidence_unknown" }], structuredEvidenceSummary: [{ aspectId: "romance", decision: "unknown", level: null, confidence: "unknown", sourceKinds: [], warnings: [] }] } }],
    };
    await processResearchEvidenceCache.invalidateByScope(versionScope.scopeKey);
    let extractionCalls = 0;
    const extract = async (...args: Parameters<typeof extractGroundedResearch>) => { extractionCalls += 1; return extractGroundedResearch(...args); };
    const baseline = Object.freeze({ recommendations: ["authoritative-baseline"] });
    const first = await runGroundedResearchShadow(request, { environment: process.env, evidenceCache: processResearchEvidenceCache, extract });
    expect(first.results[0]).toMatchObject({ researchDecisionStatus: "supported", researchLevel: expect.stringMatching(/significant|primary/), hypotheticalEffect: "would_satisfy_must" });
    expect(first.transparency[0].cacheStatus).toBe("miss");
    const callsAfterMiss = extractionCalls;
    const second = await runGroundedResearchShadow({ ...request, requestId: `${request.requestId}:hit` }, { environment: process.env, evidenceCache: processResearchEvidenceCache, extract });
    console.info(`[D7-R5C live] first=${first.transparency[0].cacheStatus} second=${second.transparency[0].cacheStatus} decision=${second.results[0].researchDecisionStatus} level=${second.results[0].researchLevel ?? "none"} effect=${second.results[0].hypotheticalEffect} extraction_calls=${extractionCalls}`);
    expect(callsAfterMiss).toBe(1); expect(extractionCalls).toBe(1);
    expect(second.transparency[0].cacheStatus).toBe("hit");
    expect(second.results[0]).toMatchObject({ researchDecisionStatus: first.results[0].researchDecisionStatus, researchLevel: first.results[0].researchLevel, hypotheticalEffect: first.results[0].hypotheticalEffect });
    expect(JSON.stringify(second)).not.toMatch(/boundedText|passageId|evidenceUnit|paraphrasedClaim|https?:|rawResponse|reasoning/i);
    expect(baseline).toEqual({ recommendations: ["authoritative-baseline"] });
  }, 30_000);
});
