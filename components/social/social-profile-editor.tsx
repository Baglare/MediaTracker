"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { SocialLayoutEditor } from "@/components/social/social-layout-editor";
import { SocialSharingEditor } from "@/components/social/social-sharing-editor";
import type { ProfilePreferences } from "@/lib/profile-preferences";
import { defaultProfileModules, mergeModuleDefaults } from "@/lib/social/grid";
import { prefillSocialProfile } from "@/lib/social/snapshots";
import { CONNECTION_COLORS, PROFILE_VISIBILITIES, type ProfileModuleLayout, type SocialProfileEditorData, type SocialProfileInput } from "@/lib/social/types";
import { validateSocialProfileInput } from "@/lib/social/validation";
import type { MediaItem } from "@/lib/types";
import type { UserProgression } from "@/lib/user-progression";

const EMPTY: SocialProfileEditorData = { configured: false, authenticated: false, modules: [], favorites: [], current: [], sharedNotes: [], blockedAccounts: [] };

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/social/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json() as { message?: string };
  if (!response.ok) throw new Error(result.message ?? "İşlem tamamlanamadı.");
}

export default function SocialProfileEditor({ authConfigured, authenticated, localPreferences, profileName, selectedTitle, media, progression }: { authConfigured: boolean; authenticated: boolean; localPreferences: ProfilePreferences; profileName: string; selectedTitle: string; media: MediaItem[]; progression: UserProgression }) {
  const [data, setData] = useState<SocialProfileEditorData>(EMPTY);
  const [form, setForm] = useState<SocialProfileInput>(() => prefillSocialProfile(localPreferences, profileName, selectedTitle));
  const [modules, setModules] = useState<ProfileModuleLayout[]>(defaultProfileModules());
  const [loading, setLoading] = useState(authConfigured && authenticated);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!authConfigured || !authenticated) { setLoading(false); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/social/profile", { cache: "no-store" });
      const next = await response.json() as SocialProfileEditorData;
      setData(next);
      if (next.profile) setForm(next.profile);
      setModules(next.modules.length ? mergeModuleDefaults(next.modules) : defaultProfileModules());
    } catch { setMessage("Sosyal profil verisi yüklenemedi."); }
    finally { setLoading(false); }
  }, [authConfigured, authenticated]);

  useEffect(() => {
    if (!authConfigured || !authenticated) return;
    let active = true;
    fetch("/api/social/profile", { cache: "no-store" })
      .then((response) => response.json() as Promise<SocialProfileEditorData>)
      .then((next) => {
        if (!active) return;
        setData(next);
        if (next.profile) setForm(next.profile);
        setModules(next.modules.length ? mergeModuleDefaults(next.modules) : defaultProfileModules());
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setMessage("Sosyal profil verisi yüklenemedi.");
        setLoading(false);
      });
    return () => { active = false; };
  }, [authConfigured, authenticated]);

  function update<K extends keyof SocialProfileInput>(key: K, value: SocialProfileInput[K]) { setForm((current) => ({ ...current, [key]: value })); }
  async function saveProfile() {
    const validation = validateSocialProfileInput(form);
    if (!validation.ok) { setMessage(validation.error); return; }
    try { await post({ action: "save_profile", profile: validation.value }); setMessage("Sosyal profil kaydedildi."); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Profil kaydedilemedi."); }
  }
  async function upload(kind: "avatar" | "banner", file: File | undefined) {
    if (!file) return;
    const body = new FormData(); body.set("kind", kind); body.set("file", file);
    try { const response = await fetch("/api/social/assets", { method: "POST", body }); const result = await response.json() as { message?: string; cleanupPending?: boolean }; if (!response.ok) throw new Error(result.message); setMessage(result.cleanupPending ? `${kind === "avatar" ? "Avatar" : "Banner"} güncellendi; eski dosya temizliği daha sonra gerekebilir.` : `${kind === "avatar" ? "Avatar" : "Banner"} güncellendi.`); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Görsel yüklenemedi."); }
  }
  async function unblock(targetId: string) {
    try {
      const response = await fetch("/api/social/relationships", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unblock", targetId }) });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message);
      setMessage("Engel kaldırıldı; eski takip ilişkileri geri yüklenmedi.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Engel kaldırılamadı."); }
  }
  if (!authConfigured) return <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"><h3 className="font-semibold">Cloud sosyal profil</h3><p className="mt-2 text-sm text-zinc-400">Sosyal sistem yapılandırılmamış. Yerel profil ve kütüphane normal çalışmaya devam eder.</p></section>;
  if (!authenticated) return <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"><h3 className="font-semibold">Cloud sosyal profil</h3><p className="mt-2 text-sm text-zinc-400">Profil oluşturmak, takip etmek ve paylaşım yapmak için Supabase hesabınla giriş yap.</p></section>;
  if (loading) return <section className="h-40 animate-pulse rounded-2xl bg-zinc-900" aria-label="Sosyal profil yükleniyor" />;
  return <div className="space-y-4">
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">Cloud sosyal profil</h3><p className="mt-1 max-w-3xl text-xs text-zinc-500">Yerel ad ve tagline yalnızca formu ön doldurur. Kaydetmeden cloud’a yazılmaz; yerel avatar otomatik yüklenmez ve yerel kütüphane/sync ayarları değişmez.</p></div>{data.profile?.username && <Link href={`/u/${data.profile.username}`} className="text-sm text-violet-300">Public profile git →</Link>}</div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs text-zinc-400">Kullanıcı adı<input value={form.username} onChange={(event) => update("username", event.target.value)} minLength={3} maxLength={24} placeholder="baglare" className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" /></label><label className="text-xs text-zinc-400">Görünen ad<input value={form.displayName} onChange={(event) => update("displayName", event.target.value)} maxLength={60} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" /></label><label className="sm:col-span-2 text-xs text-zinc-400">Bio<textarea value={form.bio} onChange={(event) => update("bio", event.target.value)} maxLength={500} rows={4} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" /></label><label className="text-xs text-zinc-400">Konum<input value={form.location ?? ""} onChange={(event) => update("location", event.target.value)} maxLength={80} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm" /></label><label className="text-xs text-zinc-400">Dil<select value={form.language ?? ""} onChange={(event) => update("language", event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"><option value="">Belirtilmedi</option>{["tr","en","de","fr","es","it","pt","ja","ko","zh","other"].map((language) => <option key={language} value={language}>{language.toUpperCase()}</option>)}</select></label><label className="text-xs text-zinc-400">Profil görünürlüğü<select value={form.visibilityMode} onChange={(event) => update("visibilityMode", event.target.value as SocialProfileInput["visibilityMode"])} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm">{PROFILE_VISIBILITIES.map((mode) => <option key={mode} value={mode}>{mode === "public" ? "Herkese açık" : mode === "protected" ? "Korumalı" : "Kişisel"}</option>)}</select></label><label className="text-xs text-zinc-400">Bağlantı rengi<select value={form.connectionColor} onChange={(event) => update("connectionColor", event.target.value as SocialProfileInput["connectionColor"])} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm">{CONNECTION_COLORS.map((color) => <option key={color} value={color}>{color}</option>)}</select></label></div>
      <p className="mt-3 text-xs text-zinc-500">Public → protected mevcut takipçileri korur; yeni istekler bekler. Personal moda geçiş accepted ilişkileri korur, pending istekleri kaldırır ve görünürlüğü kapatır.</p>
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void saveProfile()} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white">Sosyal profili kaydet</button>{data.profile && <><label className="cursor-pointer rounded-lg border border-zinc-700 px-3 py-2 text-sm">Avatar yükle<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void upload("avatar", event.target.files?.[0])} /></label><label className="cursor-pointer rounded-lg border border-zinc-700 px-3 py-2 text-sm">Banner yükle<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void upload("banner", event.target.files?.[0])} /></label></>}</div>{data.profile?.usernameChangedAt && <p className="mt-2 text-xs text-zinc-500">Son username kaydı: {new Date(data.profile.usernameChangedAt).toLocaleDateString("tr-TR")}. Sonraki değişiklik RPC’de 30 günlük kurala tabidir.</p>}{message && <p role="status" className="mt-3 text-sm text-zinc-400">{message}</p>}
    </section>
    {data.profile ? <><SocialLayoutEditor modules={modules} profileVisibility={form.visibilityMode} onChange={setModules} onSave={async () => { try { await post({ action: "save_modules", modules }); setMessage("Profil düzeni kaydedildi."); } catch (error) { setMessage(error instanceof Error ? error.message : "Düzen kaydedilemedi."); } }} /><SocialSharingEditor media={media} progression={progression} favorites={data.favorites} current={data.current} sharedNotes={data.sharedNotes} onRefresh={load} />{data.blockedAccounts.length > 0 && <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5"><h3 className="font-semibold">Engellenen hesaplar</h3><div className="mt-3 space-y-2">{data.blockedAccounts.map((account) => <div key={account.id} className="flex items-center justify-between rounded-lg bg-zinc-950/60 px-3 py-2 text-sm"><span>{account.displayName}{account.username ? ` · @${account.username}` : ""}</span><button type="button" onClick={() => void unblock(account.id)} className="text-xs text-violet-300">Engeli kaldır</button></div>)}</div></section>}</> : <section className="rounded-2xl border border-dashed border-zinc-800 p-5 text-sm text-zinc-500">Grid, vitrin ve paylaşım ayarları ilk sosyal profil kaydından sonra açılır.</section>}
  </div>;
}
