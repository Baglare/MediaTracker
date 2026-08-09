"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import type { ImageTransform } from "@/lib/personalization/image-transform";
import type {
  AvatarAccent,
  AvatarMode,
  PresetAvatar,
  ProfilePreferences,
  SelectedTitleMode,
} from "@/lib/profile-preferences";
import { migrateLocalAvatar, shouldOfferLocalAvatarMigration } from "@/lib/social/avatar";
import { validateImageUpload } from "@/lib/social/validation";
import { ProfileAvatar } from "./sidebar-profile-card";

interface ProfileSettingsCardProps {
  preferences: ProfilePreferences;
  profileName: string;
  automaticTitle: string;
  onChange: (preferences: ProfilePreferences) => void;
  authenticated: boolean;
  userId: string | null;
  hasSocialProfile: boolean;
  socialAvatarUrl?: string;
  avatarTransform?: ImageTransform;
  onSocialAvatarChanged: (url: string | undefined) => void;
  showIdentityFields?: boolean;
}

const ACCENT_OPTIONS: { value: AvatarAccent; label: string; className: string }[] = [
  { value: "amber", label: "Amber", className: "bg-amber-400" },
  { value: "violet", label: "Violet", className: "bg-violet-400" },
  { value: "cyan", label: "Cyan", className: "bg-cyan-400" },
  { value: "rose", label: "Rose", className: "bg-rose-400" },
  { value: "emerald", label: "Emerald", className: "bg-emerald-400" },
  { value: "zinc", label: "Zinc", className: "bg-zinc-400" },
];

const AVATAR_MODE_OPTIONS: { value: AvatarMode; label: string }[] = [
  { value: "initials", label: "Baş harf avatarı" },
  { value: "preset", label: "Hazır ikon" },
  { value: "image", label: "Resim avatarı" },
];

const PRESET_OPTIONS: { value: PresetAvatar; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "east", label: "Doğu" },
  { value: "screen", label: "Kadraj" },
  { value: "arch", label: "Arşiv" },
  { value: "mixed", label: "Karma" },
];

const TITLE_MODE_OPTIONS: { value: SelectedTitleMode; label: string }[] = [
  { value: "auto", label: "Otomatik ünvan" },
  { value: "manual", label: "Manuel ünvan" },
];

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const AVATAR_SIZE = 256;

function updatePreference<K extends keyof ProfilePreferences>(
  preferences: ProfilePreferences,
  key: K,
  value: ProfilePreferences[K]
): ProfilePreferences {
  return { ...preferences, [key]: value };
}

async function resizeAvatarImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Sadece resim dosyası seçebilirsin.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Resim 4 MB üstünde olmamalı.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Resim işlenemedi.");

    const sourceSize = Math.min(bitmap.width, bitmap.height);
    const sx = Math.max(0, (bitmap.width - sourceSize) / 2);
    const sy = Math.max(0, (bitmap.height - sourceSize) / 2);

    ctx.drawImage(bitmap, sx, sy, sourceSize, sourceSize, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    bitmap.close();
  }
}

async function dataUrlToFile(dataUrl: string): Promise<File> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const extension = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  return new File([blob], `profile-avatar.${extension}`, { type: blob.type || "image/jpeg" });
}

async function uploadSocialAvatar(file: File): Promise<string | undefined> {
  const validation = validateImageUpload("avatar", file.type, file.size);
  if (!validation.ok) throw new Error(validation.error);
  const body = new FormData();
  body.set("kind", "avatar");
  body.set("file", file);
  const response = await fetch("/api/social/assets", { method: "POST", body });
  const result = await response.json() as { url?: string; message?: string };
  if (!response.ok) throw new Error(result.message ?? "Profil fotoğrafı yüklenemedi.");
  return result.url;
}

