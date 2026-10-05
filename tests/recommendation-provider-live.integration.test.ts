import { describe, expect, it } from "vitest";
import {
  fetchWithProviderRequestPolicy,
  type ProviderRequestTelemetry,
} from "@/features/recommendations/providers/request-policy";
import { classifyTvmazeAnime } from "@/features/recommendations/providers/tvmaze-anime-classifier";
import type { RecommendationProvider } from "@/features/recommendations/domain/types";

const LIVE = process.env.D6_PROVIDER_LIVE_SMOKE === "1";

const telemetry: ProviderRequestTelemetry[] = [];

async function liveFetch(provider: RecommendationProvider, url: string, init?: RequestInit): Promise<Response> {
  const result = await fetchWithProviderRequestPolicy({ provider, url, init });
  telemetry.push(result.telemetry);
  expect(result.response.ok, `${provider} canlı sözleşme çağrısı başarısız oldu (${result.response.status}).`).toBe(true);
  return result.response;
}

interface TvmazeShow {
  id?: number;
  type?: string;
  genres?: string[];
  language?: string;
  network?: { country?: { code?: string } | null } | null;
  webChannel?: { country?: { code?: string } | null } | null;
}

async function searchTvmaze(query: string): Promise<TvmazeShow[]> {
  const response = await liveFetch("tvmaze", `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`, {
    headers: { accept: "application/json" },
  });
  const body = await response.json() as unknown;
  expect(Array.isArray(body)).toBe(true);
  return (body as { show?: TvmazeShow }[]).flatMap((item) => item?.show ? [item.show] : []).slice(0, 10);
}

function tvmazeDecision(show: TvmazeShow) {
  return classifyTvmazeAnime({
    type: show.type,
    genres: show.genres,
    language: show.language,
    networkCountryCode: show.network?.country?.code,
    webChannelCountryCode: show.webChannel?.country?.code,
  });
}

describe.skipIf(!LIVE)("D6.6-2 conditional live provider contract", () => {
  it("TVMaze search sonuçlarından anime, Batı animasyonu ve live-action ayrımını doğrular", async () => {
    const animeResults = await searchTvmaze("One Piece");
    const westernResults = await searchTvmaze("The Simpsons");
    const liveActionResults = await searchTvmaze("Breaking Bad");
    expect(animeResults.some((show) => Number.isInteger(show.id) && tvmazeDecision(show).excludeFromRecommendationTv)).toBe(true);
    expect(westernResults.some((show) => Number.isInteger(show.id) && show.type === "Animation" && !tvmazeDecision(show).excludeFromRecommendationTv)).toBe(true);
    expect(liveActionResults.some((show) => Number.isInteger(show.id) && show.type !== "Animation" && !tvmazeDecision(show).excludeFromRecommendationTv)).toBe(true);
  });

  it("Open Library work identity ve opsiyonel edition→work ilişkisini doğrular", async () => {
    const response = await liveFetch("openlibrary", "https://openlibrary.org/search.json?isbn=9780261102217&limit=3&fields=key,edition_key,author_name,subject,number_of_pages_median");
    const body = await response.json() as { docs?: unknown };
    expect(Array.isArray(body.docs)).toBe(true);
    const docs = (body.docs as { key?: string; edition_key?: string[]; author_name?: string[]; subject?: string[] }[]).slice(0, 3);
    const work = docs.find((item) => typeof item.key === "string" && /^\/works\/OL[A-Za-z0-9]+W$/.test(item.key));
    expect(work).toBeDefined();
    if (work?.author_name !== undefined) expect(work.author_name).toBeInstanceOf(Array);
    if (work?.subject !== undefined) expect(work.subject).toBeInstanceOf(Array);
    const editionId = work?.edition_key?.find((item) => /^OL[A-Za-z0-9]+M$/.test(item));
    if (editionId) {
      const editionResponse = await liveFetch("openlibrary", `https://openlibrary.org/books/${editionId}.json`, { headers: { accept: "application/json" } });
      const edition = await editionResponse.json() as { key?: string; works?: { key?: string }[] };
      expect(edition.key).toBe(`/books/${editionId}`);
      if (edition.works?.length) expect(edition.works.some((item) => item.key === work?.key)).toBe(true);
    }
  });

  it.skipIf(!process.env.OMDB_API_KEY)("OMDb exact IMDb identity ve partial metadata", async () => {
    const response = await liveFetch("omdb", `https://www.omdbapi.com/?apikey=${encodeURIComponent(process.env.OMDB_API_KEY as string)}&i=tt0137523&plot=short&r=json`);
    const body = await response.json() as { Response?: string; imdbID?: string; Genre?: string };
    expect(body.Response).toBe("True");
    expect(body.imdbID).toBe("tt0137523");
    if (body.Genre !== undefined) expect(body.Genre.length).toBeGreaterThan(0);
  });

  it("canlı çağrı bütçesinin bounded kaldığını doğrular", () => {
    expect(telemetry.length).toBeGreaterThan(0);
    expect(telemetry.every((item) => item.attemptCount <= 2 && item.requestCount === 1)).toBe(true);
  });
});
