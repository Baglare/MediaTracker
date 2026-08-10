import { NextRequest, NextResponse } from "next/server";

import {
  isDateInReleaseWindow,
  isReleaseRouteTimeout,
  releaseRouteSignal,
} from "@/app/api/calendar/release-route-utils";
import { providerUserAgent } from "@/lib/api/provider-identity";
import { publicProviderCapability } from "@/lib/providers/release-policy";

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
  const capability = publicProviderCapability("tvmaze");
  if (!capability.enabled) {
    return NextResponse.json(
      { events: [], code: "provider_unavailable", reason: capability.reason },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const userAgent = providerUserAgent();
    const response = await fetch(`https://api.tvmaze.com/shows/${showId}/episodes`, {
      headers: { accept: "application/json", ...(userAgent ? { "User-Agent": userAgent } : {}) },
      cache: "no-store",
      signal: releaseRouteSignal(),
    });
    if (!response.ok) return upstreamFailure(response);
    const payload = await response.json() as unknown;
    if (!Array.isArray(payload)) {
      return NextResponse.json({ error: "TVMaze episode payload geçersiz." }, { status: 502 });
    }
    const seenEpisodeIds = new Set<number>();
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
      }))
      .filter((episode) => isDateInReleaseWindow(episode.airdate ?? episode.airstamp ?? ""))
      .filter((episode) => {
        if (seenEpisodeIds.has(episode.id)) return false;
        seenEpisodeIds.add(episode.id);
        return true;
      });
    return NextResponse.json({ showId, seasonNumber, episodes });
  } catch (error) {
    return NextResponse.json(
      {
        error: isReleaseRouteTimeout(error)
          ? "TVMaze release isteği zaman aşımına uğradı."
          : "TVMaze release servisine ulaşılamadı.",
      },
      { status: isReleaseRouteTimeout(error) ? 504 : 502 },
    );
  }
}
