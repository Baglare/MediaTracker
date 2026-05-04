// ============================================
// İlerleme (Progress) Yardımcı Fonksiyonları
// ============================================

import { MediaType } from "./types";

/**
 * Medya türüne göre ilerleme biriminin etiketini döndürür.
 * Örneğin anime için "bölüm", kitap için "sayfa" gibi.
 */
export function getProgressLabel(type: MediaType): string {
  switch (type) {
    case "movie":
      return "dk";          // Film için dakika
    case "tv":
      return "bölüm";      // Dizi için bölüm
    case "anime":
      return "bölüm";      // Anime için bölüm
    case "manga":
      return "chapter";    // Manga için chapter
    case "manhwa":
      return "chapter";    // Manhwa için chapter
    case "manhua":
      return "chapter";    // Manhua için chapter
    case "book":
      return "sayfa";      // Kitap için sayfa
    default:
      return "birim";
  }
}

/**
 * Medya türüne göre Progress Log birimini (unit) döndürür.
 */
export function getProgressUnit(type: MediaType): "episode" | "chapter" | "page" | "movie" {
  switch (type) {
    case "movie":
      return "movie";
    case "tv":
    case "anime":
      return "episode";
    case "manga":
    case "manhwa":
    case "manhua":
      return "chapter";
    case "book":
      return "page";
    default:
      return "episode";
  }
}

/**
 * Medya türüne göre +1 butonundaki artış miktarını döndürür.
 * Film: artış yok (film tamamlanır, parça parça izlenmez)
 * Kitap: +10 sayfa (sayfa sayfa çok yavaş olur)
 * Diğerleri: +1
 */
export function getIncrementAmount(type: MediaType): number {
  switch (type) {
    case "movie":
      return 0;   // Film için +1 mantıklı değil, sadece "Tamamla" kullanılır
    case "book":
      return 10;  // Kitap için +10 sayfa
    default:
      return 1;   // Dizi, anime, manga, manhwa, manhua için +1
  }
}

/**
 * Medya türüne göre +1 butonunun etiketini döndürür.
 * Film için bu buton gösterilmeyecek ama yine de bir label var.
 */
export function getIncrementLabel(type: MediaType): string {
  switch (type) {
    case "movie":
      return "İzlendi";          // Film için kullanılmaz ama yedek
    case "tv":
      return "+1 bölüm";
    case "anime":
      return "+1 bölüm";
    case "manga":
      return "+1 chapter";
    case "manhwa":
      return "+1 chapter";
    case "manhua":
      return "+1 chapter";
    case "book":
      return "+10 sayfa";
    default:
      return "+1";
  }
}

/**
 * İlerleme yüzdesini hesaplar (0 ile 100 arasında).
 */
export function getProgressPercent(current: number, total: number): number {
  if (total <= 0) return 0;
  const percent = (current / total) * 100;
  // Yüzdeyi 0-100 arasında tutuyoruz
  return Math.min(Math.max(percent, 0), 100);
}

/**
 * Medya türünün Türkçe karşılığını döndürür.
 */
export function getMediaTypeLabel(type: MediaType): string {
  switch (type) {
    case "movie":
      return "Film";
    case "tv":
      return "Dizi";
    case "anime":
      return "Anime";
    case "manga":
      return "Manga";
    case "manhwa":
      return "Manhwa";
    case "manhua":
      return "Manhua";
    case "book":
      return "Kitap";
    default:
      return "Bilinmiyor";
  }
}

/**
 * Durum etiketinin Türkçe karşılığını döndürür.
 */
export function getStatusLabel(status: string): string {
  switch (status) {
    case "watching":
      return "İzleniyor";
    case "reading":
      return "Okunuyor";
    case "planning":
      return "Planlandı";
    case "completed":
      return "Tamamlandı";
    case "paused":
      return "Duraklatıldı";
    case "dropped":
      return "Bırakıldı";
    default:
      return status;
  }
}
