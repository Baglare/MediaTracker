import { describe, expect, it } from "vitest";

vi.mock("server-only", () => ({}));

import { vi } from "vitest";
import {
  buildResearchEvidenceCacheKey,
  MemoryResearchEvidenceCache,
  RESEARCH_EVIDENCE_CACHE_DIRECT_TTL_MS,
  RESEARCH_EVIDENCE_CACHE_UNKNOWN_TTL_MS,
  researchCachePolicyClass,
  validateResearchEvidenceCacheEntry,
} from "@/features/recommendations/research";
import { cacheEntry, researchClaim, researchDecision, researchIdentity, wikipediaCitation, workScope } from "./fixtures/recommendations-v2/grounded-research";

describe("D7-R5C bounded evidence cache", () => {
  it("stable owner-independent key scope/aspect/policy version izolasyonu sağlar", () => {
    const identity = researchIdentity(); const scope = workScope(identity);
    const first = buildResearchEvidenceCacheKey({ versionScope: scope, aspectId: "romance", extractionPolicyVersion: "extract-a" });
    expect(first).toEqual(buildResearchEvidenceCacheKey({ versionScope: scope, aspectId: "romance", extractionPolicyVersion: "extract-a" }));
    expect(first.key).not.toBe(buildResearchEvidenceCacheKey({ versionScope: scope, aspectId: "romance", extractionPolicyVersion: "extract-b" }).key);
    expect(JSON.stringify(first)).not.toMatch(/owner|user|rating|note|progress|favorite|prompt|secret/i);
  });

  it("supported, contradicted ve kısa passage-insufficient sınıflarını ayırır", () => {
    expect(researchCachePolicyClass(cacheEntry())).toBe("direct_source_long");
    const contradicted = researchDecision({ status: "contradicted" });
    expect(validateResearchEvidenceCacheEntry(cacheEntry({ decision: contradicted, claims: [researchClaim({ polarity: "contradict" })] })).ok).toBe(true);
    const unknown = cacheEntry({ decision: researchDecision({ status: "unknown", reasonCode: "passage_insufficient" }), claims: [], citations: [] });
    expect(researchCachePolicyClass(unknown)).toBe("unknown_short");
    expect(RESEARCH_EVIDENCE_CACHE_DIRECT_TTL_MS).toBe(6 * 60 * 60 * 1_000);
    expect(RESEARCH_EVIDENCE_CACHE_UNKNOWN_TTL_MS).toBe(15 * 60 * 1_000);
  });

  it("capacity/grounding reason ve transient/raw payload cache'e giremez", async () => {
    const unavailable = cacheEntry({ decision: researchDecision({ status: "unknown", reasonCode: "adapter_unavailable" }), claims: [], citations: [] });
    expect(await new MemoryResearchEvidenceCache().set(unavailable)).toBe(false);
    for (const payload of [{ packet: {} }, { transientDocument: {} }, { passages: [] }, { evidenceUnits: [] }, { modelOutput: {} }, { rawResponse: {} }]) {
      expect(validateResearchEvidenceCacheEntry({ ...cacheEntry(), ...payload } as never).ok).toBe(false);
    }
  });

  it("injectable clock ile expiry, LRU ve scope/revision invalidation uygular", async () => {
    let now = Date.parse("2026-08-08T10:00:00.000Z");
    const cache = new MemoryResearchEvidenceCache(2, () => now);
    const make = (externalId: string) => {
      const identity = researchIdentity({ externalId }); const scope = workScope(identity);
      const decision = researchDecision({ scope });
      return { ...cacheEntry({ decision }), key: buildResearchEvidenceCacheKey({ versionScope: scope, aspectId: "romance" }) };
    };
    const first = make("1"); const second = make("2"); const third = make("3");
    await cache.set(first); await cache.set(second); await cache.get(first.key); await cache.set(third);
    expect(await cache.get(second.key)).toBeNull();
    expect(await cache.invalidateByScope(first.key.scopeKey)).toBe(1);
    await cache.set(third);
    expect(await cache.invalidateBySourceRevision({ sourceId: "wikipedia", revisionId: wikipediaCitation().revisionId })).toBe(1);
    await cache.set(first); now = Date.parse(first.expiresAt) + 1;
    expect(await cache.lookup(first.key)).toEqual({ status: "expired", entry: null });
  });
});
