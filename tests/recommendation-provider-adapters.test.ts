import { describe, expect, it } from "vitest";
import { normalizeAniListMedia } from "@/lib/anilist";
import { normalizeSearchResult as normalizeTvmazeSearchResult } from "@/app/api/tvmaze/search/route";
import { normalizeMovieResult, normalizeTvResult } from "@/app/api/tmdb/search/route";
import { normalizeDoc } from "@/app/api/openlibrary/search/route";
import { adaptAniListEvidence } from "@/features/recommendations/providers/anilist-adapter";
import { adaptOmdbEvidence } from "@/features/recommendations/providers/omdb-adapter";
import { adaptOpenLibraryEvidence } from "@/features/recommendations/providers/openlibrary-adapter";
import { adaptTmdbEvidence } from "@/features/recommendations/providers/tmdb-adapter";
import { adaptTvmazeRecommendationEvidence } from "@/features/recommendations/providers/tvmaze-adapter";

describe("D6-2 provider adapters", () => {
  it("AniList tag metadata ve spoiler bayraklarını korur; rank'i strength yapmaz", () => {
    const normalized = normalizeAniListMedia({
      id: 1, type: "ANIME", title: { english: "Example" }, genres: ["Romance"],
      format: "TV", status: "FINISHED", episodes: 12, countryOfOrigin: "JP",
      tags: [{ name: "Love Triangle", rank: 78, category: "Romance", isMediaSpoiler: true }],
    });
    const snapshot = adaptAniListEvidence(normalized, "2026-01-01T00:00:00.000Z");
    expect(snapshot.objectiveMetadata.tags?.[0]).toMatchObject({ name: "Love Triangle", rank: 78, isMediaSpoiler: true });
    const tagClaim = snapshot.rawEvidenceClaims.find((claim) => claim.sourceKind === "provider_tag_rank");
    expect(tagClaim).toBeDefined();
    expect(tagClaim).not.toHaveProperty("strength");
    expect(tagClaim).not.toHaveProperty("level");
    expect(snapshot.objectiveMetadata).toMatchObject({ format: "TV", releaseStatus: "FINISHED", episodeCount: 12 });
  });

  it("bilinmeyen AniList tag'ini aspect'e zorlamaz", () => {
    const snapshot = adaptAniListEvidence(normalizeAniListMedia({
      id: 2, type: "ANIME", title: { romaji: "X" }, tags: [{ name: "Very Specific Unknown Tag", rank: 90 }],
    }));
    expect(snapshot.rawEvidenceClaims[0]).toMatchObject({ mappedAspectIds: [] });
  });

  it("TVMaze global normalizer anime kaydını filtrelemeden classifier alanlarını korur", () => {
    const result = normalizeTvmazeSearchResult({ score: 1, show: {
      id: 10, name: "Anime fixture", type: "Animation", genres: ["Anime"], language: "Japanese",
      network: { id: 1, name: "JP", country: { name: "Japan", code: "JP" } },
      externals: { imdb: "tt1234567", thetvdb: 42 },
    } });
    expect(result).toMatchObject({ showType: "Animation", networkCountryCode: "JP", imdbId: "tt1234567", theTvdbId: "42" });
    expect(adaptTvmazeRecommendationEvidence(result).keep).toBe(false);
  });

  it("Batı animasyonunu recommendation TV havuzunda tutar", () => {
    const result = normalizeTvmazeSearchResult({ score: 1, show: {
      id: 11, name: "Western", type: "Animation", genres: ["Comedy"], language: "English",
      network: { id: 2, name: "US", country: { name: "United States", code: "US" } },
    } });
    const decision = adaptTvmazeRecommendationEvidence(result);
    expect(decision.keep).toBe(true);
    expect(decision.classification.classification).toBe("non_anime");
  });

  it("TMDB movie ve TV arama normalizer'ları backward-compatible exact identity üretir", () => {
    const movie = normalizeMovieResult({ id: 20, title: "Film", original_title: "Film Original", release_date: "2020-01-01", overview: "Plot", vote_average: 7.5, popularity: 9 });
    const tv = normalizeTvResult({ id: 21, name: "Show", first_air_date: "2021-01-01", origin_country: ["US"], original_language: "en" });
    expect(movie).toMatchObject({ externalId: "20", type: "movie", averageScore: 75 });
    expect(tv).toMatchObject({ externalId: "21", type: "tv", countries: ["US"] });
  });

  it("TMDB keyword ve exact external ID evidence'ını taşır", () => {
    const snapshot = adaptTmdbEvidence({
      externalSource: "tmdb", externalId: "20", type: "movie", title: "Film", totalProgress: 1,
      genres: ["Fantasy"], keywords: [{ id: 1, name: "time travel" }], imdbId: "tt7654321",
    });
    expect(snapshot.candidateIdentity.secondaryIds).toContainEqual({ kind: "imdb", externalId: "tt7654321" });
    expect(snapshot.rawEvidenceClaims.map((claim) => claim.sourceKind)).toEqual(expect.arrayContaining(["provider_genre", "provider_keyword"]));
  });

  it("OMDb'yi IMDb exact identity ile partial secondary evidence yapar", () => {
    const snapshot = adaptOmdbEvidence({ externalSource: "omdb", externalId: "tt1111111", type: "movie", title: "Film", totalProgress: 1, genres: ["Drama"] });
    expect(snapshot.providerCoverage.omdb).toBe("partial");
    expect(snapshot.candidateIdentity.secondaryIds).toContainEqual({ kind: "imdb", externalId: "tt1111111" });
  });

  it("Open Library work ve edition kimliğini ayırır", () => {
    const result = normalizeDoc({ key: "/works/OL1W", title: "Book", edition_key: ["OL2M"], subject: ["Fantasy"], number_of_pages_median: 321 });
    const snapshot = adaptOpenLibraryEvidence(result);
    expect(result).toMatchObject({ externalId: "/works/OL1W", workId: "/works/OL1W", editionId: "/books/OL2M" });
    expect(snapshot.candidateIdentity.secondaryIds).toEqual(expect.arrayContaining([
      { kind: "openlibrary_work", externalId: "/works/OL1W" },
      { kind: "openlibrary_edition", externalId: "/books/OL2M" },
    ]));
    expect(snapshot.missingFields).toContain("description");
  });
});