export default function ProfileSettingsCard({
  preferences,
  profileName,
  automaticTitle,
  onChange,
  authenticated,
  userId,
  hasSocialProfile,
  socialAvatarUrl,
  avatarTransform,
  onSocialAvatarChanged,
  showIdentityFields = true,
}: ProfileSettingsCardProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageMessage, setImageMessage] = useState<string | null>(null);

  const migrationDismissed = Boolean(userId && preferences.socialAvatarMigrationDismissedFor === userId);
  const offerMigration = shouldOfferLocalAvatarMigration({
    authenticated,
    hasSocialProfile,
    socialAvatarUrl,
    localAvatarDataUrl: preferences.avatarImageDataUrl,
    dismissed: migrationDismissed,
  });
  const avatarStatus = socialAvatarUrl
    ? "Sosyal profil ile senkronize"
    : hasSocialProfile && preferences.avatarImageDataUrl
      ? "Cloud’a taşınmayı bekliyor"
      : "Yalnızca bu cihazda";

  const setPreference = <K extends keyof ProfilePreferences>(
    key: K,
    value: ProfilePreferences[K]
  ) => {
    onChange(updatePreference(preferences, key, value));
  };

  const handleImageFile = async (file: File | undefined) => {
    if (!file) return;
    setImageBusy(true);
    setImageError(null);
    setImageMessage(null);
    try {
      if (authenticated && hasSocialProfile) {
        const url = await uploadSocialAvatar(file);
        let localCache = preferences.avatarImageDataUrl;
        try { localCache = await resizeAvatarImage(file); } catch { /* Cloud upload succeeded; local fallback is optional. */ }
        onChange({ ...preferences, avatarMode: "image", avatarImageDataUrl: localCache, socialAvatarMigrationDismissedFor: userId ?? undefined });
        onSocialAvatarChanged(url);
        setImageMessage("Profil fotoğrafı sosyal profil ile senkronize edildi.");
      } else {
        const avatarImageDataUrl = await resizeAvatarImage(file);
        onChange({ ...preferences, avatarMode: "image", avatarImageDataUrl });
        setImageMessage("Profil fotoğrafı yalnızca bu cihazda güncellendi.");
      }
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Resim yüklenemedi.");
    } finally {
      setImageBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const migrateExistingAvatar = async () => {
    setImageBusy(true);
    setImageError(null);
    setImageMessage(null);
    try {
      const result = await migrateLocalAvatar({
        confirmed: true,
        localAvatarDataUrl: preferences.avatarImageDataUrl,
        upload: async (dataUrl) => uploadSocialAvatar(await dataUrlToFile(dataUrl)),
      });
      if (result.status === "uploaded") {
        onChange({ ...preferences, socialAvatarMigrationDismissedFor: userId ?? undefined });
        onSocialAvatarChanged(result.value);
        setImageMessage("Mevcut profil fotoğrafın sosyal profile taşındı.");
      }
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Profil fotoğrafı taşınamadı.");
    } finally {
      setImageBusy(false);
    }
  };

  const removeImage = async () => {
    setImageError(null);
    setImageMessage(null);
    if (authenticated && hasSocialProfile && socialAvatarUrl) {
      setImageBusy(true);
      try {
        const response = await fetch("/api/social/assets?kind=avatar", { method: "DELETE" });
        const result = await response.json() as { message?: string };
        if (!response.ok) throw new Error(result.message ?? "Profil fotoğrafı kaldırılamadı.");
        onChange({ ...preferences, socialAvatarMigrationDismissedFor: userId ?? undefined });
        onSocialAvatarChanged(undefined);
        setImageMessage("Sosyal profil fotoğrafı kaldırıldı; yerel fallback korunuyor.");
      } catch (error) {
        setImageError(error instanceof Error ? error.message : "Profil fotoğrafı kaldırılamadı.");
      } finally {
        setImageBusy(false);
      }
      return;
    }
    onChange({ ...preferences, avatarImageDataUrl: undefined, avatarMode: "initials" });
    setImageMessage("Yerel profil fotoğrafı kaldırıldı.");
  };

  return (
    <section className="bg-[var(--app-panel-bg)] rounded-2xl border border-[var(--app-border)] p-4 sm:p-5 min-w-0">
      <div className="flex flex-col gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <ProfileAvatar profileName={profileName} preferences={preferences} socialAvatarUrl={socialAvatarUrl} imageTransform={avatarTransform} size="sm" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-[var(--app-text-primary)] tracking-tight">Profil fotoğrafı</h3>
                <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                  Sidebar, mobil üst çubuk ve profil alanlarında kullanılan ortak kimlik.
                </p>
              </div>
            </div>
            <span className="inline-flex w-fit rounded-full bg-[var(--app-surface-2)] px-2.5 py-1 text-[11px] text-[var(--app-text-muted)] ring-1 ring-[var(--app-border)]">
              {avatarStatus}
            </span>
          </div>

          {showIdentityFields && <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Görünen ad
              </span>
              <input
                type="text"
                value={preferences.displayName}
                onChange={(e) => setPreference("displayName", e.target.value.slice(0, 48))}
                placeholder={profileName}
                className="mt-1.5 w-full h-10 rounded-xl bg-zinc-950/45 border border-zinc-800/70 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/25 focus:border-amber-500/35"
              />
            </label>

            <label className="min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Profil alt yazısı
              </span>
              <input
                type="text"
                value={preferences.profileTagline}
                onChange={(e) => setPreference("profileTagline", e.target.value.slice(0, 80))}
                placeholder="Kendi medya yolculuğum"
                className="mt-1.5 w-full h-10 rounded-xl bg-zinc-950/45 border border-zinc-800/70 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-amber-500/25 focus:border-amber-500/35"
              />
            </label>
          </div>}

          {!hasSocialProfile && <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Avatar türü
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {AVATAR_MODE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPreference("avatarMode", option.value)}
                    className={`rounded-lg px-3 py-2 text-xs font-medium ring-1 transition-colors cursor-pointer ${
                      preferences.avatarMode === option.value
                        ? "bg-amber-500/15 text-amber-200 ring-amber-500/35"
                        : "bg-zinc-950/35 text-zinc-400 ring-zinc-800/70 hover:text-zinc-200"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Accent
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ACCENT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPreference("avatarAccent", option.value)}
                    className={`inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-xs font-medium ring-1 transition-colors cursor-pointer ${
                      preferences.avatarAccent === option.value
                        ? "bg-zinc-800/80 text-zinc-100 ring-zinc-600"
                        : "bg-zinc-950/35 text-zinc-500 ring-zinc-800/70 hover:text-zinc-200"
                    }`}
                  >
                    <span className={`h-3 w-3 rounded-full ${option.className}`} />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Hazır avatar
              </p>
              <select
                value={preferences.presetAvatar}
                onChange={(e) => setPreference("presetAvatar", e.target.value as PresetAvatar)}
                className="mt-2 h-10 w-full rounded-xl bg-zinc-950/45 border border-zinc-800/70 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/25 focus:border-amber-500/35 cursor-pointer"
              >
                {PRESET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>}

          {offerMigration && <div className="mt-5 rounded-xl border border-violet-500/25 bg-violet-500/[0.07] p-4">
            <p className="text-sm font-medium text-violet-100">Mevcut yerel avatarını sosyal profil fotoğrafın olarak kullanmak ister misin?</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={imageBusy} onClick={() => void migrateExistingAvatar()} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">Sosyal avatar olarak kullan</button>
              <button type="button" onClick={() => onChange({ ...preferences, socialAvatarMigrationDismissedFor: userId ?? undefined })} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300">Şimdilik kullanma</button>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300">Yeni görsel seç</button>
            </div>
          </div>}

          <div className="mt-5 rounded-xl border border-zinc-800/60 bg-zinc-950/25 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-200">Profil fotoğrafı</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {authenticated && hasSocialProfile ? "Seçilen JPG, PNG veya WebP sosyal profile yüklenir; yerel kopya yalnız fallback olarak tutulur." : "Seçilen görsel 256x256 boyuta küçültülüp yalnızca bu tarayıcıda saklanır."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={authenticated && hasSocialProfile ? "image/jpeg,image/png,image/webp" : "image/*"}
                  className="hidden"
                  onChange={(e) => handleImageFile(e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={imageBusy}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-800 px-3 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:opacity-50 cursor-pointer"
                >
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  {imageBusy ? "İşleniyor" : "Resim seç"}
                </button>
                <button
                  type="button"
                  onClick={() => void removeImage()}
                  disabled={imageBusy}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-800/80 px-3 text-xs font-medium text-zinc-400 transition-colors hover:border-rose-500/35 hover:bg-rose-500/10 hover:text-rose-200 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Resmi kaldır
                </button>
              </div>
            </div>
            {imageError && (
              <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-rose-500/25">
                {imageError}
              </p>
            )}
            {imageMessage && <p role="status" className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 ring-1 ring-emerald-500/25">{imageMessage}</p>}
          </div>

          {showIdentityFields && <div className="mt-5 grid grid-cols-1 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Ünvan
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {TITLE_MODE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPreference("selectedTitleMode", option.value)}
                    className={`rounded-lg px-3 py-2 text-xs font-medium ring-1 transition-colors cursor-pointer ${
                      preferences.selectedTitleMode === option.value
                        ? "bg-violet-500/15 text-violet-200 ring-violet-500/35"
                        : "bg-zinc-950/35 text-zinc-400 ring-zinc-800/70 hover:text-zinc-200"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Manuel ünvan
              </span>
              <input
                type="text"
                value={preferences.manualTitle}
                onChange={(e) => setPreference("manualTitle", e.target.value.slice(0, 48))}
                disabled={preferences.selectedTitleMode !== "manual"}
                placeholder={automaticTitle}
                className="mt-1.5 w-full h-10 rounded-xl bg-zinc-950/45 border border-zinc-800/70 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-500/35 disabled:opacity-50"
              />
            </label>
          </div>}
        </div>
      </div>
    </section>
  );
}
