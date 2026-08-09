import { describe, expect, it } from "vitest";
import {
  aspectResearchCapabilityDistribution,
  ASPECT_RESEARCH_CAPABILITIES,
  buildResearchEvidenceCacheKey,
  DEFAULT_RESEARCH_BUDGET,
  decodeResearchCandidateInput,
  MemoryResearchEvidenceCache,
  planResearch,
  researchCachePolicyClass,
  validateAspectResearchCapabilities,
  validateResearchEvidenceCacheEntry,
} from "@/features/recommendations/research";
import { ASPECT_IDS } from "@/features/recommendations/domain";
import { cacheEntry, constraint, researchCandidate, researchDecision, researchIdentity, wikipediaCitation, workScope } from "./fixtures/recommendations-v2/grounded-research";

describe("D7-R1 43-aspect research capability", () => {
  it("43/43 complete ve registry ile exact eşleşir", () => {
    expect(validateAspectResearchCapabilities()).toMatchObject({ ok: true });
    expect(Object.keys(ASPECT_RESEARCH_CAPABILITIES).sort()).toEqual([...ASPECT_IDS].sort());
    expect(aspectResearchCapabilityDistribution()).toEqual({ none: 2, fallback: 16, required: 25, unsupported: 0 });
  });

  it("exact taxonomy, ranked tag ve semantic-required sınıflarını ayırır", () => {
    expect(ASPECT_RESEARCH_CAPABILITIES.sci_fi).toMatchObject({ structuredDecision: "sufficient", researchMode: "none" });
    expect(ASPECT_RESEARCH_CAPABILITIES.time_travel).toMatchObject({ structuredDecision: "partial", researchMode: "fallback" });
    expect(ASPECT_RESEARCH_CAPABILITIES.political_intrigue).toMatchObject({ structuredDecision: "partial", researchMode: "required_for_hard_decision" });
    expect(ASPECT_RESEARCH_CAPABILITIES.character_driven).toMatchObject({ structuredDecision: "unavailable", researchMode: "required_for_hard_decision" });
  });
});

describe("D7-R1 bounded deterministic planner", () => {
  it("default budget contract'ını sabitler", () => {
    expect(DEFAULT_RESEARCH_BUDGET).toEqual({ maxCandidates: 8, maxAspectsPerCandidate: 3, maxResearchJobs: 12, maxExternalSearchOperations: 6, maxConcurrentOperations: 2, totalTimeoutMs: 8000 });
  });

  it("explicit must → avoid → prefer → inferred önceliğini uygular ve profile prefer'i planlamaz", () => {
    const candidate = researchCandidate({ constraints: [
      constraint({ aspectId: "character_driven", role: "prefer", source: "inferred" }),
      constraint({ aspectId: "love_triangle", role: "avoid", source: "explicit" }),
      constraint({ aspectId: "romance", role: "prefer", source: "explicit" }),
      constraint({ aspectId: "political_intrigue", role: "must", source: "explicit" }),
      constraint({ aspectId: "dark", role: "prefer", source: "profile" }),
    ] });
    const plan = planResearch({ candidates: [candidate], budget: { ...DEFAULT_RESEARCH_BUDGET, maxAspectsPerCandidate: 3 } });
    expect(plan.jobs.map((job) => `${job.role}:${job.aspectId}`)).toEqual(["must:political_intrigue", "avoid:love_triangle", "prefer:romance"]);
    expect(plan.skipped).toEqual(expect.arrayContaining([expect.objectContaining({ aspectId: "dark", reason: "profile_research_disabled" })]));
  });

  it("aynı input için stable plan üretir, duplicate'i coalesce eder", () => {
    const duplicate = constraint({ aspectId: "romance" });
    const candidate = researchCandidate({ constraints: [duplicate, duplicate] });
    const first = planResearch({ candidates: [candidate] });
    const second = planResearch({ candidates: [candidate] });
    expect(first).toEqual(second);
    expect(first.jobs).toHaveLength(1);
    expect(first.skipped).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "duplicate_candidate_aspect" })]));
  });

  it("decisive evidence, invalid identity, objective reject ve unsupported target için job üretmez", () => {
    const decisive = researchCandidate({ constraints: [constraint({ aspectId: "romance", currentStructuredDecision: "decisive_supported" })] });
    const objectiveRejected = researchCandidate({ identity: researchIdentity({ externalId: "2" }), eligible: false });
    const movieIdentity = researchIdentity({ provider: "tmdb", externalId: "3", mediaType: "movie" });
    const unsupported = researchCandidate({ identity: movieIdentity, scope: workScope(movieIdentity), mediaType: "movie", constraints: [constraint({ aspectId: "power_progression" })] });
    const invalid = { ...researchCandidate({ identity: researchIdentity({ externalId: "4" }) }), identity: { ...researchIdentity({ externalId: "4" }), canonicalKey: "title:fuzzy" } } as never;
    const plan = planResearch({ candidates: [decisive, objectiveRejected, unsupported, invalid] });
    expect(plan.jobs).toHaveLength(0);
    expect(new Set(plan.skipped.map((item) => item.reason))).toEqual(new Set(["structured_evidence_decisive", "hard_objective_rejected", "unsupported_capability", "invalid_identity_scope"]));
  });

  it("candidate/aspect/job/search bütçelerini aşmaz ve popularity priority kabul etmez", () => {
    const aspects = ["romance", "political_intrigue", "love_triangle", "character_driven"] as const;
    const candidates = Array.from({ length: 10 }, (_, index) => {
      const identity = researchIdentity({ externalId: String(100 + index) });
      return researchCandidate({ identity, scope: workScope(identity), rank: index, constraints: aspects.map((aspectId) => constraint({ aspectId })) });
    });
    const plan = planResearch({ candidates });
    expect(new Set(plan.jobs.map((job) => job.candidateScope.scopeKey)).size).toBeLessThanOrEqual(8);
    expect(plan.jobs).toHaveLength(12);
    expect(plan.estimatedOperations).toBe(6);
    expect(Math.max(...plan.jobs.map((job) => job.budget.maxExternalSearchOperations))).toBe(1);
    expect(decodeResearchCandidateInput({ ...candidates[0], popularity: 999 })).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "research_unknown_field" })]) });
  });

  it("owner/private alanları codec seviyesinde reddeder", () => {
    expect(decodeResearchCandidateInput({ ...researchCandidate(), personalNotes: "secret" })).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "research_owner_data_forbidden" })]) });
  });
});

