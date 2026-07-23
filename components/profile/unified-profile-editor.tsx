"use client";

import { useMemo, useState } from "react";

import ProfileSettingsCard from "@/components/profile-settings-card";
import { ImagePositionEditor } from "@/components/profile/image-position-editor";
import { ProfileHero } from "@/components/profile/profile-hero";
import { SocialLayoutEditor } from "@/components/social/social-layout-editor";
import { SocialPreferencesPanel } from "@/components/social/social-preferences-panel";
import { SocialSharingEditor } from "@/components/social/social-sharing-editor";
import {
  PROFILE_AVATAR_FRAMES,
  PROFILE_BANNER_MODES,
  PROFILE_BANNER_POSITIONS,
  PROFILE_MOTIF_INTENSITIES,
  PROFILE_OVERLAY_STRENGTHS,
  PROFILE_PALETTE_IDS,
  PROFILE_SURFACE_STYLES,
} from "@/lib/personalization/validation";
import { resolveProfileIdentity } from "@/lib/personalization/profile-identity";
import { defaultImageTransform } from "@/lib/personalization/image-transform";
import type { ProfilePresentationPreferences } from "@/lib/personalization/types";
import type { ProfilePreferences } from "@/lib/profile-preferences";
import { defaultProfileModules, mergeModuleDefaults } from "@/lib/social/grid";
import { prefillSocialProfile } from "@/lib/social/snapshots";
import { CONNECTION_COLORS, PROFILE_VISIBILITIES, type ProfileModuleLayout, type SocialProfileEditorData, type SocialProfileInput } from "@/lib/social/types";
import { validateSocialProfileInput } from "@/lib/social/validation";
import type { MediaItem } from "@/lib/types";
import type { UserProgression } from "@/lib/user-progression";

const EMPTY: SocialProfileEditorData = { configured: false, authenticated: false, modules: [], favorites: [], current: [], sharedNotes: [], blockedAccounts: [] };
const INPUT_CLASS = "app-input mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]";

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/social/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json() as { message?: string };
  if (!response.ok) throw new Error(result.message ?? "İşlem tamamlanamadı.");
}

function updatePresentation<K extends keyof ProfilePresentationPreferences>(form: SocialProfileInput, key: K, value: ProfilePresentationPreferences[K]): SocialProfileInput {
  return { ...form, presentation: { ...form.presentation, [key]: value } };
}

