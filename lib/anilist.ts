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

export function normalizeAniListSynonyms(
  synonyms: unknown,
): string[] | undefined {
  if (!Array.isArray(synonyms)) return undefined;
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of synonyms) {
    if (typeof value !== "string") continue;
    const title = value.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 200);
    const key = title.toLocaleLowerCase("en-US");
    if (!title || seen.has(key)) continue;
    seen.add(key);
    normalized.push(title);
    if (normalized.length === 12) break;
  }
  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeAniListSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactAniListSearchText(value: string): string {
  return normalizeAniListSearchText(value).replace(/\s+/g, "");
}

/**
 * Yalnız başarılı boş aramadan sonra kullanılacak tek konservatif fallback.
 * Kısa sorgular genişletilmez; boşluk varyantı veya uzun başlığın sınırlı
 * başlangıcı kullanılır.
 */
export function buildAniListSearchFallback(value: string): string | null {
  const normalized = normalizeAniListSearchText(value);
  if (!normalized) return null;
  const compact = normalized.replace(/\s+/g, "");
  if (compact !== normalized && compact.length >= 4 && compact.length <= 32) {
    return compact;
  }
  if (normalized.length < 12) return null;
  const words = normalized.split(" ");
  const wordPrefix = words.slice(0, Math.min(3, words.length)).join(" ");
  if (wordPrefix.length >= 4 && wordPrefix !== normalized) return wordPrefix;
  const characterPrefix = [...normalized].slice(0, 12).join("").trim();
  return characterPrefix.length >= 4 && characterPrefix !== normalized
    ? characterPrefix
    : null;
}

function aniListCandidateScore(media: AniListRawMedia, query: string): number {
  const normalizedQuery = normalizeAniListSearchText(query);
  const compactQuery = compactAniListSearchText(query);
  const titles = [
    media.title.english,
    media.title.romaji,
    media.title.native,
    ...(Array.isArray(media.synonyms) ? media.synonyms.slice(0, 20) : []),
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  let best = 4;
  for (const title of titles) {
    const normalized = normalizeAniListSearchText(title);
    const compact = compactAniListSearchText(title);
    if (normalized === normalizedQuery) best = Math.min(best, 0);
    else if (compact === compactQuery) best = Math.min(best, 1);
    else if (normalized.startsWith(normalizedQuery)) best = Math.min(best, 2);
    else if (compact.startsWith(compactQuery)) best = Math.min(best, 3);
  }
  return best;
}

export function rankAniListSearchResults(
  media: readonly AniListRawMedia[],
  query: string,
): AniListRawMedia[] {
  return [...media].sort((left, right) =>
    aniListCandidateScore(left, query) - aniListCandidateScore(right, query)
    || (right.popularity ?? 0) - (left.popularity ?? 0)
    || left.id - right.id);
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
 *   - hiçbiri yoksa → 0 (BİLİNMİYOR — UI bunu "??" olarak gösterir)
 *
 * Manga/Manhwa/Manhua için:
 *   - chapters varsa → chapters
 *   - yoksa → 0 (BİLİNMİYOR)
 *
 * NOT: Sahte 1 fallback kaldırıldı. UI ve handleIncrement total === 0 durumunu
 * "bilinmeyen toplam" olarak ele alır; kullanıcı yine +1 ile takip edebilir.
 */
export function getAniListTotalProgress(media: AniListRawMedia): number {
  if (media.type === "ANIME") {
    if (media.episodes && media.episodes > 0) return media.episodes;
    if (media.nextAiringEpisode?.episode && media.nextAiringEpisode.episode > 1) {
      return media.nextAiringEpisode.episode - 1;
    }
    return 0;
  }

  // MANGA, MANHWA, MANHUA
  if (media.chapters && media.chapters > 0) return media.chapters;
  return 0;
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
    synonyms: normalizeAniListSynonyms(media.synonyms),
    overview,
    releaseYear: media.startDate?.year || undefined,
    coverUrl,
    backdropUrl: media.bannerImage || undefined,
    totalProgress,
    episodes: media.episodes || undefined,
    chapters: media.chapters || undefined,
    volumes: media.volumes || undefined,
    genres: media.genres || undefined,
    tags: media.tags?.map((tag) => ({
      id: tag.id,
      name: tag.name,
      rank: typeof tag.rank === "number" ? tag.rank : undefined,
      category: tag.category || undefined,
      isGeneralSpoiler: Boolean(tag.isGeneralSpoiler),
      isMediaSpoiler: Boolean(tag.isMediaSpoiler),
      isAdult: Boolean(tag.isAdult),
    })),
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
