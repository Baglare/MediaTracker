import { NextRequest, NextResponse } from "next/server";

interface TmdbReleaseDate {
  certification?: string;
  iso_639_1?: string | null;
  note?: string;
  release_date?: string;
  type?: number;
}

interface TmdbReleaseRegion {
  iso_3166_1?: string;
  release_dates?: TmdbReleaseDate[];
}

interface TmdbReleasePayload {
  id?: number;
  release_date?: string;
  release_dates?: { results?: TmdbReleaseRegion[] };
}

function positiveInteger(value: string | null): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  const movieId = positiveInteger(request.nextUrl.searchParams.get("movieId"));
  if (!movieId) {
    return NextResponse.json({ error: "Geçerli movieId gereklidir." }, { status: 400 });
  }
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "TMDB yapılandırılmadı." }, { status: 503 });
  }

  try {
    const url = new URL(`https://api.themoviedb.org/3/movie/${movieId}`);
    url.searchParams.set("append_to_response", "release_dates");
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        accept: "application/json",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      const retryAfter = response.headers.get("retry-after");
      return NextResponse.json(
        { error: `TMDB release isteği başarısız: ${response.status}` },
        {
          status: response.status,
          headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
        },
      );
    }
    const payload = await response.json() as TmdbReleasePayload;
    const releases = (payload.release_dates?.results ?? []).flatMap((region) => {
      const regionCode = typeof region.iso_3166_1 === "string"
        ? region.iso_3166_1.toUpperCase()
        : null;
      if (!regionCode) return [];
      return (region.release_dates ?? []).flatMap((release) => {
        if (
          typeof release.release_date !== "string"
          || typeof release.type !== "number"
        ) return [];
        return [{
          region: regionCode,
          dateTime: release.release_date,
          type: release.type,
        }];
      });
    });
    return NextResponse.json({
      movieId,
      originalReleaseDate:
        typeof payload.release_date === "string" ? payload.release_date : null,
      releases,
    });
  } catch {
    return NextResponse.json(
      { error: "TMDB release servisine ulaşılamadı." },
      { status: 502 },
    );
  }
}
