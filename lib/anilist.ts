// ============================================
// AniList Yardımcı Fonksiyonlar
// ============================================
// AniList verilerini normalize etmek için kullanılan
// sade yardımcı fonksiyonlar.

import {
  AniListRawMedia,
  AniListRawRelationEdge,
  AniListRawTitle,
  AniListNormalizedResult,
  AniListRelationLite,
} from "./anilist-types";

/**
 * AniList relation edge'lerini minimal `AniListRelationLite` listesine çevirir.
 * Tek görevi: persistence için küçük + güvenli bir alt küme tutmak.
 */
export function normalizeAniListRelations(
  edges?: AniListRawRelationEdge[]
): AniListRelationLite[] | undefined {
  if (!edges || edges.length === 0) return undefined;
  const out: AniListRelationLite[] = [];
  for (const edge of edges) {
    const node = edge?.node;
    if (!node || typeof node.id !== "number") continue;
    const title = node.title
      ? node.title.english || node.title.romaji || node.title.native || undefined
      : undefined;
    out.push({
      anilistId: node.id,
      relationType: edge.relationType || undefined,
      rawType: node.type,
      format: node.format || undefined,
      title,
      episodes: typeof node.episodes === "number" ? node.episodes : undefined,
      releaseYear: node.startDate?.year || undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

/** AniList medya tipleri (sadece AniList'ten gelebilecek türler) */
type AniListMediaType = "anime" | "manga" | "manhwa" | "manhua";

/**
 * HTML benzeri etiketleri temizleyip düz metin döndürür.
 * AniList description alanı bazen <br>, <i> gibi etiketler içerebilir.
 */
export function stripHtml(text?: string): string | undefined {
  if (!text) return undefined;
  return text
    .replace(/<br\s*\/?>/gi, "\n")   // <br> → satır sonu
    .replace(/<[^>]*>/g, "")          // Tüm HTML etiketlerini kaldır
    .replace(/\n+/g, " ")             // Satır sonlarını boşluğa çevir
    .trim();
}

/**
 * AniList title nesnesinden en uygun başlığı seçer.
 * Öncelik: english > romaji > native
 */
export function getBestAniListTitle(title: AniListRawTitle): string {
  return title.english || title.romaji || title.native || "Bilinmiyor";
}

/**
 * AniList medya tipini MediaType'a çevirir.
 * MANGA türü countryOfOrigin'e göre manga/manhwa/manhua olarak ayrılır.
 *
 * - JP veya bilinmeyen → "manga"
 * - KR → "manhwa"
 * - CN veya TW → "manhua"
 */
export function getAniListMediaType(media: AniListRawMedia): AniListMediaType {
  if (media.type === "ANIME") return "anime";

  // MANGA ise ülkeye göre ayır
  const country = media.countryOfOrigin?.toUpperCase();
  if (country === "KR") return "manhwa";
  if (country === "CN" || country === "TW") return "manhua";
  return "manga";
}

/**
 * AniList medya verisinden toplam ilerlemeyi hesaplar.
 *
 * Anime için:
 *   - episodes varsa → episodes
 *   - episodes yoksa ama nextAiringEpisode varsa → episode - 1 (şimdiye kadar yayınlanan)
 *   - hiçbiri yoksa → 1 (fallback)
 *
 * Manga/Manhwa/Manhua için:
 *   - chapters varsa → chapters
 *   - yoksa → 1 (fallback)
 */
export function getAniListTotalProgress(media: AniListRawMedia): number {
  if (media.type === "ANIME") {
    if (media.episodes && media.episodes > 0) return media.episodes;
    if (media.nextAiringEpisode?.episode && media.nextAiringEpisode.episode > 1) {
      return media.nextAiringEpisode.episode - 1;
    }
    return 1;
  }

  // MANGA, MANHWA, MANHUA
  if (media.chapters && media.chapters > 0) return media.chapters;
  return 1;
}

/**
 * Tek bir AniList ham media verisini normalize eder.
 */
export function normalizeAniListMedia(
  media: AniListRawMedia
): AniListNormalizedResult {
  const bestTitle = getBestAniListTitle(media.title);
  const mediaType = getAniListMediaType(media);
  const totalProgress = getAniListTotalProgress(media);

  // Kapak: extraLarge varsa onu tercih et, yoksa large kullan
  const coverUrl = media.coverImage?.extraLarge || media.coverImage?.large || undefined;

  // Açıklama: HTML'i temizle, çok uzunsa kısalt
  let overview = stripHtml(media.description);
  if (overview && overview.length > 300) {
    overview = overview.slice(0, 300) + "...";
  }

  return {
    externalSource: "anilist",
    externalId: String(media.id),
    type: mediaType,
    title: bestTitle,
    originalTitle: media.title.romaji || undefined,
    nativeTitle: media.title.native || undefined,
    overview,
    releaseYear: media.startDate?.year || undefined,
    coverUrl,
    backdropUrl: media.bannerImage || undefined,
    totalProgress,
    episodes: media.episodes || undefined,
    chapters: media.chapters || undefined,
    volumes: media.volumes || undefined,
    genres: media.genres || undefined,
    countryOfOrigin: media.countryOfOrigin || undefined,
    anilistStatus: media.status || undefined,
    format: media.format || undefined,
    averageScore: media.averageScore || undefined,
    popularity: media.popularity || undefined,
    siteUrl: media.siteUrl || undefined,
    nextAiringEpisode: media.nextAiringEpisode
      ? {
          episode: media.nextAiringEpisode.episode,
          airingAt: media.nextAiringEpisode.airingAt,
        }
      : undefined,
    relations: normalizeAniListRelations(media.relations?.edges),
  };
}
