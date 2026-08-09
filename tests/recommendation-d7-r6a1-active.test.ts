import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveResearchRolloutConfig } from "@/features/recommendations/research/shadow/config";
import { buildActiveResearchMerge } from "@/features/recommendations/research/active/merge";
import { runActiveGroundedRecommendation } from "@/features/recommendations/research/active/service";
import { runGroundedResearchActivePipeline } from "@/features/recommendations/research/shadow/orchestrator";
import { buildResearchEvidenceHandoff } from "@/features/recommendations/research/domain/decisions";
import { constraint as researchConstraint, researchCandidate, researchClaim, researchDecision, researchIdentity, wikipediaCitation, workScope } from "./fixtures/recommendations-v2/grounded-research";

const constraint = { id: "aspect:romance:must", kind: "aspect" as const, aspectId: "romance" as const, role: "must" as const, source: "explicit" as const, minimumLevel: "significant" as const };

function handoff() {
  const candidate = researchCandidate();
  return buildResearchEvidenceHandoff({ candidateIdentity: candidate.identity, versionScope: candidate.versionScope, decisions: [researchDecision()], claims: [researchClaim()], citations: [wikipediaCitation()], researchStatus: "complete" });
}

function response(recommendations: unknown[] = []) {
  return { assistantMessage: "ok", recommendations, transparencySummary: "bounded", engineStatus: { provider: "deterministic_v2" }, debug: { provider: "deterministic_v2" } } as never;
}

