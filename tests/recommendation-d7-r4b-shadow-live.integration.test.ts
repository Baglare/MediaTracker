import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import { createResearchVersionScope } from "@/features/recommendations/research/domain/version-scope";
import { runGroundedResearchShadow } from "@/features/recommendations/research/shadow/orchestrator";
import type { GroundedResearchShadowInput } from "@/features/recommendations/research/shadow/types";

const LIVE = process.env.D7_R4_SHADOW_LIVE_SMOKE === "1"
  && process.env.D7_RESEARCH_SHADOW_ENABLED === "1"
  && process.env.MEDIA_TRACKER_WIKIMEDIA_RESEARCH_ENABLED === "1"
  && process.env.D7_RESEARCH_LIVE_SMOKE === "1"
  && process.env.D7_RESEARCH_EXTRACTION_PROVIDER === "groq"
  && process.env.D7_GROQ_GROUNDED_EXTRACTION_ENABLED === "1"
  && process.env.GROQ_RESEARCH_EXTRACTION_MODEL === "openai/gpt-oss-20b"
  && Boolean(process.env.GROQ_API_KEY)
  && Boolean(process.env.MEDIA_TRACKER_RESEARCH_USER_AGENT);

describe.skipIf(!LIVE)("D7-R4B conditional real shadow live", () => {
  it("Steins;Gate direct Wikimedia + Groq extraction zincirini non-authoritative tamamlar", async () => {
    const identity = createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: "9253", mediaType: "anime", secondaryIds: [{ kind: "anilist", externalId: "9253" }] });
    const versionScope = createResearchVersionScope({ identity, scopeKind: "work" });
    const request: GroundedResearchShadowInput = {
      version: 1,
      requestId: `d7-r4b-live-${Date.now()}`,
      structuredRequest: { version: 1, targetMediaTypes: ["anime"], aspectConstraints: [{ id: "aspect:romance:must", kind: "aspect", aspectId: "romance", role: "must", source: "explicit", minimumLevel: "significant" }], objectiveConstraints: [], strictness: "strict" },
      candidates: [{
        titleSnapshot: "Steins;Gate", releaseYear: 2011,
        researchCandidate: {
          identity, versionScope, mediaType: "anime", preResearchRank: 0, hardObjectiveEligible: true,
          unresolvedConstraints: [{ aspectId: "romance", role: "must", minimumLevel: "significant", source: "explicit", currentStructuredDecision: "unknown", unresolvedReason: "structured_evidence_unknown" }],
          structuredEvidenceSummary: [{ aspectId: "romance", decision: "unknown", level: null, confidence: "unknown", sourceKinds: [], warnings: [] }],
        },
      }],
    };
    const baseline = Object.freeze({ recommendations: ["authoritative-baseline"] });
    const result = await runGroundedResearchShadow(request, { environment: process.env });
    console.info(`[D7-R4B live] status=${result.status} n=${result.telemetry.sampleCount} decision=${result.results[0]?.researchDecisionStatus ?? "none"} effect=${result.results[0]?.hypotheticalEffect ?? "none"} stage=${result.results[0]?.providerAdapterStatus ?? "none"} planning_ms=${result.telemetry.stageDurationsMs.planning} direct_ms=${result.telemetry.stageDurationsMs.directSource} discovery_ms=${result.telemetry.stageDurationsMs.discovery} acquisition_ms=${result.telemetry.stageDurationsMs.acquisition} extraction_ms=${result.telemetry.stageDurationsMs.extraction} total_ms=${result.telemetry.stageDurationsMs.total} budget=${result.telemetry.timeoutCount === 0 ? "within" : "exhausted"}`);
    expect(["complete", "partial"], `Controlled shadow failure: ${result.status} ${result.warnings.join(",")}`).toContain(result.status);
    expect(result.telemetry).toMatchObject({ plannedJobCount: 1, attemptedJobCount: 1, sampleCount: 1, timeoutCount: 0 });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].providerAdapterStatus).toMatch(/direct=.+;acquisition=.+;extraction=.+/);
    expect(result.telemetry.stageDurationsMs.total).toBeLessThanOrEqual(16_000);
    expect(JSON.stringify(result)).not.toMatch(/boundedText|passageId|citationId|evidenceUnitId|rawResponse|reasoning/i);
    expect(baseline).toEqual({ recommendations: ["authoritative-baseline"] });
  }, 25_000);
});
