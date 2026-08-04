import { describe, expect, it, vi } from "vitest";
import { createVerifiedCandidateIdentity, evaluateExactIdentityLink } from "@/features/recommendations/providers/candidate-identity";
import { ProviderEvidenceCache, providerEvidenceCacheKey } from "@/features/recommendations/providers/evidence-cache";
import { adaptOmdbEvidence } from "@/features/recommendations/providers/omdb-adapter";

const identity = (provider: "tmdb" | "omdb" | "tvmaze" | "openlibrary", externalId: string, type: "movie" | "tv" | "book", secondaryIds: { kind: "imdb" | "thetvdb" | "openlibrary_work"; externalId: string }[] = []) =>
  createVerifiedCandidateIdentity({ primaryProvider: provider, primaryExternalId: externalId, mediaType: type, secondaryIds });

describe("D6-2 exact identity policy", () => {
  it("same provider + same id bağlar", () => {
    expect(evaluateExactIdentityLink(identity("tmdb", "1", "movie"), identity("tmdb", "1", "movie"))).toMatchObject({ link: true, reason: "same_provider_id" });
  });

  it("TMDB/OMDb aynı IMDb id ile bağlanır", () => {
    expect(evaluateExactIdentityLink(
      identity("tmdb", "1", "movie", [{ kind: "imdb", externalId: "tt1" }]),
      identity("omdb", "tt1", "movie", [{ kind: "imdb", externalId: "tt1" }]),
    )).toMatchObject({ link: true, reason: "exact_imdb" });
  });

  it("TMDB/TVMaze aynı TheTVDB ile bağlanır", () => {
    expect(evaluateExactIdentityLink(
      identity("tmdb", "1", "tv", [{ kind: "thetvdb", externalId: "42" }]),
      identity("tvmaze", "2", "tv", [{ kind: "thetvdb", externalId: "42" }]),
    )).toMatchObject({ link: true, reason: "exact_thetvdb" });
  });

  it("title/year olmadığı için exact bridge yoksa bağlamaz", () => {
    expect(evaluateExactIdentityLink(identity("tmdb", "1", "movie"), identity("omdb", "tt2", "movie"))).toMatchObject({ link: false, reason: "no_exact_bridge" });
  });

  it("eşleşen ve çelişen exact id birlikteyse merge etmez", () => {
    expect(evaluateExactIdentityLink(
      identity("tmdb", "1", "tv", [{ kind: "imdb", externalId: "tt1" }, { kind: "thetvdb", externalId: "10" }]),
      identity("tvmaze", "2", "tv", [{ kind: "imdb", externalId: "tt1" }, { kind: "thetvdb", externalId: "11" }]),
    )).toMatchObject({ link: false, reason: "identity_conflict", warning: "conflicting_exact_identity:thetvdb" });
  });
});

describe("D6-2 provider evidence cache", () => {
  it("stable schema-versioned key üretir", () => {
    expect(providerEvidenceCacheKey({ provider: "omdb", mediaType: "movie", externalId: "tt1" })).toBe("omdb:movie:tt1:1");
  });

  it("hit, TTL ve bounded LRU davranışını uygular", () => {
    let now = 100;
    const cache = new ProviderEvidenceCache(1, () => now);
    const first = adaptOmdbEvidence({ externalSource: "omdb", externalId: "tt1", type: "movie", title: "A", totalProgress: 1 });
    const second = adaptOmdbEvidence({ externalSource: "omdb", externalId: "tt2", type: "movie", title: "B", totalProgress: 1 });
    expect(cache.set("a", first, 10)).toBe(true);
    expect(cache.get("a")?.cacheStatus).toBe("hit");
    cache.set("b", second, 10);
    expect(cache.get("a")).toBeNull();
    now = 111;
    expect(cache.get("b")).toBeNull();
  });

  it("aynı request'i coalesce eder", async () => {
    const cache = new ProviderEvidenceCache();
    const loader = vi.fn(async () => adaptOmdbEvidence({ externalSource: "omdb", externalId: "tt3", type: "movie", title: "C", totalProgress: 1 }));
    await Promise.all([cache.getOrLoad("c", loader), cache.getOrLoad("c", loader)]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("bozuk snapshot ve user feedback claim'ini cache'e almaz", () => {
    const cache = new ProviderEvidenceCache();
    expect(cache.set("bad", { schemaVersion: 999 } as never)).toBe(false);
    const snapshot = adaptOmdbEvidence({ externalSource: "omdb", externalId: "tt4", type: "movie", title: "D", totalProgress: 1 });
    expect(cache.set("owner", { ...snapshot, rawEvidenceClaims: [{ id: "u", sourceKind: "user_feedback", scope: "personal_fit", mappedAspectIds: [] }] })).toBe(false);
    expect(cache.set("owner-field", { ...snapshot, personalNotes: "secret" } as never)).toBe(false);
  });

  it("başarısız loader'ı negative-cache etmez", async () => {
    const cache = new ProviderEvidenceCache();
    const loader = vi.fn().mockRejectedValueOnce(new Error("upstream")).mockResolvedValueOnce(adaptOmdbEvidence({ externalSource: "omdb", externalId: "tt5", type: "movie", title: "E", totalProgress: 1 }));
    await expect(cache.getOrLoad("e", loader)).rejects.toThrow("upstream");
    await expect(cache.getOrLoad("e", loader)).resolves.toBeDefined();
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
