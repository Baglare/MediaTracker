import { withMediaClassification, type MediaItem, type ProgressLog } from "./types";

export type UserProgressionWorld = "east" | "screen" | "arch" | "mixed";
export type UserProgressionTier = "basic" | "refined" | "elite" | "master";

export interface UserProgression {
  totalXp: number;
  level: number;
  title: string;
  tier: UserProgressionTier;
  dominantWorld: UserProgressionWorld;
  currentLevelStartXp: number;
  nextLevelStartXp: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPercent: number;
  worldCounts: Record<UserProgressionWorld, number>;
}

type LegacyNoteItem = MediaItem & { notes?: unknown };

const TITLES: Record<UserProgressionWorld, [string, string, string, string]> = {
  east: ["Doğu Yolcusu", "Mürekkep İzleyicisi", "Katana Arşivcisi", "Doğu Ustası"],
  screen: ["Kadraj Gezgini", "Sahne Takipçisi", "Projektör Avcısı", "Kadraj Ustası"],
  arch: ["Arşiv Yolcusu", "Sayfa Toplayıcısı", "Mühür Muhafızı", "Arşiv Ustası"],
  mixed: ["Dünya Takipçisi", "Çoklu Dünya Gezgini", "Koleksiyon Ustası", "Medya Arşivcisi"],
};

function hasText(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => hasText(entry));
  }
  return typeof value === "string" && value.trim().length > 0;
}

function hasRating(item: MediaItem): boolean {
  return typeof item.userRating === "number" || typeof item.rating === "number";
}

function worldForItem(item: MediaItem): Exclude<UserProgressionWorld, "mixed"> {
  const classified = withMediaClassification(item);
  if (classified.mediaType === "tv" || classified.mediaType === "movie") return "screen";
  if (classified.mediaType === "book") return "arch";
  return "east";
}

function resolveDominantWorld(mediaList: MediaItem[]): UserProgressionWorld {
  if (mediaList.length === 0) return "mixed";

  const counts = { east: 0, screen: 0, arch: 0 };
  for (const item of mediaList) {
    counts[worldForItem(item)] += 1;
  }

  const ranked = Object.entries(counts)
    .map(([world, count]) => ({ world: world as Exclude<UserProgressionWorld, "mixed">, count }))
    .sort((a, b) => b.count - a.count);

  const first = ranked[0];
  const second = ranked[1];
  const firstShare = (first.count / mediaList.length) * 100;
  const secondShare = (second.count / mediaList.length) * 100;

  if (first.count > 0 && firstShare >= 45 && firstShare - secondShare >= 15) {
    return first.world;
  }

  return "mixed";
}

function titleForLevel(world: UserProgressionWorld, level: number): string {
  const titleSet = TITLES[world];
  if (level >= 21) return titleSet[3];
  if (level >= 11) return titleSet[2];
  if (level >= 6) return titleSet[1];
  return titleSet[0];
}

export function tierForLevel(level: number): UserProgressionTier {
  if (level >= 21) return "master";
  if (level >= 11) return "elite";
  if (level >= 6) return "refined";
  return "basic";
}

export function calculateUserProgression(
  mediaList: MediaItem[],
  progressLogs: ProgressLog[]
): UserProgression {
  let totalXp = mediaList.length * 10 + progressLogs.length * 5;
  const worldCounts: Record<UserProgressionWorld, number> = {
    east: 0,
    screen: 0,
    arch: 0,
    mixed: 0,
  };

  for (const item of mediaList) {
    worldCounts[worldForItem(item)] += 1;

    if (item.status === "completed") totalXp += 30;
    if (hasRating(item)) totalXp += 8;
    if (item.favorite) totalXp += 5;

    const legacyNotes = (item as LegacyNoteItem).notes;
    if (hasText(item.personalNotes) || hasText(legacyNotes)) {
      totalXp += 8;
    }
  }

  const level = Math.floor(Math.sqrt(totalXp / 100)) + 1;
  const currentLevelStartXp = (level - 1) ** 2 * 100;
  const nextLevelStartXp = level ** 2 * 100;
  const currentLevelXp = totalXp - currentLevelStartXp;
  const nextLevelXp = nextLevelStartXp - currentLevelStartXp;
  const progressPercent = nextLevelXp > 0 ? currentLevelXp / nextLevelXp : 0;
  const dominantWorld = resolveDominantWorld(mediaList);

  return {
    totalXp,
    level,
    title: titleForLevel(dominantWorld, level),
    tier: tierForLevel(level),
    dominantWorld,
    currentLevelStartXp,
    nextLevelStartXp,
    currentLevelXp,
    nextLevelXp,
    progressPercent: Math.min(1, Math.max(0, progressPercent)),
    worldCounts,
  };
}
