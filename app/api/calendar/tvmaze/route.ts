import { NextRequest, NextResponse } from "next/server";

interface TvmazeReleaseEpisode {
  id: number;
  name?: string | null;
  season?: number | null;
  number?: number | null;
  airdate?: string | null;
  airtime?: string | null;
  airstamp?: string | null;
}

function positiveInteger(value: string | null): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function upstreamFailure(response: Response) {
  const retryAfter = response.headers.get("retry-after");
  return NextResponse.json(
    { error: `TVMaze release isteği başarısız: ${response.status}` },
    {
      status: response.status,
      headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
    },
  );
}

export async function GET(request: NextRequest) {
  const showId = positiveInteger(request.nextUrl.searchParams.get("showId"));
  const seasonNumber = positiveInteger(request.nextUrl.searchParams.get("season"));
  if (!showId || !seasonNumber) {
    return NextResponse.json(
      { error: "Geçerli showId ve season gereklidir." },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(`https://api.tvmaze.com/shows/${showId}/episodes`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return upstreamFailure(response);
    const payload = await response.json() as unknown;
    if (!Array.isArray(payload)) {
      return NextResponse.json({ error: "TVMaze episode payload geçersiz." }, { status: 502 });
    }
    const episodes = payload
      .filter((entry): entry is TvmazeReleaseEpisode =>
        typeof entry === "object"
        && entry !== null
        && typeof (entry as TvmazeReleaseEpisode).id === "number"
        && (entry as TvmazeReleaseEpisode).season === seasonNumber)
      .map((episode) => ({
        id: episode.id,
        season: episode.season,
        number: typeof episode.number === "number" ? episode.number : null,
        name: typeof episode.name === "string" ? episode.name.slice(0, 200) : null,
        airdate: typeof episode.airdate === "string" ? episode.airdate : null,
        airtime: typeof episode.airtime === "string" ? episode.airtime : null,
        airstamp: typeof episode.airstamp === "string" ? episode.airstamp : null,
      }));
    return NextResponse.json({ showId, seasonNumber, episodes });
  } catch {
    return NextResponse.json(
      { error: "TVMaze release servisine ulaşılamadı." },
      { status: 502 },
    );
  }
}
