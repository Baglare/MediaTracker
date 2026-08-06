import { describe, expect, it } from "vitest";
import { aggregateAspectEvidence } from "@/features/recommendations/evidence";
import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import type { CandidateProviderEvidenceSnapshot, RawProviderEvidenceClaim } from "@/features/recommendations/providers/types";
import type { AspectId, RecommendationProvider } from "@/features/recommendations/domain";

function snapshot(input: {
  provider?: RecommendationProvider;
  claims?: RawProviderEvidenceClaim[];
  tags?: { name: string; rank?: number }[];
  popularity?: number;
} = {}): CandidateProviderEvidenceSnapshot {
  const provider = input.provider ?? "anilist";
  const mediaType = provider === "openlibrary" ? "book" : provider === "tmdb" ? "movie" : "anime";
  return {
    schemaVersion: 1,
    candidateIdentity: createVerifiedCandidateIdentity({ primaryProvider: provider, primaryExternalId: "d661", mediaType }),
    objectiveMetadata: { mediaType, tags: input.tags, popularity: input.popularity },
    rawEvidenceClaims: input.claims ?? [],
    providerCoverage: { [provider]: "available" }, missingFields: [], fetchedAt: "2026-08-06T00:00:00.000Z", cacheStatus: "miss", warnings: [],
  };
}

function tagClaim(id: string, aspectId: AspectId, value = "Political Intrigue"): RawProviderEvidenceClaim {
  return { id, sourceKind: "provider_tag_rank", scope: "candidate_metadata", provider: "anilist", field: "tags", value, normalizedValue: value.toLocaleLowerCase("en-US"), reliability: 0.9, mappedAspectIds: [aspectId] };
}

function keywordClaim(id: string, provider: "tmdb" | "openlibrary", aspectId: AspectId, value: string, field = "keywords"): RawProviderEvidenceClaim {
  return { id, sourceKind: "provider_keyword", scope: "candidate_metadata", provider, field, value, normalizedValue: value.toLocaleLowerCase("en-US"), reliability: provider === "tmdb" ? 0.82 : 0.55, mappedAspectIds: [aspectId] };
}

describe("D6.6-1 ranked-tag and structured evidence policy", () => {
  it.each([
    [90, "significant", "high"],
    [70, "significant", "high"],
    [50, "significant", "medium"],
    [30, "incidental", "low"],
  ] as const)("political tag rank %s -> %s/%s", (rank, level, confidence) => {
    const evidence = aggregateAspectEvidence({ snapshot: snapshot({ tags: [{ name: "Political Intrigue", rank }], claims: [tagClaim("p", "political_intrigue")] }) }).get("political_intrigue");
    expect(evidence).toMatchObject({ level, confidence });
    expect(evidence?.strength).toBeLessThan(0.75);
  });

  it("rank 20 altını contribution dışında ve unknown bırakır", () => {
    const evidence = aggregateAspectEvidence({ snapshot: snapshot({ tags: [{ name: "Political Intrigue", rank: 10 }], claims: [tagClaim("p", "political_intrigue")] }) }).get("political_intrigue");
    expect(evidence).toMatchObject({ level: "unknown", confidence: "unknown" });
    expect(evidence?.warnings).toContain("ranked_tag_below_contribution:political_intrigue:p");
  });

  it("claim yokluğunu absent değil unknown bırakır", () => {
    expect(aggregateAspectEvidence({ snapshot: snapshot() }).get("political_intrigue")).toMatchObject({ level: "unknown", confidence: "unknown" });
  });

  it("aynı tag duplicate claim ile confidence veya strength şişirmez", () => {
    const tags = [{ name: "Political Intrigue", rank: 70 }];
    const one = aggregateAspectEvidence({ snapshot: snapshot({ tags, claims: [tagClaim("p1", "political_intrigue")] }) }).get("political_intrigue");
    const duplicate = aggregateAspectEvidence({ snapshot: snapshot({ tags, claims: [tagClaim("p1", "political_intrigue"), tagClaim("p2", "political_intrigue")] }) }).get("political_intrigue");
    expect(duplicate?.strength).toBe(one?.strength);
    expect(duplicate?.confidence).toBe(one?.confidence);
  });

  it("aynı provider/field farklı tag'leri bounded birleştirir ama primary yapmaz", () => {
    const evidence = aggregateAspectEvidence({ snapshot: snapshot({
      tags: [{ name: "Political Intrigue", rank: 90 }, { name: "Court Politics", rank: 88 }],
      claims: [tagClaim("p1", "political_intrigue"), tagClaim("p2", "political_intrigue", "Court Politics")],
    }) }).get("political_intrigue");
    expect(evidence).toMatchObject({ level: "significant", confidence: "high" });
  });

  it("contradiction ranked-tag confidence'ını bir kademe düşürür", () => {
    const evidence = aggregateAspectEvidence({
      snapshot: snapshot({ tags: [{ name: "Political Intrigue", rank: 90 }], claims: [tagClaim("p", "political_intrigue")] }),
      semantic: { mode: "local_enhanced", supporting: {}, contradictory: { political_intrigue: [{ id: "no", sourceKind: "local_semantic_verifier", scope: "candidate_metadata", reliability: 0.8 }] }, warnings: [] },
    }).get("political_intrigue");
    expect(evidence).toMatchObject({ level: "significant", confidence: "medium" });
  });

  it("semantic-required aspect'i gerçek verifier olmadan structured tag'den üretmez", () => {
    const evidence = aggregateAspectEvidence({ snapshot: snapshot({ tags: [{ name: "Character Driven", rank: 95 }], claims: [tagClaim("character", "character_driven", "Character Driven")] }) }).get("character_driven");
    expect(evidence).toMatchObject({ level: "unknown", confidence: "unknown" });
  });

  it("TMDB tek keyword'ünü incidental/low ile sınırlar", () => {
    const evidence = aggregateAspectEvidence({ snapshot: snapshot({ provider: "tmdb", claims: [keywordClaim("k1", "tmdb", "political_intrigue", "Political Intrigue")] }) }).get("political_intrigue");
    expect(evidence).toMatchObject({ level: "incidental", confidence: "low" });
  });

  it("TMDB bağımsız iki mapped keyword'ü significant/medium yapabilir", () => {
    const evidence = aggregateAspectEvidence({ snapshot: snapshot({ provider: "tmdb", claims: [
      keywordClaim("k1", "tmdb", "political_intrigue", "Political Intrigue"),
      keywordClaim("k2", "tmdb", "political_intrigue", "Court Politics"),
    ] }) }).get("political_intrigue");
    expect(evidence).toMatchObject({ level: "significant", confidence: "medium" });
  });

  it("Open Library subject-only claim'ini hard evidence değil partial/low tutar", () => {
    const evidence = aggregateAspectEvidence({ snapshot: snapshot({ provider: "openlibrary", claims: [keywordClaim("s1", "openlibrary", "fantasy", "Fantasy", "subjects")] }) }).get("fantasy");
    expect(evidence).toMatchObject({ level: "incidental", confidence: "low" });
  });

  it("popularity/community alanından aspect evidence üretmez", () => {
    expect(aggregateAspectEvidence({ snapshot: snapshot({ popularity: 999_999 }) }).get("political_intrigue")).toMatchObject({ level: "unknown" });
  });
});
