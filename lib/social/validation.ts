import type { MediaType } from "@/lib/types";
import { DEFAULT_PROFILE_PRESENTATION_PREFERENCES } from "@/lib/personalization/defaults";
import {
  PROFILE_AVATAR_FRAMES,
  PROFILE_BANNER_MODES,
  PROFILE_BANNER_POSITIONS,
  PROFILE_MOTIF_INTENSITIES,
  PROFILE_OVERLAY_STRENGTHS,
  PROFILE_PALETTE_IDS,
  PROFILE_SURFACE_STYLES,
} from "@/lib/personalization/validation";
import type { ProfilePresentationPreferences } from "@/lib/personalization/types";
import {
  CONNECTION_COLORS,
  MODULE_VISIBILITIES,
  PROFILE_MODULE_KEYS,
  PROFILE_VISIBILITIES,
  type ConnectionColor,
  type ProfileModuleKey,
  type ProfileModuleLayout,
  type ProfileVisibility,
  type SharedNoteInput,
  type SocialMediaSnapshot,
  type SocialProfileInput,
  type SocialProgressionSnapshot,
  type SocialStatsSnapshot,
} from "@/lib/social/types";

const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "api", "auth", "login", "logout", "register", "settings",
  "profile", "profiles", "u", "users", "people", "social", "support", "system",
  "moderator", "mod", "media", "mediatracker", "null", "undefined",
]);
const MEDIA_TYPES = new Set<MediaType>([
  "movie", "tv", "anime", "manga", "manhwa", "manhua", "book", "light_novel", "web_novel", "visual_novel",
]);
const SAFE_LANGUAGES = new Set(["tr", "en", "de", "fr", "es", "it", "pt", "ja", "ko", "zh", "other"]);
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function plainText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  if (/[<>]/.test(value)) return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= max ? text : null;
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validateUsername(value: unknown): ValidationResult<string> {
  if (typeof value !== "string") return { ok: false, error: "Kullanıcı adı metin olmalı." };
  const username = normalizeUsername(value);
  if (username.length < 3 || username.length > 24) return { ok: false, error: "Kullanıcı adı 3–24 karakter olmalı." };
  if (!/^[a-z0-9_]+$/.test(username)) return { ok: false, error: "Yalnızca küçük İngilizce harf, rakam ve _ kullanılabilir." };
  if (username.startsWith("_") || username.endsWith("_")) return { ok: false, error: "Kullanıcı adı _ ile başlayamaz veya bitemez." };
  if (username.includes("__")) return { ok: false, error: "Ardışık __ kullanılamaz." };
  if (RESERVED_USERNAMES.has(username)) return { ok: false, error: "Bu kullanıcı adı sistem için ayrılmış." };
  return { ok: true, value: username };
}

export function canChangeUsername(usernameChangedAt: string | null | undefined, now = new Date()): boolean {
  if (!usernameChangedAt) return true;
  const changed = new Date(usernameChangedAt);
  if (Number.isNaN(changed.getTime())) return false;
  return now.getTime() - changed.getTime() >= 30 * 24 * 60 * 60 * 1000;
}

export function usernameReservationExpires(releasedAt: string | Date): Date {
  const value = releasedAt instanceof Date ? releasedAt : new Date(releasedAt);
  return new Date(value.getTime() + 90 * 24 * 60 * 60 * 1000);
}

