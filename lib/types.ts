// ============================================
// Medya Takip Uygulaması - Tip Tanımları
// ============================================

import type { AniListRelationLite } from "./anilist-types";

// Desteklenen medya türleri
export type MediaType =
  | "movie"
  | "tv"
  | "anime"
  | "manga"
  | "manhwa"
  | "manhua"
  | "book"
  | "light_novel"
  | "web_novel"
  | "visual_novel";

export type MediaTheme = "east" | "screen" | "library";

export type MediaClassificationType =
  | "anime"
  | "manga"
  | "tv"
  | "movie"
  | "book"
  | "novel";

export type MediaSubType =
  | "anime_tv"
  | "anime_movie"
  | "ova"
  | "ona"
  | "special"
  | "manga"
  | "manhwa"
  | "manhua"
  | "tv_series"
  | "movie"
  | "book"
  | "light_novel"
  | "web_novel"
  | "visual_novel"
  | "serialized_novel";

export interface MediaClassification {
  theme: MediaTheme;
  mediaType: MediaClassificationType;
  subType: MediaSubType;
}

// Kullanıcının bir medyayı hangi durumda takip ettiği
export type MediaStatus =
  | "watching"   // İzliyor (film/dizi/anime)
  | "reading"    // Okuyor (manga/manhwa/kitap)
  | "planning"   // İleride izleyecek/okuyacak
  | "completed"  // Bitirmiş
  | "paused"     // Duraklatmış
  | "dropped";   // Bırakmış

// Medyanın nereden eklendiğini belirten kaynak
export type MediaSource = "manual" | "tmdb" | "tvmaze" | "openlibrary" | "anilist" | "omdb";

export type SeriesRelationType =
  | "main"
  | "season"
  | "movie"
  | "ova"
  | "ona"
  | "special"
  | "recap"
  | "spin_off"
  | "side_story"
  | "adaptation"
  | "source_material"
  | "sequel"
  | "prequel"
  | "other";

// Her bir medya kartının sahip olduğu veriler
export interface MediaItem {
  id: string;                    // Benzersiz kimlik
  title: string;                 // Medyanın adı
  type: MediaType;               // Film mi, dizi mi, anime mi vs.
  theme?: MediaTheme;            // Yeni classification: ana tema
  mediaType?: MediaClassificationType; // Yeni classification: ana medya ailesi
  subType?: MediaSubType;         // Yeni classification: alt tur
  status: MediaStatus;           // İzleniyor, planlandı, tamamlandı vs.
  coverImage: string;            // Kapak görseli URL'si
  currentProgress: number;       // Şu ana kadar izlenen/okunan miktar
  totalProgress: number;         // Toplam bölüm/sayfa/chapter sayısı
  rating?: number;               // Eski puan alanı (uyumluluk için korunuyor)

  // --- Kişisel metadata alanları ---
  userRating?: number | null;     // Kullanıcı puanı (0-10 arası tam sayı, null = puan verilmedi)
  favorite?: boolean;             // Favori mi? (varsayılan: false)
  tags?: string[];                // Kişisel etiketler (kullanıcı tanımlı)
  personalNotes?: string;         // Kişisel notlar (serbest metin)

  // --- Dış kaynak entegrasyonu için opsiyonel alanlar ---
  externalSource?: MediaSource;  // Medya hangi kaynaktan eklendi?
  externalId?: string;           // Dış kaynaktaki kimlik (TMDB ID, TVmaze ID vb.)
  overview?: string;             // Kısa açıklama / özet
  releaseYear?: number;          // Çıkış yılı
  backdropUrl?: string;          // Arka plan görseli URL'si
  runtime?: number;              // Film süresi (dakika)
  numberOfSeasons?: number;      // Toplam sezon sayısı
  numberOfEpisodes?: number;     // Toplam bölüm sayısı
  tvmazeStatus?: string;         // TVmaze dizi durumu (Running, Ended vb.)
  tmdbStatus?: string;           // TMDB dizi durumu
  lastAirDate?: string;          // Son yayınlanan bölümün tarihi
  nextAirDate?: string;          // Sonraki bölümün yayın tarihi
  genres?: string[];             // Tür etiketleri (Drama, Comedy vb.)
  networkName?: string;          // Yayıncı kanal (HBO, Netflix vb.)
  language?: string;             // Dili (English, Japanese vb.)
  seasonBreakdown?: { season: number; episodes: number }[]; // Sezonlara göre bölüm kırılımı
  seriesGroupId?: string;        // Ait olduğu seri/franchise grubunun kimliği
  seriesGroupTitle?: string;     // Seri/franchise grup başlığı
  seriesRelationType?: SeriesRelationType; // Seriyle ilişki tipi
  seasonNumber?: number;         // Sezon numarası
  orderIndex?: number;           // Seri içi sıralama bilgisi

  // --- Kitap (Open Library) için opsiyonel alanlar ---
  authors?: string[];            // Yazarlar
  pageCount?: number;            // Sayfa sayısı
  editionCount?: number;         // Baskı sayısı
  languages?: string[];          // Diller (birden fazla olabilir)
  subjects?: string[];           // Konular/Türler
  isbn?: string[];               // ISBN numaraları

  // --- AniList (Anime/Manga/Manhwa/Manhua) için opsiyonel alanlar ---
  nativeTitle?: string;          // Native başlık (Kanji, Hangul vb.)
  episodes?: number;             // Anime bölüm sayısı
  chapters?: number;             // Manga chapter sayısı
  volumes?: number;              // Manga cilt sayısı
  countryOfOrigin?: string;      // JP, KR, CN, TW
  anilistStatus?: string;        // FINISHED, RELEASING vb.
  format?: string;               // TV, OVA, MANGA, ONE_SHOT vb.
  averageScore?: number;         // 0-100 arası puan
  popularity?: number;           // Popülerlik
  siteUrl?: string;              // AniList sayfa URL'si
  nextAiringEpisode?: {          // Sonraki bölüm bilgisi
    episode?: number;
    airingAt?: number;
  };

