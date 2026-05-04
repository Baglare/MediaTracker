// ============================================
// Open Library API Tip Tanımları
// ============================================
// Open Library'den dönen ham verilerin ve normalize edilmiş
// sonuçların tip tanımları.

// ---- Ham Open Library Tipleri ----

/** Open Library search endpoint'inden dönen her bir doc */
export interface OpenLibraryRawDoc {
  key: string;                        // Örn: "/works/OL27448W"
  title: string;
  author_name?: string[];             // Yazarlar
  first_publish_year?: number;        // İlk yayın yılı
  cover_i?: number;                   // Kapak görseli ID'si
  number_of_pages_median?: number;    // Ortalama sayfa sayısı
  edition_count?: number;             // Baskı sayısı
  language?: string[];                // Diller (ISO 639-2 kodları: "eng", "tur" vb.)
  isbn?: string[];                    // ISBN numaraları
  subject?: string[];                 // Konular/Türler
}

/** Open Library search response yapısı */
export interface OpenLibrarySearchResponse {
  numFound: number;                   // Toplam bulunan sonuç sayısı
  docs: OpenLibraryRawDoc[];          // Sonuç listesi
}

// ---- Normalize Edilmiş Tipler ----

/** Normalize edilmiş Open Library arama sonucu */
export interface OpenLibraryNormalizedResult {
  externalSource: "openlibrary";
  externalId: string;               // Open Library key (örn: "/works/OL27448W")
  type: "book";
  title: string;
  authors?: string[];               // Yazarlar
  overview?: string;                // Açıklama (genelde arama sonucunda gelmez)
  releaseYear?: number;             // İlk yayın yılı
  coverUrl?: string;                // Kapak URL'si
  totalProgress: number;            // Sayfa sayısı varsa = sayfa sayısı, yoksa 1
  pageCount?: number;               // Sayfa sayısı
  editionCount?: number;            // Baskı sayısı
  languages?: string[];             // Diller
  subjects?: string[];              // Konular (en fazla 5 tane)
  isbn?: string[];                  // ISBN numaraları (en fazla 3 tane)
}
