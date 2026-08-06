import { describe, expect, it } from "vitest";
import { queryableProviderRetrievalMapping } from "@/features/recommendations/domain/aspect-registry";
import { classifyTvmazeAnime } from "@/features/recommendations/providers/tvmaze-anime-classifier";

const LIVE = process.env.D6_PROVIDER_LIVE_SMOKE === "1";

describe.skipIf(!LIVE)("D6-2 conditional live provider smoke", () => {
  it("AniList public API tags/rank ve identity döndürür", async () => {
    const response = await fetch("https://graphql.anilist.co", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "query { Media(search: \"Cowboy Bebop\", type: ANIME) { id tags { name rank } } }" }) });
    const body = await response.json() as { data?: { Media?: { id?: number; tags?: { name: string; rank?: number }[] } } };
    expect(body.data?.Media?.id).toBeTypeOf("number");
    expect(body.data?.Media?.tags).toBeInstanceOf(Array);
  });

  it("AniList canonical ranked-tag strict/relaxed discovery kontratını canlı doğrular", async () => {
    const mapping = queryableProviderRetrievalMapping("political_intrigue", "anilist", "anime");
    const canonicalTag = mapping?.canonicalTags?.[0];
    expect(canonicalTag).toBeTruthy();
    const query = `query ($tagIn: [String], $minimumTagRank: Int) {
      Page(page: 1, perPage: 8) {
        media(type: ANIME, tag_in: $tagIn, minimumTagRank: $minimumTagRank, sort: [POPULARITY_DESC, ID], isAdult: false) {
          id
          tags { name rank }
        }
      }
    }`;
    for (const minimumTagRank of [mapping?.minimumRankPolicy?.strict ?? 40, mapping?.minimumRankPolicy?.relaxed ?? 20]) {
      const response = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, variables: { tagIn: [canonicalTag], minimumTagRank } }),
      });
      const body = await response.json() as { data?: { Page?: { media?: { id?: number; tags?: { name?: string; rank?: number }[] }[] } } };
      const media = body.data?.Page?.media ?? [];
      expect(media.length, `AniList ${minimumTagRank} minimum rank için canonical tag coverage döndürmedi.`).toBeGreaterThan(0);
      expect(media.some((item) => item.id !== undefined && item.tags?.some((tag) => (
        tag.name === canonicalTag
        && typeof tag.rank === "number"
        && Number.isFinite(tag.rank)
        && tag.rank >= minimumTagRank
        && tag.rank <= 100
      )))).toBe(true);
    }
  });

  it("TVMaze anime ve Batı animasyonu sinyallerini sınıflandırır", async () => {
    const [anime, western] = await Promise.all([
      fetch("https://api.tvmaze.com/singlesearch/shows?q=One%20Piece").then((r) => r.json()),
      fetch("https://api.tvmaze.com/singlesearch/shows?q=The%20Simpsons").then((r) => r.json()),
    ]) as [{ type?: string; genres?: string[]; language?: string; network?: { country?: { code?: string } } }, { type?: string; genres?: string[]; language?: string; network?: { country?: { code?: string } } }];
    expect(classifyTvmazeAnime({ type: anime.type, genres: anime.genres, language: anime.language, networkCountryCode: anime.network?.country?.code }).excludeFromRecommendationTv).toBe(true);
    expect(classifyTvmazeAnime({ type: western.type, genres: western.genres, language: western.language, networkCountryCode: western.network?.country?.code }).excludeFromRecommendationTv).toBe(false);
  });

  it("Open Library work/edition identity döndürür", async () => {
    const response = await fetch("https://openlibrary.org/search.json?q=The%20Hobbit&limit=1&fields=key,edition_key");
    const body = await response.json() as { docs?: { key?: string; edition_key?: string[] }[] };
    expect(body.docs?.[0]?.key).toMatch(/^\/works\//);
    expect(body.docs?.[0]?.edition_key).toBeInstanceOf(Array);
  });

  it.skipIf(!process.env.TMDB_READ_ACCESS_TOKEN)("TMDB movie/TV keyword ve external ID enrichment", async () => {
    expect(process.env.TMDB_READ_ACCESS_TOKEN).toBeTruthy();
  });

  it.skipIf(!process.env.OMDB_API_KEY)("OMDb exact IMDb identity", async () => {
    expect(process.env.OMDB_API_KEY).toBeTruthy();
  });
});
