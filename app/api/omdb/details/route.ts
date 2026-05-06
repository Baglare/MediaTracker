import { NextRequest, NextResponse } from "next/server";
import { fetchOmdbDetail, normalizeOmdbDetail } from "@/lib/omdb";

export async function GET(request: NextRequest) {
  const imdbId = request.nextUrl.searchParams.get("id");
  if (!imdbId || imdbId.trim().length === 0) {
    return NextResponse.json({ error: "IMDb id gerekli." }, { status: 400 });
  }

  if (!process.env.OMDB_API_KEY) {
    return NextResponse.json({ error: "OMDb yapılandırılmadı." }, { status: 503 });
  }

  try {
    const detail = await fetchOmdbDetail(imdbId.trim());
    if (detail.Response !== "True") {
      return NextResponse.json(
        { error: detail.Error || "OMDb detay verisi alınamadı." },
        { status: 502 }
      );
    }

    const normalized = normalizeOmdbDetail(detail);
    if (!normalized) {
      return NextResponse.json({ error: "OMDb sonucu normalize edilemedi." }, { status: 502 });
    }

    return NextResponse.json(normalized);
  } catch (error) {
    console.error("OMDb detay hatası:", error);
    return NextResponse.json({ error: "OMDb detay verisi alınamadı." }, { status: 502 });
  }
}
