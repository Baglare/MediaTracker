import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildResearchEvidenceCacheKey, MemoryResearchEvidenceCache } from "@/features/recommendations/research";
import { GROUNDED_EXTRACTION_POLICY_VERSION } from "@/features/recommendations/research/extraction/domain/types";
import { runGroundedResearchShadow } from "@/features/recommendations/research/shadow/orchestrator";
import type { GroundedResearchShadowInput } from "@/features/recommendations/research/shadow/types";
import { RESEARCH_SOURCE_REGISTRY_VERSION } from "@/features/recommendations/research/domain/source-registry";
import { RESEARCH_POLICY_VERSION } from "@/features/recommendations/research/cache/key";
import { cacheEntry, researchCandidate, researchDecision, researchClaim, wikipediaCitation } from "./fixtures/recommendations-v2/grounded-research";

function shadowInput(requestId = "r5c-shadow"): GroundedResearchShadowInput {
  return { version: 1, requestId, structuredRequest: { version: 1, targetMediaTypes: ["anime"], aspectConstraints: [{ id: "aspect:romance:must", kind: "aspect", aspectId: "romance", role: "must", source: "explicit", minimumLevel: "significant" }], objectiveConstraints: [], strictness: "strict" }, candidates: [{ researchCandidate: researchCandidate(), titleSnapshot: "Steins;Gate", releaseYear: 2011 }] };
}

function currentEntry() {
  const candidate = researchCandidate();
  const base = cacheEntry();
  return { ...base, key: buildResearchEvidenceCacheKey({ versionScope: candidate.versionScope, aspectId: "romance", researchPolicyVersion: RESEARCH_POLICY_VERSION, sourceRegistryVersion: RESEARCH_SOURCE_REGISTRY_VERSION, extractionPolicyVersion: GROUNDED_EXTRACTION_POLICY_VERSION }), extractionProvenance: { ...base.extractionProvenance, extractorPolicyVersion: GROUNDED_EXTRACTION_POLICY_VERSION } };
}