export function validateSocialProfileInput(value: unknown): ValidationResult<SocialProfileInput> {
  const record = recordOf(value);
  if (!record) return { ok: false, error: "Profil verisi geçersiz." };
  const username = validateUsername(record.username);
  if (!username.ok) return username;
  const displayName = plainText(record.displayName, 60);
  const tagline = record.tagline === undefined ? "" : plainText(record.tagline, 120);
  const bio = plainText(record.bio, 500);
  const location = record.location === undefined || record.location === "" ? "" : plainText(record.location, 80);
  const language = record.language === undefined || record.language === "" ? "" : plainText(record.language, 12);
  if (!displayName) return { ok: false, error: "Görünen ad 1–60 karakter olmalı." };
  if (tagline === null) return { ok: false, error: "Tagline en fazla 120 karakter olmalı ve HTML içermemeli." };
  if (bio === null) return { ok: false, error: "Bio en fazla 500 karakter olmalı ve HTML içermemeli." };
  if (location === null) return { ok: false, error: "Konum en fazla 80 karakter olmalı." };
  if (language === null || (language && !SAFE_LANGUAGES.has(language.toLowerCase()))) return { ok: false, error: "Dil değeri desteklenmiyor." };
  if (!PROFILE_VISIBILITIES.includes(record.visibilityMode as ProfileVisibility)) return { ok: false, error: "Profil görünürlüğü geçersiz." };
  const color = CONNECTION_COLORS.includes(record.connectionColor as ConnectionColor) ? record.connectionColor as ConnectionColor : "neutral";
  const selectedTitle = record.selectedTitle === undefined || record.selectedTitle === "" ? "" : plainText(record.selectedTitle, 60);
  if (selectedTitle === null) return { ok: false, error: "Ünvan en fazla 60 karakter olmalı." };
  const presentation = record.presentation === undefined
    ? { ok: true as const, value: DEFAULT_PROFILE_PRESENTATION_PREFERENCES }
    : validateCloudProfilePresentation(record.presentation);
  if (!presentation.ok) return presentation;
  return {
    ok: true,
    value: {
      username: username.value,
      displayName,
      tagline,
      bio,
      location: location || undefined,
      language: language?.toLowerCase() || undefined,
      visibilityMode: record.visibilityMode as ProfileVisibility,
      connectionColor: color,
      selectedTitle: selectedTitle || undefined,
      presentation: presentation.value,
    },
  };
}

export function validateCloudProfilePresentation(value: unknown): ValidationResult<ProfilePresentationPreferences> {
  const record = recordOf(value);
  if (!record || record.version !== 1) return { ok: false, error: "Profil sunum verisi geçersiz." };
  if (!PROFILE_PALETTE_IDS.includes(record.paletteId as ProfilePresentationPreferences["paletteId"])) return { ok: false, error: "Profil palette değeri geçersiz." };
  if (!PROFILE_BANNER_MODES.includes(record.bannerMode as ProfilePresentationPreferences["bannerMode"])) return { ok: false, error: "Banner türü geçersiz." };
  if (!PROFILE_BANNER_POSITIONS.includes(record.bannerPosition as ProfilePresentationPreferences["bannerPosition"])) return { ok: false, error: "Banner konumu geçersiz." };
  if (!PROFILE_OVERLAY_STRENGTHS.includes(record.overlayStrength as ProfilePresentationPreferences["overlayStrength"])) return { ok: false, error: "Overlay gücü geçersiz." };
  if (!PROFILE_AVATAR_FRAMES.includes(record.avatarFrame as ProfilePresentationPreferences["avatarFrame"])) return { ok: false, error: "Avatar çerçevesi geçersiz." };
  if (!PROFILE_SURFACE_STYLES.includes(record.surfaceStyle as ProfilePresentationPreferences["surfaceStyle"])) return { ok: false, error: "Profil yüzeyi geçersiz." };
  if (!PROFILE_MOTIF_INTENSITIES.includes(record.motifIntensity as ProfilePresentationPreferences["motifIntensity"])) return { ok: false, error: "Motif yoğunluğu geçersiz." };
  return { ok: true, value: {
    version: 1,
    paletteId: record.paletteId as ProfilePresentationPreferences["paletteId"],
    bannerMode: record.bannerMode as ProfilePresentationPreferences["bannerMode"],
    bannerPosition: record.bannerPosition as ProfilePresentationPreferences["bannerPosition"],
    overlayStrength: record.overlayStrength as ProfilePresentationPreferences["overlayStrength"],
    avatarFrame: record.avatarFrame as ProfilePresentationPreferences["avatarFrame"],
    surfaceStyle: record.surfaceStyle as ProfilePresentationPreferences["surfaceStyle"],
    motifIntensity: record.motifIntensity as ProfilePresentationPreferences["motifIntensity"],
  } };
}

