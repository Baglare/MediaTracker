import { OmdbDetailResponse, OmdbNormalizedResult, OmdbSearchResponse } from "./omdb-types";
import { fetchWithTimeout } from "./api/request-security";

function buildOmdbUrl(params: Record<string, string>) {
  const key = process.env.OMDB_API_KEY;
  if (!key) return null;
  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey", key);
  url.searchParams.set("r", "json");
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }
  return url;
}

function parseYear(value?: string) {
  if (!value) return undefined;
  const match = value.match(/\d{4}/);
  if (!match) return undefined;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseRuntime(value?: string) {
  if (!value) return undefined;
  const match = value.match(/(\d+)/);
  if (!match) return undefined;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseRating(value?: string) {
  if (!value || value === "N/A") return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function splitCsv(value?: string) {
  if (!value || value === "N/A") return undefined;
  const items = value.split(",").map((part) => part.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function normalizePoster(value?: string) {
  if (!value || value === "N/A") return undefined;
  return value;
}

export function normalizeOmdbDetail(detail: OmdbDetailResponse): OmdbNormalizedResult | null {
  if (!detail.imdbID || !detail.Title) return null;
  return {
    externalSource: "omdb",
    externalId: detail.imdbID,
    type: "movie",
    title: detail.Title,
    overview: detail.Plot && detail.Plot !== "N/A" ? detail.Plot : undefined,
    releaseYear: parseYear(detail.Year),
    coverUrl: normalizePoster(detail.Poster),
    totalProgress: 1,
    runtime: parseRuntime(detail.Runtime),
    genres: splitCsv(detail.Genre),
    director: detail.Director && detail.Director !== "N/A" ? detail.Director : undefined,
    actors: splitCsv(detail.Actors),
    imdbRating: parseRating(detail.imdbRating),
    imdbUrl: `https://www.imdb.com/title/${detail.imdbID}/`,
  };
}

export async function fetchOmdbSearch(query: string): Promise<OmdbSearchResponse> {
  const url = buildOmdbUrl({ s: query, type: "movie" });
  if (!url) {
    return { Response: "False", Error: "OMDb yapılandırılmadı." };
  }
  const res = await fetchWithTimeout(url, { cache: "no-store" });
  if (!res.ok) throw new Error("omdb_upstream_error");
  return res.json() as Promise<OmdbSearchResponse>;
}

export async function fetchOmdbDetail(imdbId: string): Promise<OmdbDetailResponse> {
  const url = buildOmdbUrl({ i: imdbId, plot: "short" });
  if (!url) {
    return { Response: "False", Error: "OMDb yapılandırılmadı." };
  }
  const res = await fetchWithTimeout(url, { cache: "no-store" });
  if (!res.ok) throw new Error("omdb_upstream_error");
  return res.json() as Promise<OmdbDetailResponse>;
}
