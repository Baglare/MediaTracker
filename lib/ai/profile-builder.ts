// ============================================
// Library Profile Builder
// ============================================
// Tüm kütüphaneyi modele boca etmek yerine kısa, sinyal odaklı bir profil üretir.
// R35: gruplar genişledi (devam edenler / tamamlananlar / planlananlar /
// duraklatılanlar / dünya dağılımı / rating ortalaması) ve toggle kontrolü
// gerçekten içeriği etkiliyor — kapalı toggle ilgili alanı boş bırakır.

import { MediaItem, ProgressLog, MediaType } from "@/lib/types";
import { LibraryProfile, AiSettings } from "./types";

const RECENT_LIMIT = 10;
const TOP_GENRE_LIMIT = 8;
const TOP_TAG_LIMIT = 8;
const HIGH_RATED_LIMIT = 8;
const FAVORITE_LIMIT = 8;
const IN_PROGRESS_LIMIT = 8;
const COMPLETED_LIMIT = 5;
const PLANNED_LIMIT = 5;
const PAUSED_LIMIT = 5;
const DROPPED_LIMIT = 5;
const NOTE_LIMIT = 5;
const NOTE_CHAR_LIMIT = 240;

const EAST_TYPES: ReadonlySet<MediaType> = new Set([
  "anime",
  "manga",
  "manhwa",
  "manhua",
  "light_novel",
  "web_novel",
  "visual_novel",
]);
const SCREEN_TYPES: ReadonlySet<MediaType> = new Set(["tv", "movie"]);
const ARCH_TYPES: ReadonlySet<MediaType> = new Set(["book"]);

function flag(value: boolean | undefined): boolean {
  return value !== false; // default true; only explicit false disables
}

export function buildLibraryProfile(
  mediaItems: MediaItem[],
  progressLogs: ProgressLog[],
  settings: AiSettings
): LibraryProfile {
  const includeRatings = flag(settings.includeRatings);
  const includeFavorites = flag(settings.includeFavorites);
  const includeProgress = flag(settings.includeProgress);

  const byType: Record<string, number> = {};
  const genreCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  const worldDistribution = { east: 0, screen: 0, arch: 0 };

  for (const m of mediaItems) {
    byType[m.type] = (byType[m.type] || 0) + 1;
    if (EAST_TYPES.has(m.type)) worldDistribution.east += 1;
    else if (SCREEN_TYPES.has(m.type)) worldDistribution.screen += 1;
    else if (ARCH_TYPES.has(m.type)) worldDistribution.arch += 1;

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

  // Rating odaklı çıktılar — toggle kapalıysa hepsi boş.
  const ratedItems = includeRatings
    ? mediaItems.filter((m) => typeof m.userRating === "number")
    : [];
  const highRated = includeRatings
    ? ratedItems
        .filter((m) => (m.userRating ?? 0) >= 7)
        .sort((a, b) => (b.userRating ?? 0) - (a.userRating ?? 0))
        .slice(0, HIGH_RATED_LIMIT)
        .map((m) => ({ title: m.title, type: m.type as MediaType, rating: m.userRating as number }))
    : [];
  const averageRating: LibraryProfile["averageRating"] =
    includeRatings && ratedItems.length > 0
      ? {
          value:
            Math.round(
              (ratedItems.reduce((sum, m) => sum + (m.userRating as number), 0) / ratedItems.length) *
                10
            ) / 10,
          count: ratedItems.length,
        }
      : undefined;

  const favorites = includeFavorites
    ? mediaItems
        .filter((m) => m.favorite)
        .slice(0, FAVORITE_LIMIT)
        .map((m) => ({ title: m.title, type: m.type as MediaType }))
    : [];

  // İlerleme odaklı gruplar — toggle kapalıysa hepsi boş.
  const inProgress = includeProgress
    ? mediaItems
        .filter(
          (m) =>
            m.status === "watching" ||
            m.status === "reading" ||
            (m.status !== "completed" &&
              m.status !== "dropped" &&
              m.status !== "planning" &&
              m.status !== "paused" &&
              (m.currentProgress || 0) > 0)
        )
        .slice(0, IN_PROGRESS_LIMIT)
        .map((m) => ({
          title: m.title,
          type: m.type as MediaType,
          currentProgress: m.currentProgress,
          totalProgress: m.totalProgress,
        }))
    : [];

  const completed = includeProgress
    ? mediaItems
        .filter((m) => m.status === "completed")
        .slice(0, COMPLETED_LIMIT)
        .map((m) => ({ title: m.title, type: m.type as MediaType }))
    : [];

  const planned = includeProgress
    ? mediaItems
        .filter((m) => m.status === "planning")
        .slice(0, PLANNED_LIMIT)
        .map((m) => ({ title: m.title, type: m.type as MediaType }))
    : [];

  const paused = includeProgress
    ? mediaItems
        .filter((m) => m.status === "paused")
        .slice(0, PAUSED_LIMIT)
        .map((m) => ({ title: m.title, type: m.type as MediaType }))
    : [];

  const dropped = includeProgress
    ? mediaItems
        .filter((m) => m.status === "dropped")
        .slice(0, DROPPED_LIMIT)
        .map((m) => ({ title: m.title, type: m.type as MediaType }))
    : [];

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
    inProgress,
    completed,
    planned,
    paused,
    averageRating,
    worldDistribution,
  };
}