export function validateModuleLayout(value: unknown): ValidationResult<ProfileModuleLayout> {
  const record = recordOf(value);
  if (!record || !PROFILE_MODULE_KEYS.includes(record.moduleKey as ProfileModuleKey)) return { ok: false, error: "Profil modülü geçersiz." };
  if (!MODULE_VISIBILITIES.includes(record.visibility as ProfileModuleLayout["visibility"])) return { ok: false, error: "Modül görünürlüğü geçersiz." };
  const integers = [record.gridX, record.gridY, record.gridWidth, record.gridHeight, record.mobileOrder];
  if (!integers.every((entry) => Number.isInteger(entry))) return { ok: false, error: "Grid değerleri tam sayı olmalı." };
  const [gridX, gridY, gridWidth, gridHeight, mobileOrder] = integers as number[];
  if (gridX < 0 || gridX > 11 || gridY < 0 || gridWidth < 1 || gridWidth > 12 || gridHeight < 1 || gridHeight > 6 || mobileOrder < 0 || gridX + gridWidth > 12) {
    return { ok: false, error: "Grid sınırları geçersiz." };
  }
  return {
    ok: true,
    value: {
      moduleKey: record.moduleKey as ProfileModuleKey,
      enabled: record.enabled !== false,
      visibility: record.visibility as ProfileModuleLayout["visibility"],
      gridX, gridY, gridWidth, gridHeight, mobileOrder,
      config: recordOf(record.config) as ProfileModuleLayout["config"] || {},
    },
  };
}

export function validateMediaSnapshot(value: unknown, maxOrder = 5): ValidationResult<SocialMediaSnapshot> {
  const record = recordOf(value);
  if (!record) return { ok: false, error: "Medya snapshot geçersiz." };
  const title = plainText(record.title, 180);
  if (!title) return { ok: false, error: "Medya başlığı gerekli." };
  if (!MEDIA_TYPES.has(record.mediaType as MediaType)) return { ok: false, error: "Medya türü geçersiz." };
  if (!Number.isInteger(record.sortOrder) || (record.sortOrder as number) < 0 || (record.sortOrder as number) >= maxOrder) return { ok: false, error: "Medya sırası geçersiz." };
  if (!(["east", "screen", "arch"] as const).includes(record.world as SocialMediaSnapshot["world"])) return { ok: false, error: "Medya dünyası geçersiz." };
  const source = plainText(record.externalSource, 40) || undefined;
  const externalId = plainText(record.externalId, 160) || undefined;
  const coverUrl = plainText(record.coverUrl, 1000) || undefined;
  if (coverUrl) {
    try {
      const url = new URL(coverUrl);
      if (url.protocol !== "https:") return { ok: false, error: "Kapak URL’si HTTPS olmalı." };
    } catch {
      return { ok: false, error: "Kapak URL’si geçersiz." };
    }
  }
  return { ok: true, value: { title, mediaType: record.mediaType as MediaType, externalSource: source, externalId, coverUrl, world: record.world as SocialMediaSnapshot["world"], sortOrder: record.sortOrder as number } };
}

export function validateSharedNote(value: unknown): ValidationResult<SharedNoteInput> {
  const record = recordOf(value);
  if (!record || record.confirmed !== true) return { ok: false, error: "Açık paylaşım onayı gerekli." };
  const mediaTitle = plainText(record.mediaTitle, 180);
  const content = plainText(record.content, 2000);
  if (!mediaTitle || !content) return { ok: false, error: "Medya başlığı ve 1–2000 karakter not gerekli." };
  if (!MEDIA_TYPES.has(record.mediaType as MediaType)) return { ok: false, error: "Medya türü geçersiz." };
  if (!["public", "followers", "mutual"].includes(String(record.visibility))) return { ok: false, error: "Paylaşılan not görünürlüğü geçersiz." };
  if (typeof record.containsSpoiler !== "boolean") return { ok: false, error: "Spoiler değeri boolean olmalı." };
  return { ok: true, value: { mediaTitle, mediaType: record.mediaType as MediaType, externalSource: plainText(record.externalSource, 40) || undefined, externalId: plainText(record.externalId, 160) || undefined, content, containsSpoiler: record.containsSpoiler, visibility: record.visibility as SharedNoteInput["visibility"], confirmed: true } };
}

