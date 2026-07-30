import { NextRequest, NextResponse } from "next/server";

const ANILIST_URL = "https://graphql.anilist.co";
const AIRING_QUERY = `
query ($mediaId: Int!, $page: Int!, $perPage: Int!) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    airingSchedules(mediaId: $mediaId, notYetAired: true, sort: TIME) {
      id
      airingAt
      episode
    }
  }
}`;

interface AniListSchedule {
  id: number;
  airingAt: number;
  episode: number;
}

function positiveInteger(value: string | null): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  const mediaId = positiveInteger(request.nextUrl.searchParams.get("mediaId"));
  if (!mediaId) {
    return NextResponse.json({ error: "Geçerli mediaId gereklidir." }, { status: 400 });
  }

  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const limitSeconds = nowSeconds + 90 * 24 * 60 * 60;
    const schedules: AniListSchedule[] = [];
    for (let page = 1; page <= 3; page += 1) {
      const response = await fetch(ANILIST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          query: AIRING_QUERY,
          variables: { mediaId, page, perPage: 50 },
        }),
        cache: "no-store",
      });
      if (!response.ok) {
        const retryAfter = response.headers.get("retry-after");
        return NextResponse.json(
          { error: `AniList release isteği başarısız: ${response.status}` },
          {
            status: response.status,
            headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
          },
        );
      }
      const raw = await response.json() as {
        data?: {
          Page?: {
            pageInfo?: { hasNextPage?: boolean };
            airingSchedules?: unknown;
          };
        };
      };
      if (!raw.data?.Page || !Array.isArray(raw.data.Page.airingSchedules)) {
        return NextResponse.json(
          { error: "AniList release payload geçersiz." },
          { status: 502 },
        );
      }
      const pageSchedules = raw.data.Page.airingSchedules
        .filter((entry): entry is AniListSchedule =>
          typeof entry === "object"
          && entry !== null
          && typeof (entry as AniListSchedule).id === "number"
          && typeof (entry as AniListSchedule).airingAt === "number"
          && typeof (entry as AniListSchedule).episode === "number")
        .map((entry) => ({
          id: entry.id,
          airingAt: entry.airingAt,
          episode: entry.episode,
        }));
      schedules.push(...pageSchedules.filter((entry) =>
        entry.airingAt >= nowSeconds && entry.airingAt <= limitSeconds));
      const reachedBeyondWindow = pageSchedules.some((entry) => entry.airingAt > limitSeconds);
      if (!raw.data.Page.pageInfo?.hasNextPage || reachedBeyondWindow) break;
    }
    return NextResponse.json({
      mediaId,
      schedules,
    });
  } catch {
    return NextResponse.json(
      { error: "AniList release servisine ulaşılamadı." },
      { status: 502 },
    );
  }
}