  /**
   * AniList relations alanı (V3): item details fetch sırasında doldurulur.
   * Sadece güvenli ve minimal bilgiyi tutar; group inference için kullanılır.
   * Eski item'larda undefined olabilir.
   */
  anilistRelations?: AniListRelationLite[];
}

// AniList relation tipini buradan da kullanılabilir kılmak için re-export.
export type { AniListRelationLite } from "./anilist-types";

type ClassifiableMediaItem = Partial<MediaItem> & {
  metadata?: Record<string, unknown> | null;
};

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readFormat(item: ClassifiableMediaItem): string | undefined {
  return readString(item.format) ?? readString(item.metadata?.format);
}

function classificationFromAniListFormat(item: ClassifiableMediaItem): MediaClassification | null {
  if (item.externalSource !== "anilist") return null;

  const format = readFormat(item)?.toUpperCase();
  if (!format) return null;

  if (item.type === "anime") {
    switch (format) {
      case "TV":
        return { theme: "east", mediaType: "anime", subType: "anime_tv" };
      case "MOVIE":
        return { theme: "east", mediaType: "anime", subType: "anime_movie" };
      case "OVA":
        return { theme: "east", mediaType: "anime", subType: "ova" };
      case "ONA":
        return { theme: "east", mediaType: "anime", subType: "ona" };
      case "SPECIAL":
      case "MUSIC":
        return { theme: "east", mediaType: "anime", subType: "special" };
      default:
        return null;
    }
  }

  if (item.type === "manga" || item.type === "manhwa" || item.type === "manhua") {
    switch (format) {
      case "MANGA":
        return { theme: "east", mediaType: "manga", subType: "manga" };
      case "MANHWA":
        return { theme: "east", mediaType: "manga", subType: "manhwa" };
      case "MANHUA":
        return { theme: "east", mediaType: "manga", subType: "manhua" };
      case "NOVEL":
        return { theme: "library", mediaType: "novel", subType: "serialized_novel" };
      default:
        return null;
    }
  }

  return null;
}

export function inferMediaClassification(item: ClassifiableMediaItem): MediaClassification {
  const anilistClassification = classificationFromAniListFormat(item);
  if (anilistClassification) return anilistClassification;

  switch (item.type) {
    case "anime":
      return { theme: "east", mediaType: "anime", subType: "anime_tv" };
    case "manga":
      return { theme: "east", mediaType: "manga", subType: "manga" };
    case "manhwa":
      return { theme: "east", mediaType: "manga", subType: "manhwa" };
    case "manhua":
      return { theme: "east", mediaType: "manga", subType: "manhua" };
    case "tv":
      return { theme: "screen", mediaType: "tv", subType: "tv_series" };
    case "movie":
      return { theme: "screen", mediaType: "movie", subType: "movie" };
    case "book":
      return { theme: "library", mediaType: "book", subType: "book" };
    case "light_novel":
      return { theme: "library", mediaType: "novel", subType: "light_novel" };
    case "web_novel":
      return { theme: "library", mediaType: "novel", subType: "web_novel" };
    case "visual_novel":
      return { theme: "library", mediaType: "novel", subType: "visual_novel" };
    default:
      return { theme: "screen", mediaType: "movie", subType: "movie" };
  }
}

export function withMediaClassification<T extends ClassifiableMediaItem>(item: T): T & MediaClassification {
  const inferred = inferMediaClassification(item);
  return {
    ...item,
    theme: item.theme ?? inferred.theme,
    mediaType: item.mediaType ?? inferred.mediaType,
    subType: item.subType ?? inferred.subType,
  };
}

// ============================================
// Progress Log Tipleri
// ============================================

export type ProgressLogAction = "increment" | "complete" | "manual_adjust" | "added";

export type ProgressLogUnit = "episode" | "chapter" | "page" | "movie";

export interface ProgressLog {
  id: string;
  mediaId: string;
  mediaTitle: string;
  mediaType: MediaType;
  action: ProgressLogAction;
  detail?: string;
  amount: number;
  unit: ProgressLogUnit;
  previousProgress: number;
  newProgress: number;
  createdAt: string;
}

// ============================================
// Cloud / Sync Tipleri
// ============================================
// Supabase + offline-first sync akışında kullanılan ortak tipler.

export type CloudMode = "local" | "cloud" | "offline-sync";

export type SyncStatus =
  | "local-only"   // Cloud yapılandırılmamış, sadece localStorage
  | "idle"         // Bağlı, kuyrukta bekleyen iş yok
  | "syncing"      // Aktif olarak Supabase'e gönderiliyor
  | "pending"      // Kuyrukta bekleyen iş var
  | "error"        // Son denemede hata oluştu
  | "offline";     // Ağ erişimi yok

export type SyncEntity = "media_item" | "progress_log";

export type SyncOperation = "upsert" | "delete";

export interface SyncQueueItem {
  id: string;
  entity: SyncEntity;
  operation: SyncOperation;
  payload: unknown;
  createdAt: string;
  retryCount: number;
  lastError?: string;
  ownerScope: string;
  /**
   * Authenticated owner için Supabase user id. Guest öğesinde bulunmaz ve
   * login sonrasında başka bir owner'a yeniden etiketlenmez.
   */
  userId?: string;
}
