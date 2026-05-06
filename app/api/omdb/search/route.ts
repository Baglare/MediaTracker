import { NextRequest, NextResponse } from "next/server";
import { fetchOmdbDetail, fetchOmdbSearch, normalizeOmdbDetail } from "@/lib/omdb";
import { OmdbNormalizedResult } from "@/lib/omdb-types";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");
  if (!query || query.trim().length === 0) {
    return NextResponse.json({ error: "Arama metni gerekli." }, { status: 400 });
  }

  if (!process.env.OMDB_API_KEY) {
    return NextResponse.json({ error: "OMDb yapılandırılmadı." }, { status: 503 });
  }

  try {
    const search = await fetchOmdbSearch(query.trim());
    if (search.Response !== "True") {
      return NextResponse.json({ results: [], error: search.Error || "Sonuç bulunamadı." }, { status: 200 });
    }

    const baseResults = (search.Search || []).slice(0, 8);
    const detailResults = await Promise.allSettled(
      baseResults.map((item) => fetchOmdbDetail(item.imdbID))
    );

    const normalized: OmdbNormalizedResult[] = detailResults
      .map((result) => {
        if (result.status !== "fulfilled") return null;
        const detail = result.value;
        if (detail.Response !== "True") return null;
        return normalizeOmdbDetail(detail);
      })
      .filter((item): item is OmdbNormalizedResult => item !== null);

    return NextResponse.json({ results: normalized });
  } catch (error) {
    console.error("OMDb arama hatası:", error);
    return NextResponse.json({ error: "OMDb araması sırasında hata oluştu." }, { status: 502 });
  }
}
