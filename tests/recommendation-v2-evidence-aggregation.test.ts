import { describe, expect, it } from "vitest";
import { aggregateAspectEvidence } from "@/features/recommendations/evidence";
import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import type { CandidateProviderEvidenceSnapshot, RawProviderEvidenceClaim } from "@/features/recommendations/providers/types";

function snapshot(claims: RawProviderEvidenceClaim[], rank = 80): CandidateProviderEvidenceSnapshot {
  return {
    schemaVersion: 1,
    candidateIdentity: createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: "101", mediaType: "anime" }),
    objectiveMetadata: { mediaType: "anime", tags: [{ name: "Romance", rank }] },
    rawEvidenceClaims: claims,
    providerCoverage: { anilist: "available" }, missingFields: [], fetchedAt: "2026-08-04T00:00:00.000Z", cacheStatus: "miss", warnings: [],
  };
}

function claim(id: string, sourceKind: "provider_genre" | "provider_tag_rank", field: string, reliability: number): RawProviderEvidenceClaim {
  return { id, sourceKind, scope: "candidate_metadata", provider: "anilist", field, value: "Romance", normalizedValue: "romance", reliability, mappedAspectIds: ["romance"] };
}

describe("D6-3 aspect evidence aggregation", () => {
  it("genre ve tag rank'i bounded biçimde birleştirir; rank strength'in kendisi değildir", () => {
    const evidence = aggregateAspectEvidence({ snapshot: snapshot([claim("g", "provider_genre", "genres", 0.85), claim("t", "provider_tag_rank", "tags", 0.9)]) }).get("romance");
    expect(evidence?.strength).toBeGreaterThanOrEqual(0.5);
    expect(evidence?.strength).toBeLessThan(0.9);
    expect(evidence?.level).toBe("primary");
    expect(evidence?.confidence).toBe("high");
  });

  it("kanıt olmayan aspect'i absent değil unknown üretir", () => {
    const evidence = aggregateAspectEvidence({ snapshot: snapshot([]) }).get("love_triangle");
    expect(evidence).toMatchObject({ strength: null, level: "unknown", confidence: "unknown" });
  });

  it("duplicate claim'i iki kez saymaz", () => {
    const one = aggregateAspectEvidence({ snapshot: snapshot([claim("a", "provider_genre", "genres", 0.8)]) }).get("romance")?.strength;
    const duplicate = aggregateAspectEvidence({ snapshot: snapshot([claim("a", "provider_genre", "genres", 0.8), claim("b", "provider_genre", "genres", 0.8)]) }).get("romance")?.strength;
    expect(duplicate).toBe(one);
  });

  it("malformed tag rank'i reddeder ve warning taşır", () => {
    const evidence = aggregateAspectEvidence({ snapshot: snapshot([claim("t", "provider_tag_rank", "tags", 0.9)], 140) }).get("romance");
    expect(evidence).toMatchObject({ strength: null, level: "unknown" });
    expect(evidence?.warnings).toContain("malformed_tag_rank:t");
  });

  it("semantic contradiction supporting kanıtı silmeden confidence düşürür", () => {
    const contradictory = { id: "semantic-no", sourceKind: "local_semantic_verifier" as const, scope: "candidate_metadata" as const, reliability: 0.8 };
    const evidence = aggregateAspectEvidence({
      snapshot: snapshot([claim("g", "provider_genre", "genres", 0.85), claim("t", "provider_tag_rank", "tags", 0.9)]),
      semantic: { mode: "local_enhanced", supporting: {}, contradictory: { romance: [contradictory] }, warnings: [] },
    }).get("romance");
    expect(evidence?.supportingEvidence).toHaveLength(2);
    expect(evidence?.contradictoryEvidence).toHaveLength(1);
    expect(evidence?.confidence).toBe("medium");
  });

  it("merged snapshot'ta support seviyesini claim'in kendi provider'ından okur", () => {
    const base = snapshot([]);
    const merged: CandidateProviderEvidenceSnapshot = {
      ...base,
      candidateIdentity: createVerifiedCandidateIdentity({ primaryProvider: "tmdb", primaryExternalId: "501", mediaType: "movie" }),
      objectiveMetadata: { mediaType: "movie" },
      rawEvidenceClaims: [{ id: "omdb-power", sourceKind: "provider_keyword", scope: "candidate_metadata", provider: "omdb", field: "keywords", value: "power progression", normalizedValue: "power progression", reliability: 0.8, mappedAspectIds: ["power_progression"] }],
      providerCoverage: { tmdb: "available", omdb: "partial" },
    };
    expect(aggregateAspectEvidence({ snapshot: merged }).get("power_progression")).toMatchObject({ strength: null, level: "unknown" });
  });
});