export function UnifiedProfileEditor({ initialData, authConfigured, authenticated, userId, localPreferences, onLocalPreferencesChange, profileName, selectedTitle, media, progression, socialAvatarUrl, onProfileChanged }: {
  initialData?: SocialProfileEditorData;
  authConfigured: boolean;
  authenticated: boolean;
  userId: string | null;
  localPreferences: ProfilePreferences;
  onLocalPreferencesChange: (value: ProfilePreferences) => void;
  profileName: string;
  selectedTitle: string;
  media: MediaItem[];
  progression: UserProgression;
  socialAvatarUrl?: string;
  onProfileChanged: () => Promise<SocialProfileEditorData | undefined>;
}) {
  const localOnly = !authConfigured || !authenticated;
  const initialPrefill = useMemo(() => prefillSocialProfile(localPreferences, profileName, selectedTitle), [localPreferences, profileName, selectedTitle]);
  const seed = initialData ?? (localOnly ? EMPTY : { ...EMPTY, configured: authConfigured, authenticated });
  const seedForm = seed.profile ?? initialPrefill;
  const [data, setData] = useState<SocialProfileEditorData>(seed);
  const [form, setForm] = useState<SocialProfileInput>(seedForm);
  const [savedForm, setSavedForm] = useState<SocialProfileInput>(seedForm);
  const [modules, setModules] = useState<ProfileModuleLayout[]>(seed.modules.length ? mergeModuleDefaults(seed.modules) : defaultProfileModules());
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function applyData(next: SocialProfileEditorData) {
    setData(next);
    const nextForm = next.profile ?? initialPrefill;
    setForm(nextForm);
    setSavedForm(nextForm);
    setModules(next.modules.length ? mergeModuleDefaults(next.modules) : defaultProfileModules());
  }

  async function refreshFromParent() {
    const next = await onProfileChanged();
    if (next) applyData(next);
  }

  const identity = resolveProfileIdentity({ authenticated: !localOnly, localPreferences, socialProfile: { ...form, avatarUrl: data.profile?.avatarUrl ?? socialAvatarUrl, bannerUrl: data.profile?.bannerUrl }, fallbackName: profileName, automaticTitle: selectedTitle });
  function update<K extends keyof SocialProfileInput>(key: K, value: SocialProfileInput[K]) { setForm((current) => ({ ...current, [key]: value })); }

  async function save() {
    setMessage(""); setError("");
    if (localOnly) {
      onLocalPreferencesChange({ ...localPreferences, displayName: form.displayName.slice(0, 48), profileTagline: form.tagline.slice(0, 80), manualTitle: form.selectedTitle?.slice(0, 48) ?? localPreferences.manualTitle });
      setSavedForm(form);
      setMessage("Yerel profil bu cihazda kaydedildi.");
      return;
    }
    const validation = validateSocialProfileInput(form);
    if (!validation.ok) { setError(validation.error); return; }
    try {
      await post({ action: "save_profile", profile: validation.value });
      onLocalPreferencesChange({ ...localPreferences, displayName: validation.value.displayName.slice(0, 48), profileTagline: validation.value.tagline.slice(0, 80) });
      const created = !data.profile;
      setSavedForm(validation.value);
      const next = await onProfileChanged();
      if (next) applyData(next);
      setMessage(created ? "Cloud profil oluşturuldu." : "Profil değişiklikleri kaydedildi.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Profil kaydedilemedi."); }
  }

  async function uploadBanner(file: File | undefined) {
    if (!file || !data.profile) return;
    const body = new FormData(); body.set("kind", "banner"); body.set("file", file);
    try {
      const response = await fetch("/api/social/assets", { method: "POST", body });
      const result = await response.json() as { url?: string; message?: string };
      if (!response.ok) throw new Error(result.message ?? "Banner yüklenemedi.");
      if (!result.url) throw new Error("Banner kaydedildi ancak güvenli önizleme bağlantısı üretilemedi.");
      setData((current) => current.profile ? { ...current, profile: { ...current.profile, bannerUrl: result.url } } : current);
      setForm((current) => updatePresentation(
        updatePresentation(current, "bannerMode", "image"),
        "bannerTransform",
        defaultImageTransform(),
      ));
      setError("");
      setMessage("Banner yüklendi ve görsel modu seçildi. Kalıcı görünüm için değişiklikleri kaydet.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Banner yüklenemedi."); }
  }

  const cloudReady = !localOnly && Boolean(data.profile);
  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-xl border border-[var(--app-danger)] bg-[var(--app-danger-soft)] px-4 py-3 text-sm text-[var(--app-danger)]">{error}</p>}
      {message && <p role="status" className="rounded-xl border border-[var(--app-success)] bg-[var(--app-success-soft)] px-4 py-3 text-sm text-[var(--app-success)]">{message}</p>}
      <ProfileHero variant="preview" identity={identity} presentation={form.presentation} localPreferences={localPreferences} progression={{ level: progression.level, tier: progression.tier, dominantWorld: progression.dominantWorld }} onBannerError={() => setError("Banner görseli yüklenemedi; güvenli gradient fallback gösteriliyor.")} />

      <section className="app-panel rounded-2xl border p-4 sm:p-5">
        <h2 className="font-semibold">Kimlik</h2>
        <p className="mt-1 text-xs text-[var(--app-text-muted)]">{localOnly ? "Bu alanlar yalnızca bu cihazda saklanır. Cloud kontrolleri giriş yapılmadan gösterilmez." : data.profile ? "Cloud profil ana kaynaktır; güvenli kimlik alanları local fallback olarak güncellenir." : "Yerel değerler cloud profil oluşturma formuna ön dolduruldu. Kaydettiğinde aşağıdaki alanlar cloud’a gider."}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {!localOnly && <label className="text-xs text-[var(--app-text-muted)]">Kullanıcı adı<input value={form.username} onChange={(event) => update("username", event.target.value)} minLength={3} maxLength={24} className={INPUT_CLASS} /></label>}
          <label className="text-xs text-[var(--app-text-muted)]">Görünen ad<input value={form.displayName} onChange={(event) => update("displayName", event.target.value)} maxLength={60} className={INPUT_CLASS} /></label>
          <label className="text-xs text-[var(--app-text-muted)] sm:col-span-2">Tagline<input value={form.tagline} onChange={(event) => update("tagline", event.target.value)} maxLength={120} className={INPUT_CLASS} /></label>
          {!localOnly && <label className="text-xs text-[var(--app-text-muted)] sm:col-span-2">Bio<textarea value={form.bio} onChange={(event) => update("bio", event.target.value)} maxLength={500} rows={4} className={INPUT_CLASS} /></label>}
          {!localOnly && <><label className="text-xs text-[var(--app-text-muted)]">Konum<input value={form.location ?? ""} onChange={(event) => update("location", event.target.value)} maxLength={80} className={INPUT_CLASS} /></label><label className="text-xs text-[var(--app-text-muted)]">Dil<select value={form.language ?? ""} onChange={(event) => update("language", event.target.value)} className={INPUT_CLASS}><option value="">Belirtilmedi</option>{["tr","en","de","fr","es","it","pt","ja","ko","zh","other"].map((language) => <option key={language} value={language}>{language.toUpperCase()}</option>)}</select></label></>}
          <label className="text-xs text-[var(--app-text-muted)] sm:col-span-2">Seçili unvan<input value={form.selectedTitle ?? ""} onChange={(event) => update("selectedTitle", event.target.value)} maxLength={60} className={INPUT_CLASS} /></label>
        </div>
      </section>

      <ProfileSettingsCard preferences={localPreferences} profileName={form.displayName || profileName} automaticTitle={selectedTitle} onChange={onLocalPreferencesChange} authenticated={authenticated} userId={userId} hasSocialProfile={cloudReady} socialAvatarUrl={data.profile?.avatarUrl ?? socialAvatarUrl} avatarTransform={form.presentation.avatarTransform} onSocialAvatarChanged={(avatarUrl) => {
        setData((current) => current.profile ? { ...current, profile: { ...current.profile, avatarUrl } } : current);
        setForm((current) => ({ ...current, presentation: { ...current.presentation, avatarTransform: defaultImageTransform() } }));
      }} showIdentityFields={false} />

      {!localOnly && <section className="app-panel rounded-2xl border p-4 sm:p-5">
        <h2 className="font-semibold">Profil sunumu</h2><p className="mt-1 text-xs text-[var(--app-text-muted)]">Palette yalnız ProfileHero ve profil modül vurgularını etkiler; uygulama temasını değiştirmez.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs text-[var(--app-text-muted)]">Profil palette’i<select value={form.presentation.paletteId} onChange={(event) => setForm((current) => updatePresentation(current, "paletteId", event.target.value as ProfilePresentationPreferences["paletteId"]))} className={INPUT_CLASS}>{PROFILE_PALETTE_IDS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="text-xs text-[var(--app-text-muted)]">Banner türü<select value={form.presentation.bannerMode} onChange={(event) => setForm((current) => updatePresentation(current, "bannerMode", event.target.value as ProfilePresentationPreferences["bannerMode"]))} className={INPUT_CLASS}>{PROFILE_BANNER_MODES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="text-xs text-[var(--app-text-muted)]">Banner konumu<select value={form.presentation.bannerPosition} onChange={(event) => setForm((current) => updatePresentation(current, "bannerPosition", event.target.value as ProfilePresentationPreferences["bannerPosition"]))} className={INPUT_CLASS}>{PROFILE_BANNER_POSITIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="text-xs text-[var(--app-text-muted)]">Overlay gücü<select value={form.presentation.overlayStrength} onChange={(event) => setForm((current) => updatePresentation(current, "overlayStrength", event.target.value as ProfilePresentationPreferences["overlayStrength"]))} className={INPUT_CLASS}>{PROFILE_OVERLAY_STRENGTHS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="text-xs text-[var(--app-text-muted)]">Avatar çerçevesi<select value={form.presentation.avatarFrame} onChange={(event) => setForm((current) => updatePresentation(current, "avatarFrame", event.target.value as ProfilePresentationPreferences["avatarFrame"]))} className={INPUT_CLASS}>{PROFILE_AVATAR_FRAMES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="text-xs text-[var(--app-text-muted)]">Yüzey stili<select value={form.presentation.surfaceStyle} onChange={(event) => setForm((current) => updatePresentation(current, "surfaceStyle", event.target.value as ProfilePresentationPreferences["surfaceStyle"]))} className={INPUT_CLASS}>{PROFILE_SURFACE_STYLES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="text-xs text-[var(--app-text-muted)]">Motif yoğunluğu<select value={form.presentation.motifIntensity} onChange={(event) => setForm((current) => updatePresentation(current, "motifIntensity", event.target.value as ProfilePresentationPreferences["motifIntensity"]))} className={INPUT_CLASS}>{PROFILE_MOTIF_INTENSITIES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          {cloudReady && <label className="text-xs text-[var(--app-text-muted)]">Banner görseli<span className="mt-1 flex min-h-10 items-center rounded-lg border border-[var(--app-border)] px-3"><input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Banner görseli yükle" onChange={(event) => void uploadBanner(event.target.files?.[0])} /></span></label>}
        </div>
        {cloudReady && (data.profile?.bannerUrl || data.profile?.avatarUrl || socialAvatarUrl) && (
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {data.profile?.bannerUrl && <div><h3 className="mb-2 text-sm font-semibold text-[var(--app-text-primary)]">Banner odağı ve zoom</h3><ImagePositionEditor kind="banner" src={data.profile.bannerUrl} value={form.presentation.bannerTransform} onChange={(value) => setForm((current) => updatePresentation(current, "bannerTransform", value))} /></div>}
            {(data.profile?.avatarUrl ?? socialAvatarUrl) && <div><h3 className="mb-2 text-sm font-semibold text-[var(--app-text-primary)]">Profil fotoğrafı odağı ve zoom</h3><ImagePositionEditor kind="avatar" src={(data.profile?.avatarUrl ?? socialAvatarUrl) as string} value={form.presentation.avatarTransform} onChange={(value) => setForm((current) => updatePresentation(current, "avatarTransform", value))} /></div>}
          </div>
        )}
      </section>}

      {!localOnly && <section className="app-panel rounded-2xl border p-4 sm:p-5"><h2 className="font-semibold">Sosyal ve gizlilik</h2><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-xs text-[var(--app-text-muted)]">Profil görünürlüğü<select value={form.visibilityMode} onChange={(event) => update("visibilityMode", event.target.value as SocialProfileInput["visibilityMode"])} className={INPUT_CLASS}>{PROFILE_VISIBILITIES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label><label className="text-xs text-[var(--app-text-muted)]">Yin/Yang bağlantı rengi<select value={form.connectionColor} onChange={(event) => update("connectionColor", event.target.value as SocialProfileInput["connectionColor"])} className={INPUT_CLASS}>{CONNECTION_COLORS.map((color) => <option key={color} value={color}>{color}</option>)}</select></label></div><p className="mt-3 text-xs text-[var(--app-text-muted)]">Bağlantı rengi yalnız sosyal ilişki gösteriminde kullanılır; palette, banner veya uygulama accent’i değildir.</p></section>}

      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void save()} className="app-primary-action rounded-xl px-5 py-2.5 text-sm font-semibold">Değişiklikleri kaydet</button><button type="button" onClick={() => { setForm(savedForm); setMessage("Taslak değişiklikler geri alındı."); setError(""); }} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] px-5 py-2.5 text-sm">Vazgeç</button></div>

      {cloudReady && userId && <><SocialPreferencesPanel userId={userId} /><SocialLayoutEditor modules={modules} profileVisibility={form.visibilityMode} onChange={setModules} onSave={async () => { try { await post({ action: "save_modules", modules }); setMessage("Profil modülleri kaydedildi."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Modüller kaydedilemedi."); } }} /><SocialSharingEditor media={media} progression={progression} favorites={data.favorites} current={data.current} sharedNotes={data.sharedNotes} onRefresh={refreshFromParent} /></>}
      {!localOnly && !data.profile && <p className="rounded-xl border border-dashed border-[var(--app-border)] p-5 text-sm text-[var(--app-text-muted)]">Modül, paylaşım ve banner kontrolleri ilk cloud profil kaydından sonra açılır.</p>}
    </div>
  );
}