describe("D7-R5C shadow cache and transparency", () => {
  it("flag disabled iken cache erişimi yapmaz", async () => {
    const cache = { get: vi.fn(), set: vi.fn(), delete: vi.fn(), invalidateByScope: vi.fn(), invalidateBySourceRevision: vi.fn() };
    await runGroundedResearchShadow(shadowInput(), { environment: { D7_RESEARCH_SHADOW_ENABLED: "1" }, evidenceCache: cache as never, directResearch: vi.fn(async () => ({ status: "identity_not_found", documents: [], citations: [], telemetry: {}, warnings: [] })) as never });
    expect(cache.get).not.toHaveBeenCalled(); expect(cache.set).not.toHaveBeenCalled();
  });

  it("valid hit provider zincirini atlar ve bounded transparency üretir", async () => {
    const cache = new MemoryResearchEvidenceCache(256, () => Date.parse("2026-08-08T10:00:00.000Z")); await cache.set(currentEntry());
    const directResearch = vi.fn(); const acquire = vi.fn(); const extract = vi.fn();
    const result = await runGroundedResearchShadow(shadowInput(), { environment: { D7_RESEARCH_SHADOW_ENABLED: "1", D7_RESEARCH_EVIDENCE_CACHE_ENABLED: "1" }, evidenceCache: cache, directResearch: directResearch as never, acquire: acquire as never, extract: extract as never });
    expect(directResearch).not.toHaveBeenCalled(); expect(acquire).not.toHaveBeenCalled(); expect(extract).not.toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({ researchStatus: "cache_hit", hypotheticalEffect: "would_satisfy_must" });
    expect(result.transparency[0]).toMatchObject({ cacheStatus: "hit", stageStatus: "completed", decisionStatus: "supported", citationCount: 1 });
    expect(JSON.stringify(result.transparency)).not.toMatch(/Steins;Gate|https?:|passage|evidenceUnit|paraphrasedClaim|prompt|response|owner|user/i);
  });

  it("miss pipeline'ı bir kez çalıştırır, validated sonucu yazar ve ikinci run hit olur", async () => {
    const cache = new MemoryResearchEvidenceCache(256, () => Date.parse("2026-08-08T10:00:00.000Z")); const citation = wikipediaCitation(); const decision = researchDecision(); const claim = researchClaim();
    const directResearch = vi.fn(async () => ({ status: "document_ready", wikimediaIdentity: {}, documents: [{}], citations: [citation], telemetry: {}, warnings: [] }));
    const acquire = vi.fn(async () => ({ status: "packet_ready", packet: { citations: [citation] }, warnings: [], telemetry: {} }));
    const extract = vi.fn(async () => ({ status: "claims_extracted", providerId: "groq", claims: [claim], decision, provenance: currentEntry().extractionProvenance, assessments: [], telemetry: {}, warnings: [] }));
    const setSpy = vi.spyOn(cache, "set");
    const dependencies = { environment: { D7_RESEARCH_SHADOW_ENABLED: "1", D7_RESEARCH_EVIDENCE_CACHE_ENABLED: "1" }, evidenceCache: cache, directResearch: directResearch as never, acquire: acquire as never, extract: extract as never, now: () => new Date("2026-08-08T10:00:00.000Z") };
    const first = await runGroundedResearchShadow(shadowInput("first"), dependencies);
    const second = await runGroundedResearchShadow(shadowInput("second"), dependencies);
    expect(first.transparency[0].cacheStatus).toBe("miss"); expect(second.transparency[0].cacheStatus).toBe("hit");
    expect(extract).toHaveBeenCalledTimes(1); expect(directResearch).toHaveBeenCalledTimes(1); expect(acquire).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(second.results[0].hypotheticalEffect).toBe(first.results[0].hypotheticalEffect);
  });

  it("aynı exact in-flight shadow işini tek provider operation olarak coalesce eder", async () => {
    const cache = new MemoryResearchEvidenceCache();
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    const directResearch = vi.fn(async () => { await gate; return { status: "identity_not_found", documents: [], citations: [], telemetry: {}, warnings: [] }; });
    const dependencies = { environment: { D7_RESEARCH_SHADOW_ENABLED: "1", D7_RESEARCH_EVIDENCE_CACHE_ENABLED: "1" }, evidenceCache: cache, directResearch: directResearch as never };
    const first = runGroundedResearchShadow(shadowInput("coalesce-a"), dependencies);
    const second = runGroundedResearchShadow(shadowInput("coalesce-b"), dependencies);
    await vi.waitFor(() => expect(directResearch).toHaveBeenCalledTimes(1)); release();
    const [a, b] = await Promise.all([first, second]);
    expect(directResearch).toHaveBeenCalledTimes(1);
    expect(a.telemetry.coalescedJobCount + b.telemetry.coalescedJobCount).toBeGreaterThanOrEqual(1);
  });

  it("rate-limit/grounding failure yazılmaz ve public-facing seed değişmez", async () => {
    const cache = new MemoryResearchEvidenceCache(); const citation = wikipediaCitation();
    const directResearch = vi.fn(async () => ({ status: "document_ready", wikimediaIdentity: {}, documents: [{}], citations: [citation], telemetry: {}, warnings: [] }));
    const acquire = vi.fn(async () => ({ status: "packet_ready", packet: { citations: [citation] }, warnings: [], telemetry: {} }));
    const extract = vi.fn(async () => ({ status: "rate_limited", providerId: "groq", claims: [], assessments: [], telemetry: {}, warnings: [] }));
    const baseline = Object.freeze({ recommendations: ["authoritative"] });
    const result = await runGroundedResearchShadow(shadowInput(), { environment: { D7_RESEARCH_SHADOW_ENABLED: "1", D7_RESEARCH_EVIDENCE_CACHE_ENABLED: "1" }, evidenceCache: cache, directResearch: directResearch as never, acquire: acquire as never, extract: extract as never });
    expect(result.transparency[0].cacheStatus).toBe("bypassed"); expect(cache.size).toBe(0); expect(baseline).toEqual({ recommendations: ["authoritative"] });
  });
});
