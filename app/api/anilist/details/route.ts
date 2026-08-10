// ============================================
// AniList Detay API Route'u
// ============================================
// GET /api/anilist/details?id=21
//
// Tek bir AniList medyasının detaylarını döndürür.
// "Listeme Ekle" sırasında çağrılarak daha dolu
// veriyle MediaItem oluşturulur.

import { NextRequest, NextResponse } from "next/server";
import { AniListDetailResponse } from "@/lib/anilist-types";
import { normalizeAniListMedia } from "@/lib/anilist";
import { publicProviderCapability } from "@/lib/providers/release-policy";

// ---- GraphQL Sorgu Metni ----
const DETAIL_QUERY = `
query ($id: Int!) {
  Media(id: $id) {
    id
    type
    format
    status
    title {
      romaji
      english
      native
    }
    description(asHtml: false)
    startDate {
      year
    }
    coverImage {
      large
      extraLarge
    }
    bannerImage
    episodes
    chapters
    volumes
    genres
    tags { id name rank category isGeneralSpoiler isMediaSpoiler isAdult }
    countryOfOrigin
    averageScore
    popularity
    siteUrl
    nextAiringEpisode {
      episode
      airingAt
    }
    relations {
      edges {
        relationType
        node {
          id
          type
          format
          episodes
          title {
            romaji
            english
            native
          }
          startDate {
            year
          }
        }
      }
    }
  }
}
`;

/** AniList GraphQL endpoint */
const ANILIST_URL = "https://graphql.anilist.co";

/**
 * GET /api/anilist/details?id=21
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const idStr = params.get("id");

  if (!idStr) {
    return NextResponse.json(
      { error: "AniList ID (id) gerekli." },
      { status: 400 }
    );
  }

  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return NextResponse.json(
      { error: "Geçersiz ID." },
      { status: 400 }
    );
  }
  const capability = publicProviderCapability("anilist");
  if (!capability.enabled) return NextResponse.json({ result: null, code: "provider_unavailable", reason: capability.reason }, { status: 503, headers: { "Cache-Control": "no-store" } });

  try {
    const response = await fetch(ANILIST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query: DETAIL_QUERY,
        variables: { id },
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `AniList API hatası: ${response.status}` },
        { status: 502 }
      );
    }

    const json = (await response.json()) as AniListDetailResponse;

    if (!json.data?.Media) {
      return NextResponse.json(
        { error: "Medya bulunamadı." },
        { status: 404 }
      );
    }

    const result = normalizeAniListMedia(json.data.Media);

    return NextResponse.json({ result });
  } catch (err) {
    console.error("AniList detay hatası:", err);
    return NextResponse.json(
      { error: "AniList'e bağlanırken bir hata oluştu." },
      { status: 502 }
    );
  }
}
