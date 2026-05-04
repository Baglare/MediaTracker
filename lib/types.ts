// ============================================
// Medya Takip Uygulaması - Tip Tanımları
// ============================================

// Desteklenen medya türleri
export type MediaType = "movie" | "tv" | "anime" | "manga" | "manhwa" | "manhua" | "book";

// Kullanıcının bir medyayı hangi durumda takip ettiği
export type MediaStatus =
  | "watching"   // İzliyor (film/dizi/anime)
  | "reading"    // Okuyor (manga/manhwa/kitap)
  | "planning"   // İleride izleyecek/okuyacak
  | "completed"  // Bitirmiş
  | "paused"     // Duraklatmış
  | "dropped";   // Bırakmış

// Medyanın nereden eklendiğini belirten kaynak
export type MediaSource = "manual" | "tmdb" | "tvmaze" | "openlibrary" | "anilist";

// Her bir medya kartının sahip olduğu veriler
export interface MediaItem {
  id: string;                    // Benzersiz kimlik
  title: string;                 // Medyanın adı
  type: MediaType;               // Film mi, dizi mi, anime mi vs.
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
// Cloud / Sync Tipleri (Hazırlık — Supabase entegrasyonu için)
// ============================================
// Bu tipler ileride Supabase + offline-first sync için kullanılacak.
// Şu an yalnızca taslak olarak tanımlı; aktif veri akışına bağlı değil.

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
  /**
   * Item'ı oluşturan kullanıcının id'si.
   * - string: bu kullanıcıya aitse flush edilir.
   * - null/undefined: anonim (login öncesi); login olunca o kullanıcıya adopte edilir.
   * - başka bir userId: orphan; mevcut kullanıcının flush'ında atlanır.
   */
  userId?: string | null;
}
