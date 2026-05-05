// ============================================
// Library Profile Builder
// ============================================
// Tüm kütüphaneyi modele boca etmek yerine kısa, sinyal odaklı bir profil üretir.
// Favori / yüksek puan / dropped / etiket / tür / son aktivite sinyallerini özetler.

import { MediaItem, ProgressLog, MediaType } from "@/lib/types";
import { LibraryProfile, AiSettings } from "./types";

const RECENT_LIMIT = 10;
const TOP_GENRE_LIMIT = 8;
const TOP_TAG_LIMIT = 8;
const HIGH_RATED_LIMIT = 8;
const FAVORITE_LIMIT = 8;
const DROPPED_LIMIT = 5;
const NOTE_LIMIT = 5;
const NOTE_CHAR_LIMIT = 240;

export function buildLibraryProfile(
  mediaItems: MediaItem[],
  progressLogs: ProgressLog[],
  settings: AiSettings
): LibraryProfile {
  const byType: Record<string, number> = {};
  const genreCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();

  for (const m of mediaItems) {
    byType[m.type] = (byType[m.type] || 0) + 1;
    for (const g of m.genres || []) {
      genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
    }
    for (const s of m.subjects || []) {
      genreCounts.set(s, (genreCounts.get(s) || 0) + 1);
    }
    for (const t of m.tags || []) {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
  }

  const topGenres = topN(genreCounts, TOP_GENRE_LIMIT);
  const topTags = topN(tagCounts, TOP_TAG_LIMIT);

  const highRated = mediaItems
    .filter((m) => typeof m.userRating === "number" && (m.userRating ?? 0) >= 7)
    .sort((a, b) => (b.userRating ?? 0) - (a.userRating ?? 0))
    .slice(0, HIGH_RATED_LIMIT)
    .map((m) => ({ title: m.title, type: m.type as MediaType, rating: m.userRating as number }));

  const favorites = mediaItems
    .filter((m) => m.favorite)
    .slice(0, FAVORITE_LIMIT)
    .map((m) => ({ title: m.title, type: m.type as MediaType }));

  const dropped = mediaItems
    .filter((m) => m.status === "dropped")
    .slice(0, DROPPED_LIMIT)
    .map((m) => ({ title: m.title, type: m.type as MediaType }));

  const recentActivity = settings.useRecentActivity
    ? [...progressLogs]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, RECENT_LIMIT)
        .map((l) => ({
          title: l.mediaTitle,
          type: l.mediaType as MediaType,
          action: l.action,
          at: l.createdAt,
        }))
    : [];

  const notes = settings.usePersonalNotes
    ? mediaItems
        .filter((m) => m.personalNotes && m.personalNotes.trim().length > 0)
        .slice(0, NOTE_LIMIT)
        .map((m) => ({
          title: m.title,
          note: (m.personalNotes as string).slice(0, NOTE_CHAR_LIMIT),
        }))
    : undefined;

  return {
    totalItems: mediaItems.length,
    byType,
    topGenres,
    topTags,
    highRated,
    favorites,
    dropped,
    recentActivity,
    notes,
  };
}

function topN(counts: Map<string, number>, n: number): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

export function summarizeProfile(profile: LibraryProfile): string {
  const typeStr = Object.entries(profile.byType)
    .map(([t, c]) => `${t}:${c}`)
    .join(", ");
  const fav = profile.favorites.map((f) => f.title).join(", ") || "yok";
  const high = profile.highRated.map((h) => `${h.title}(${h.rating})`).join(", ") || "yok";
  const recent = profile.recentActivity.map((r) => r.title).slice(0, 5).join(", ") || "yok";
  return `Toplam ${profile.totalItems} öğe (${typeStr}). Türler: ${profile.topGenres.join(", ") || "—"}. Favori: ${fav}. Yüksek puan: ${high}. Son aktivite: ${recent}.`;
}