describe("D7-R6A1 active research integration", () => {
  it("rollout mode default disabled, legacy shadow compatible ve conflict fail-closed", () => {
    expect(resolveResearchRolloutConfig({} as NodeJS.ProcessEnv).mode).toBe("disabled");
    expect(resolveResearchRolloutConfig({ D7_RESEARCH_SHADOW_ENABLED: "1" } as NodeJS.ProcessEnv).mode).toBe("shadow");
    expect(resolveResearchRolloutConfig({ D7_RESEARCH_ROLLOUT_MODE: "active" } as NodeJS.ProcessEnv).mode).toBe("active");
    expect(resolveResearchRolloutConfig({ D7_RESEARCH_ROLLOUT_MODE: "active", D7_RESEARCH_SHADOW_ENABLED: "1" } as NodeJS.ProcessEnv)).toMatchObject({ mode: "disabled", conflict: true });
  });

  it("validated handoff mevcut mapper ile must override ve bounded evidence üretir", () => {
    const value = handoff();
    const merged = buildActiveResearchMerge({ handoffs: [value], constraints: [constraint] });
    const key = value.candidateIdentity.canonicalKey;
    expect(merged.constraintDecisionsByCandidateKey.get(key)?.get(constraint.id)).toMatchObject({ outcome: "passed", passed: true });
    expect(merged.aspectEvidenceByCandidateKey.get(key)?.get("romance")).toMatchObject({ level: "significant", confidence: "medium", verifierMode: "remote_enhanced" });
    expect(JSON.stringify(merged)).not.toMatch(/paraphrasedClaim|https?:|passage|prompt|owner|user/i);
  });

  it("supported avoid reject, explicit absence clear ve unknown no-op kalır", () => {
    const candidate = researchCandidate(); const citation = wikipediaCitation();
    const avoid = { ...constraint, id: "aspect:romance:avoid", role: "avoid" as const, rejectAtLevel: "significant" as const, minimumLevel: undefined };
    const supported = buildResearchEvidenceHandoff({ candidateIdentity: candidate.identity, versionScope: candidate.versionScope, decisions: [researchDecision()], claims: [researchClaim()], citations: [citation], researchStatus: "complete" });
    expect(buildActiveResearchMerge({ handoffs: [supported], constraints: [avoid] }).constraintDecisionsByCandidateKey.get(candidate.identity.canonicalKey)?.get(avoid.id)?.outcome).toBe("triggered_avoid");
    const contradicted = buildResearchEvidenceHandoff({ candidateIdentity: candidate.identity, versionScope: candidate.versionScope, decisions: [researchDecision({ status: "contradicted" })], claims: [researchClaim({ polarity: "contradict" })], citations: [citation], researchStatus: "complete" });
    expect(buildActiveResearchMerge({ handoffs: [contradicted], constraints: [avoid] }).constraintDecisionsByCandidateKey.get(candidate.identity.canonicalKey)?.get(avoid.id)?.outcome).toBe("passed");
    const unknown = buildResearchEvidenceHandoff({ candidateIdentity: candidate.identity, versionScope: candidate.versionScope, decisions: [researchDecision({ status: "unknown" })], claims: [], citations: [], researchStatus: "partial" });
    expect(buildActiveResearchMerge({ handoffs: [unknown], constraints: [constraint] }).constraintDecisionsByCandidateKey.size).toBe(0);
  });

  it("baseline -> research -> immutable final pass çalışır ve public response sidecar içermez", async () => {
    const candidate = researchCandidate();
    const context = { version: 1 as const, structuredRequest: { version: 1 as const, targetMediaTypes: ["anime" as const], aspectConstraints: [constraint], objectiveConstraints: [], strictness: "strict" as const }, candidates: [{ researchCandidate: candidate, titleSnapshot: "Public title" }] };
    const baseline = { response: response(), researchShadowContext: context };
    const final = { response: response([{ externalSource: candidate.identity.primaryProvider, externalId: candidate.identity.primaryExternalId }]), researchShadowContext: context };
    const runDeterministic = vi.fn().mockResolvedValueOnce(baseline).mockResolvedValueOnce(final);
    const runResearch = vi.fn(async () => ({ result: { results: [{ candidateIdentity: candidate.identity, aspectId: "romance", hypotheticalEffect: "would_satisfy_must" }] }, handoffs: [{ handoff: handoff(), cacheStatus: "miss" }] })) as never;
    const originalCandidates = Object.freeze([]);
    const engineInput = { intent: {}, retrievalPlan: null, settings: {}, candidates: originalCandidates, mediaItems: [], feedback: [], dismissed: [], message: "private", baseUrl: "http://local" } as never;
    const result = await runActiveGroundedRecommendation({ engineInput, requestId: "r6a1" }, { runDeterministic: runDeterministic as never, runResearch });
    expect(runDeterministic).toHaveBeenCalledTimes(2); expect(runResearch).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("active_applied"); expect(result.provenance[0].whetherResearchChangedOutcome).toBe("rescued_candidate");
    expect(result.execution.response).toBe(final.response); expect(JSON.stringify(result.execution.response)).not.toMatch(/citation|research|provenance|passage/i);
    expect(originalCandidates).toEqual([]);
  });

  it("provider failure ve parent abort baseline sonucu korur", async () => {
    const candidate = researchCandidate();
    const context = { version: 1 as const, structuredRequest: { version: 1 as const, targetMediaTypes: ["anime" as const], aspectConstraints: [constraint], objectiveConstraints: [], strictness: "strict" as const }, candidates: [{ researchCandidate: candidate, titleSnapshot: "Public title" }] };
    const baseline = { response: response(), researchShadowContext: context };
    const engineInput = { intent: {}, retrievalPlan: null, settings: {}, candidates: [], mediaItems: [], feedback: [], dismissed: [], message: "private", baseUrl: "http://local" } as never;
    const failed = await runActiveGroundedRecommendation({ engineInput, requestId: "fail" }, { runDeterministic: vi.fn(async () => baseline) as never, runResearch: vi.fn(async () => { throw new Error("raw provider"); }) as never });
    expect(failed.status).toBe("failed_soft"); expect(failed.execution.response).toBe(baseline.response);
    const controller = new AbortController(); controller.abort();
    const runResearch = vi.fn();
    const aborted = await runActiveGroundedRecommendation({ engineInput, requestId: "abort", signal: controller.signal }, { runDeterministic: vi.fn(async () => baseline) as never, runResearch: runResearch as never });
    expect(aborted.status).toBe("baseline"); expect(runResearch).not.toHaveBeenCalled();
  });

  it("active planner top-3/max-3 ve concurrency 2 sınırını korur", async () => {
    let active = 0; let peak = 0;
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    const directResearch = vi.fn(async () => {
      active += 1; peak = Math.max(peak, active);
      await gate;
      active -= 1;
      return { status: "identity_not_found", documents: [], citations: [], telemetry: {}, warnings: [] };
    });
    const candidates = ["9253", "1", "2", "3"].map((externalId, rank) => {
      const identity = researchIdentity({ externalId });
      return { researchCandidate: researchCandidate({ identity, scope: workScope(identity), rank, constraints: [researchConstraint({ aspectId: "romance" })] }), titleSnapshot: `Candidate ${rank}` };
    });
    const pending = runGroundedResearchActivePipeline({ version: 1, requestId: "budget", structuredRequest: { version: 1, targetMediaTypes: ["anime"], aspectConstraints: [constraint], objectiveConstraints: [], strictness: "strict" }, candidates }, { directResearch: directResearch as never });
    await vi.waitFor(() => expect(directResearch).toHaveBeenCalledTimes(2)); release();
    const result = await pending;
    expect(result.result.telemetry.plannedCandidateCount).toBe(3); expect(result.result.telemetry.plannedJobCount).toBe(3);
    expect(directResearch).toHaveBeenCalledTimes(3); expect(peak).toBeLessThanOrEqual(2);
  });
});