export function validateSearchQuery(value: unknown): ValidationResult<string> {
  if (typeof value !== "string") return { ok: false, error: "Arama metni gerekli." };
  const query = value.replace(/%/g, " ").replace(/\s+/g, " ").trim();
  if (query.length < 2) return { ok: false, error: "Arama için en az 2 karakter yaz." };
  if (query.length > 60) return { ok: false, error: "Arama en fazla 60 karakter olabilir." };
  return { ok: true, value: query };
}

export function validateImageUpload(kind: "avatar" | "banner", mimeType: string, size: number): ValidationResult<true> {
  if (!IMAGE_MIME_TYPES.has(mimeType)) return { ok: false, error: "Yalnızca JPG, PNG veya WebP yüklenebilir." };
  const max = kind === "avatar" ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
  if (!Number.isFinite(size) || size <= 0 || size > max) return { ok: false, error: `${kind === "avatar" ? "Avatar" : "Banner"} dosyası boyut sınırını aşıyor.` };
  return { ok: true, value: true };
}

export function validateUserId(value: unknown): ValidationResult<string> {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? { ok: true, value }
    : { ok: false, error: "Kullanıcı kimliği geçersiz." };
}

export function validateStatsSnapshot(value: unknown): ValidationResult<SocialStatsSnapshot> {
  const record = recordOf(value);
  const worlds = recordOf(record?.worldCounts);
  const fields = record ? [record.totalMedia, record.completed, record.active, record.planning, record.favorites, record.rated] : [];
  if (!record || !worlds || fields.length !== 6 || !fields.every((item) => Number.isInteger(item) && Number(item) >= 0)) return { ok: false, error: "İstatistik snapshot geçersiz." };
  if (![worlds.east, worlds.screen, worlds.arch].every((item) => Number.isInteger(item) && Number(item) >= 0)) return { ok: false, error: "Dünya dağılımı geçersiz." };
  if (typeof record.snapshotAt !== "string" || Number.isNaN(Date.parse(record.snapshotAt))) return { ok: false, error: "Snapshot tarihi geçersiz." };
  return { ok: true, value: record as unknown as SocialStatsSnapshot };
}

export function validateProgressionSnapshot(value: unknown): ValidationResult<SocialProgressionSnapshot> {
  const record = recordOf(value);
  const worlds = recordOf(record?.worldCounts);
  if (!record || record.version !== 1 || !Number.isInteger(record.totalXp) || Number(record.totalXp) < 0 || !Number.isInteger(record.level) || Number(record.level) < 1 || !worlds) return { ok: false, error: "Progression snapshot geçersiz." };
  if (typeof record.progressPercent !== "number" || record.progressPercent < 0 || record.progressPercent > 1) return { ok: false, error: "Progression oranı geçersiz." };
  if (![record.title, record.tier, record.dominantWorld, record.snapshotAt].every((item) => typeof item === "string") || Number.isNaN(Date.parse(String(record.snapshotAt)))) return { ok: false, error: "Progression metadatası geçersiz." };
  if (!Object.values(worlds).every((item) => Number.isInteger(item) && Number(item) >= 0)) return { ok: false, error: "Progression dünya sayıları geçersiz." };
  return { ok: true, value: record as unknown as SocialProgressionSnapshot };
}

export function validateModuleCollection(value: unknown): ValidationResult<ProfileModuleLayout[]> {
  if (!Array.isArray(value) || value.length > PROFILE_MODULE_KEYS.length) return { ok: false, error: "Modül listesi geçersiz." };
  const modules: ProfileModuleLayout[] = [];
  for (const entry of value) {
    const result = validateModuleLayout(entry);
    if (!result.ok) return result;
    if (modules.some((item) => item.moduleKey === result.value.moduleKey || item.mobileOrder === result.value.mobileOrder)) return { ok: false, error: "Modül veya mobil sıra tekrarlanamaz." };
    const overlaps = modules.some((item) => result.value.gridX < item.gridX + item.gridWidth && result.value.gridX + result.value.gridWidth > item.gridX && result.value.gridY < item.gridY + item.gridHeight && result.value.gridY + result.value.gridHeight > item.gridY);
    if (overlaps) return { ok: false, error: "Profil kartları üst üste binemez." };
    modules.push(result.value);
  }
  return { ok: true, value: modules };
}
