import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decodeGroundedResearchShadowInput } from "@/features/recommendations/research/shadow/codec";
import { mapShadowHypotheticalEffect, runGroundedResearchShadow } from "@/features/recommendations/research/shadow/orchestrator";
import type { GroundedResearchShadowInput } from "@/features/recommendations/research/shadow/types";
import { constraint, researchCandidate, researchClaim, researchDecision, researchIdentity, wikipediaCitation, workScope } from "./fixtures/recommendations-v2/grounded-research";

function input(overrides: Partial<GroundedResearchShadowInput> = {}): GroundedResearchShadowInput {
  return {
    version: 1,
    requestId: "r4a-test",
    structuredRequest: {
      version: 1,
      targetMediaTypes: ["anime"],
      aspectConstraints: [{ id: "aspect:romance:must", kind: "aspect", aspectId: "romance", role: "must", minimumLevel: "significant", source: "explicit" }],
      objectiveConstraints: [],
      strictness: "strict",
    },
    candidates: [{ researchCandidate: researchCandidate(), titleSnapshot: "Steins;Gate", releaseYear: 2011 }],
    ...overrides,
  };
}

describe("D7-R4A grounded research shadow", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("flag kapalıyken codec/planner/provider zincirini çalıştırmaz", async () => {
    const plan = vi.fn();
    const directResearch = vi.fn();
    const result = await runGroundedResearchShadow({ ownerId: "private" }, { environment: {}, plan: plan as never, directResearch: directResearch as never });
    expect(result.status).toBe("disabled");
    expect(result.telemetry.plannerRan).toBe(false);
    expect(plan).not.toHaveBeenCalled();
    expect(directResearch).not.toHaveBeenCalled();
  });

  it("private ve raw kullanıcı alanlarını fail-closed reddeder", () => {
    for (const forbidden of [{ ownerId: "x" }, { note: "x" }, { queryText: "raw prompt" }, { feedback: [] }]) {
      const decoded = decodeGroundedResearchShadowInput({ ...input(), ...forbidden });
      expect(decoded.ok).toBe(false);
    }
  });

  it("yalnız explicit unresolved must/avoid işlerini planner'a verir", async () => {
    const candidate = researchCandidate({ constraints: [
      constraint({ aspectId: "romance", role: "must", source: "explicit", currentStructuredDecision: "unknown" }),
      constraint({ aspectId: "political_intrigue", role: "avoid", source: "explicit", currentStructuredDecision: "partial" }),
      constraint({ aspectId: "character_driven", role: "prefer", source: "explicit" }),
      constraint({ aspectId: "time_travel", role: "prefer", source: "profile" }),
      constraint({ aspectId: "slow_burn", role: "must", source: "inferred" }),
      constraint({ aspectId: "love_triangle", role: "avoid", source: "explicit", currentStructuredDecision: "decisive_contradicted" }),
    ] });
    const plan = vi.fn(() => ({ version: 1, jobs: [], skipped: [], telemetry: { inputCandidates: 1, eligibleCandidates: 1, plannedCandidates: 0, plannedJobs: 0, externalSearchOperations: 0, coalescedJobs: 0, skippedByReason: {}, estimatedCostUnits: 0, estimatedLatencyMs: 0 }, warnings: [] }));
    const result = await runGroundedResearchShadow(input({ candidates: [{ researchCandidate: candidate, titleSnapshot: "Steins;Gate" }] }), { environment: { D7_RESEARCH_SHADOW_ENABLED: "1" }, plan: plan as never });
    expect(result.status, JSON.stringify(result)).toBe("no_jobs");
    const planned = plan.mock.calls[0][0].candidates[0].unresolvedConstraints;
    expect(planned.map((item: { aspectId: string; role: string }) => `${item.aspectId}:${item.role}`)).toEqual(["romance:must", "political_intrigue:avoid"]);
  });

  it("top-2 candidate, candidate başına bir aspect ve toplam iki iş bütçesini uygular", async () => {
    const candidates = ["9253", "1", "2"].map((externalId, index) => {
      const identity = researchIdentity({ externalId });
      return { researchCandidate: researchCandidate({ identity, scope: workScope(identity), rank: index, constraints: [constraint({ aspectId: "romance" }), constraint({ aspectId: "time_travel" })] }), titleSnapshot: `Candidate ${index}` };
    });
    const directResearch = vi.fn(async () => ({ status: "identity_not_found", documents: [], citations: [], telemetry: {}, warnings: [] }));
    const result = await runGroundedResearchShadow(input({ candidates }), { environment: { D7_RESEARCH_SHADOW_ENABLED: "1" }, directResearch: directResearch as never });
    expect(result.telemetry.plannedCandidateCount, JSON.stringify(result)).toBe(2);
    expect(result.telemetry.plannedJobCount).toBe(2);
    expect(directResearch).toHaveBeenCalledTimes(2);
  });

  it("duplicate candidate/aspect işini bir kez yürütür", async () => {
    const same = input().candidates[0];
    const directResearch = vi.fn(async () => ({ status: "identity_not_found", documents: [], citations: [], telemetry: {}, warnings: [] }));
    const result = await runGroundedResearchShadow(input({ candidates: [same, same] }), { environment: { D7_RESEARCH_SHADOW_ENABLED: "1" }, directResearch: directResearch as never });
    expect(result.telemetry.plannedJobCount, JSON.stringify(result)).toBe(1);
    expect(directResearch).toHaveBeenCalledTimes(1);
  });

  it("invalid identity/scope inputunda provider çağrısı yapmaz", async () => {
    const broken = structuredClone(input()) as unknown as Record<string, unknown>;
    const candidates = broken.candidates as Array<{ researchCandidate: { versionScope: { canonicalKey: string } } }>;
    candidates[0].researchCandidate.versionScope.canonicalKey = "anilist:anime:other";
    const directResearch = vi.fn();
    const result = await runGroundedResearchShadow(broken, { environment: { D7_RESEARCH_SHADOW_ENABLED: "1" }, directResearch: directResearch as never });
    expect(result.status).toBe("invalid_input");
    expect(directResearch).not.toHaveBeenCalled();
  });

  it("existing deterministic handoff policy ile hypothetical effect üretir", () => {
    const citation = wikipediaCitation();
    const supported = researchDecision();
    const claim = researchClaim();
    expect(mapShadowHypotheticalEffect(supported, constraint({ aspectId: "romance", role: "must" }), [claim], [citation])).toBe("would_satisfy_must");
    expect(mapShadowHypotheticalEffect(supported, constraint({ aspectId: "romance", role: "avoid" }), [claim], [citation])).toBe("would_reject_avoid");
    const contradicted = researchDecision({ status: "contradicted", reasonCode: "explicit_source_absence" });
    const contradictingClaim = researchClaim({ polarity: "contradict" });
    expect(mapShadowHypotheticalEffect(contradicted, constraint({ aspectId: "romance", role: "avoid" }), [contradictingClaim], [citation])).toBe("would_clear_avoid");
    expect(mapShadowHypotheticalEffect(researchDecision({ status: "unknown" }), constraint({ aspectId: "romance", role: "must" }), [], [])).toBe("would_remain_unknown");
  });

  it("parent abort durumunda baseline-safe sonuç döndürür", async () => {
    const controller = new AbortController(); controller.abort();
    const directResearch = vi.fn();
    const result = await runGroundedResearchShadow(input({ signal: controller.signal }), { environment: { D7_RESEARCH_SHADOW_ENABLED: "1" }, directResearch: directResearch as never });
    expect(result.status).toBe("aborted");
    expect(directResearch).not.toHaveBeenCalled();
  });
});