function topN(counts: Map<string, number>, n: number): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

export function summarizeProfile(profile: LibraryProfile): string {
  if (profile.totalItems === 0) {
    return "Kütüphane boş. Yalnızca istek metni ve seçilen kapsam kullanılabilir.";
  }

  const typeStr = Object.entries(profile.byType)
    .map(([t, c]) => `${t}:${c}`)
    .join(", ");
  const worlds = `Doğu:${profile.worldDistribution.east} Kadraj:${profile.worldDistribution.screen} Arşiv:${profile.worldDistribution.arch}`;

  const parts: string[] = [
    `Toplam ${profile.totalItems} öğe (${typeStr}). Dünya dağılımı: ${worlds}.`,
    `Türler: ${profile.topGenres.join(", ") || "—"}.`,
  ];

  if (profile.topTags.length > 0) {
    parts.push(`Etiketler: ${profile.topTags.join(", ")}.`);
  }

  if (profile.averageRating) {
    parts.push(
      `Rating ortalaması: ${profile.averageRating.value}/10 (${profile.averageRating.count} puanlı eser).`
    );
  }

  if (profile.highRated.length > 0) {
    parts.push(
      `Yüksek puan: ${profile.highRated.map((h) => `${h.title}(${h.rating})`).join(", ")}.`
    );
  }

  if (profile.favorites.length > 0) {
    parts.push(`Favori: ${profile.favorites.map((f) => f.title).join(", ")}.`);
  }

  if (profile.inProgress.length > 0) {
    parts.push(
      `Devam edenler: ${profile.inProgress
        .map((p) =>
          p.totalProgress && p.totalProgress > 0
            ? `${p.title}(${p.currentProgress ?? 0}/${p.totalProgress})`
            : p.title
        )
        .join(", ")}.`
    );
  }

  if (profile.completed.length > 0) {
    parts.push(`Tamamlananlar: ${profile.completed.map((c) => c.title).join(", ")}.`);
  }

  if (profile.planned.length > 0) {
    parts.push(`Planlananlar: ${profile.planned.map((p) => p.title).join(", ")}.`);
  }

  if (profile.paused.length > 0) {
    parts.push(`Duraklatılanlar: ${profile.paused.map((p) => p.title).join(", ")}.`);
  }

  if (profile.dropped.length > 0) {
    parts.push(`Bırakılanlar: ${profile.dropped.map((d) => d.title).join(", ")}.`);
  }

  if (profile.recentActivity.length > 0) {
    parts.push(
      `Son aktivite: ${profile.recentActivity.slice(0, 5).map((r) => r.title).join(", ")}.`
    );
  }

  if (profile.notes && profile.notes.length > 0) {
    parts.push(`Kişisel notlar mevcut: ${profile.notes.length} eser için.`);
  }

  return parts.join(" ");
}
