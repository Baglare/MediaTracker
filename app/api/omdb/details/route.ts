import { runSafeApiRoute } from "@/lib/api/safe-route";
import { NextRequest, NextResponse } from "next/server";
import { fetchOmdbDetail, normalizeOmdbDetail } from "@/lib/omdb";
import { publicProviderCapability } from "@/lib/providers/release-policy";

export async function GET(request: NextRequest) {
  return runSafeApiRoute("/api/omdb/details", "GET", async () => {
  const imdbId = request.nextUrl.searchParams.get("id");
  if (!imdbId || imdbId.trim().length === 0) {
    return NextResponse.json({ error: "IMDb id gerekli." }, { status: 400 });
  }
  const capability = publicProviderCapability("omdb");
  if (!capability.enabled) return NextResponse.json({ code: "provider_unavailable", reason: capability.reason }, { status: 503, headers: { "Cache-Control": "no-store" } });

  if (!process.env.OMDB_API_KEY) {
    return NextResponse.json({ error: "OMDb yapılandırılmadı." }, { status: 503 });
  }

  try {
    const detail = await fetchOmdbDetail(imdbId.trim());
    if (detail.Response !== "True") {
      return NextResponse.json(
        { error: "omdb_upstream_error" },
        { status: 502 }
      );
    }

    const normalized = normalizeOmdbDetail(detail);
    if (!normalized) {
      return NextResponse.json({ error: "OMDb sonucu normalize edilemedi." }, { status: 502 });
    }

    return NextResponse.json(normalized);
  } catch {
    return NextResponse.json({ error: "OMDb detay verisi alınamadı." }, { status: 502 });
  }

  });
}