describe("D7-R1 research evidence cache", () => {
  it("stable key üretir; season ve policy version izolasyonu sağlar", () => {
    const identity = researchIdentity();
    const season1 = { ...workScope(identity), scopeKind: "season" as const, seasonNumber: 1, scopeKey: `research-scope:v1:season:${encodeURIComponent(identity.canonicalKey)}:season-1` };
    const season2 = { ...season1, seasonNumber: 2, scopeKey: `research-scope:v1:season:${encodeURIComponent(identity.canonicalKey)}:season-2` };
    const first = buildResearchEvidenceCacheKey({ versionScope: season1, aspectId: "romance" });
    expect(first).toEqual(buildResearchEvidenceCacheKey({ versionScope: season1, aspectId: "romance" }));
    expect(first.key).not.toBe(buildResearchEvidenceCacheKey({ versionScope: season2, aspectId: "romance" }).key);
    expect(first.key).not.toBe(buildResearchEvidenceCacheKey({ versionScope: season1, aspectId: "romance", researchPolicyVersion: "next" }).key);
  });

  it("raw passage/search response ve owner data cache value'ya giremez", () => {
    expect(validateResearchEvidenceCacheEntry({ ...cacheEntry(), transientDocument: { boundedText: "raw" } } as never)).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "research_cache_transient_payload_forbidden" })]) });
    expect(validateResearchEvidenceCacheEntry({ ...cacheEntry(), ownerId: "owner" } as never)).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "research_cache_owner_data_forbidden" })]) });
  });

  it("unknown kısa policy class alır; adapter error cache'lenmez", async () => {
    const unknown = cacheEntry({ decision: researchDecision({ status: "unknown", reasonCode: "passage_insufficient" }), claims: [], citations: [] });
    expect(researchCachePolicyClass(unknown)).toBe("unknown_short");
    const unavailable = cacheEntry({ decision: researchDecision({ status: "unknown", reasonCode: "adapter_unavailable" }), claims: [], citations: [] });
    expect(researchCachePolicyClass(unavailable)).toBe("not_cacheable");
    expect(await new MemoryResearchEvidenceCache().set(unavailable)).toBe(false);
  });

  it("bounded memory adapter get/delete ve scope/source revision invalidation uygular", async () => {
    const cache = new MemoryResearchEvidenceCache(128, () => Date.parse("2026-08-08T10:00:00.000Z"));
    const entry = cacheEntry();
    expect(await cache.set(entry)).toBe(true);
    expect(await cache.get(entry.key)).toMatchObject({ cacheStatus: "fresh" });
    expect(await cache.invalidateBySourceRevision({ sourceId: "wikipedia", revisionId: wikipediaCitation().revisionId })).toBe(1);
    await cache.set(entry);
    expect(await cache.invalidateByScope(entry.key.scopeKey)).toBe(1);
    expect(await cache.get(entry.key)).toBeNull();
  });
});
