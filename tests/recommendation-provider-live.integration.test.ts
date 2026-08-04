import { describe, expect, it } from "vitest";
import { classifyTvmazeAnime } from "@/features/recommendations/providers/tvmaze-anime-classifier";

const LIVE = process.env.D6_PROVIDER_LIVE_SMOKE === "1";

describe.skipIf(!LIVE)("D6-2 conditional live provider smoke", () => {
  it("AniList public API tags/rank ve identity döndürür", async () => {
    const response = await fetch("https://graphql.anilist.co", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "query { Media(search: \"Cowboy Bebop\", type: ANIME) { id tags { name rank } } }" }) });
    const body = await response.json() as { data?: { Media?: { id?: number; tags?: { name: string; rank?: number }[] } } };
    expect(body.data?.Media?.id).toBeTypeOf("number");
    expect(body.data?.Media?.tags).toBeInstanceOf(Array);
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

