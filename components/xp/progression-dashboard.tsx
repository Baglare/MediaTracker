"use client";

import { useCallback, useEffect, useState } from "react";
import { Award, Compass, RefreshCw, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import { loadMediaList } from "@/lib/storage";
import { buildSafeMediaState, earnedWorldTitles, xpEventLabel, XP_TRUST_LABELS } from "@/lib/xp/progression";
import type { XpDashboardSummary } from "@/lib/xp/types";
import { parseXpDashboard } from "@/lib/xp/validation";

const WORLD_LABELS = { east: "Doğu", screen: "Kadraj", arch: "Arşiv" } as const;
const BRANCH_LABELS = { tracker: "İz Sürücü", explorer: "Kaşif", critic: "Eleştirmen", curator: "Küratör", connector: "Bağ Kurucu" } as const;

export function ProgressionDashboard() {
  const [summary, setSummary] = useState<XpDashboardSummary>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true); setError(undefined);
    try {
      const response = await fetch("/api/xp", { cache: "no-store" });
      const parsed = response.ok ? parseXpDashboard(await response.json()) : null;
      if (!parsed) throw new Error("xp_unavailable");
      setSummary(parsed);
    } catch { setError("XP özeti yüklenemedi. Yerel kütüphanen etkilenmedi."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/xp", { cache: "no-store" }).then(async (response) => {
      const parsed = response.ok ? parseXpDashboard(await response.json()) : null;
      if (!parsed) throw new Error("xp_unavailable");
      if (active) setSummary(parsed);
    }).catch(() => { if (active) setError("XP özeti yüklenemedi. Yerel kütüphanen etkilenmedi."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function synchronizeLibrary() {
    setMessage(undefined);
    const items = (loadMediaList() ?? []).map((item) => buildSafeMediaState(item));
    const response = await fetch("/api/xp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync_states", items, replace: true }) });
    const body = await response.json().catch(() => ({})) as { message?: string; xpDelta?: number; changedEntitlements?: number };
    if (!response.ok) { setMessage(body.message ?? "Kütüphane XP ile eşitlenemedi."); return; }
    const delta = body.xpDelta ?? 0;
    setMessage(`Kütüphane eşitlendi · ${delta >= 0 ? "+" : ""}${delta} XP güncellendi (${body.changedEntitlements ?? 0} durum).`); window.dispatchEvent(new CustomEvent("media-tracker:xp-changed")); await refresh();
  }

  async function saveBadges(badgeKey: string) {
    if (!summary) return;
    const selected = summary.badges.filter((badge) => badge.selected).map((badge) => badge.key);
    const next = selected.includes(badgeKey) ? selected.filter((key) => key !== badgeKey) : [...selected, badgeKey];
    if (next.length > 5) { setMessage("Profilinde en fazla 5 rozet sergileyebilirsin."); return; }
    const response = await fetch("/api/xp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "select_badges", badgeKeys: next }) });
    if (!response.ok) { setMessage("Rozet seçimi kaydedilemedi."); return; }
    setMessage("Profil rozetleri güncellendi."); await refresh();
  }

  async function saveTitle(title: string) {
    if (!title) return;
    const response = await fetch("/api/xp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "select_title", title }) });
    if (!response.ok) { setMessage("Unvan seçimi kaydedilemedi."); return; }
    setMessage("Ana unvan güncellendi."); window.dispatchEvent(new CustomEvent("media-tracker:xp-changed")); await refresh();
  }

  if (loading && !summary) return <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-400">İlerleme yükleniyor…</div>;
  if (error && !summary) return <div className="rounded-2xl border border-rose-900/50 bg-rose-950/20 p-6"><p className="text-sm text-rose-200">{error}</p><button type="button" onClick={() => void refresh()} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-xs"><RefreshCw className="h-4 w-4" />Tekrar dene</button></div>;
  if (!summary) return null;
  const current = summary.totalXp - summary.currentLevelStartXp;
  const span = summary.nextLevelStartXp - summary.currentLevelStartXp;
  const percent = span > 0 ? Math.min(100, Math.max(0, Math.round(current / span * 100))) : 0;

  return <div className="space-y-5">
    <section className="rounded-2xl border border-amber-500/20 bg-zinc-900/45 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-amber-300">Genel Yolculuk Seviyesi</p><h1 className="mt-2 text-3xl font-semibold">Seviye {summary.level}</h1><p className="mt-1 text-sm text-zinc-400">{summary.totalXp} toplam XP · sonraki seviyeye {Math.max(0, summary.nextLevelStartXp-summary.totalXp)} XP</p></div><Trophy className="h-10 w-10 text-amber-300" aria-hidden="true" /></div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-amber-400" style={{ width: `${percent}%` }} /></div>
      {(summary.worlds.length>0||summary.badges.length>0)&&<label className="mt-5 block max-w-sm text-xs text-zinc-400">Ana unvan<select value={summary.selectedTitle??""} onChange={(event)=>void saveTitle(event.target.value)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"><option value="" disabled>Kazanılmış unvan seç</option>{[...new Set([...summary.worlds.flatMap((world)=>earnedWorldTitles(world.key,world.level)),...summary.badges.map((badge)=>badge.name)])].map((title)=><option key={title} value={title}>{title}</option>)}</select></label>}
      <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4"><p className="text-sm font-medium">Kütüphanemi XP V2 ile eşitle</p><p className="mt-1 text-xs text-zinc-500">Her medyanın güvenli mevcut durumu eşitlenir; kişisel not, tam medya kaydı ve client XP hesabı gönderilmez. İşlem tekrar çalıştırılabilir.</p><button type="button" onClick={() => void synchronizeLibrary()} className="mt-3 rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-200 ring-1 ring-amber-500/25">Kütüphaneyi eşitle</button></div>
      {summary.librarySynchronized && <p className="mt-4 text-xs text-sky-300">Current-state kütüphane eşitlemesi etkin.</p>}{message && <p className="mt-3 text-xs text-zinc-300">{message}</p>}
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="XP kaynak dökümü">
      {[{label:"Aktif kütüphane ilerlemesi",value:summary.breakdown.localCurrentXp},{label:"Sosyal olarak doğrulandı",value:summary.breakdown.socialXp},{label:"Kalıcı görev ve sistem",value:summary.breakdown.systemXp},{label:"Eski ilerleme düzeltmesi",value:summary.breakdown.legacyCorrectionXp}].map((item)=><div key={item.label} className="rounded-xl border border-zinc-800 bg-zinc-900/35 p-3"><p className="text-xs text-zinc-500">{item.label}</p><p className="mt-1 text-lg font-semibold text-zinc-200">{item.value} XP</p></div>)}
    </section>

    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/35 p-5"><h2 className="flex items-center gap-2 text-sm font-semibold"><Compass className="h-4 w-4 text-cyan-300" />Dünya ustalıkları</h2><div className="mt-4 space-y-3">{(["east","screen","arch"] as const).map((key) => { const world=summary.worlds.find((item)=>item.key===key); return <div key={key} className="rounded-xl bg-zinc-950/40 p-3"><div className="flex justify-between gap-3"><span className="text-sm">{WORLD_LABELS[key]}</span><span className="text-xs text-zinc-400">Seviye {world?.level??1} · {world?.xp??0} XP</span></div><p className="mt-1 text-xs text-zinc-500">{world?.title ?? `${WORLD_LABELS[key]} Yolcusu`}</p></div>; })}</div></section>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/35 p-5"><h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-violet-300" />Uzmanlık dalları</h2><div className="mt-4 grid gap-2 sm:grid-cols-2">{(Object.keys(BRANCH_LABELS) as Array<keyof typeof BRANCH_LABELS>).map((key)=>{const branch=summary.branches.find((item)=>item.key===key);return <div key={key} className="rounded-xl bg-zinc-950/40 p-3"><p className="text-sm">{BRANCH_LABELS[key]}</p><p className="mt-1 text-xs text-zinc-500">Seviye {branch?.level??1} · {branch?.xp??0} XP</p></div>;})}</div></section>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/35 p-5"><h2 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-300" />Görevler</h2><div className="mt-4 space-y-2">{summary.quests.map((quest)=><div key={quest.key} className="rounded-xl bg-zinc-950/40 p-3"><div className="flex justify-between gap-3"><p className="text-sm font-medium">{quest.name}</p><span className="text-xs text-zinc-500">{quest.active ? `${quest.currentValue}/${quest.target}` : "Yakında"}</span></div><p className="mt-1 text-xs text-zinc-500">{quest.description} · +{quest.rewardXp} XP</p></div>)}</div></section>
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/35 p-5"><h2 className="flex items-center gap-2 text-sm font-semibold"><Award className="h-4 w-4 text-amber-300" />Rozetler</h2><p className="mt-1 text-xs text-zinc-500">Profilinde göstermek için en fazla 5 kazanılmış rozet seç.</p>{summary.badges.length===0?<p className="mt-4 text-sm text-zinc-500">Henüz kazanılmış rozet yok.</p>:<div className="mt-4 grid gap-2">{summary.badges.map((badge)=><button type="button" onClick={()=>void saveBadges(badge.key)} key={badge.key} aria-pressed={badge.selected} className={`rounded-xl p-3 text-left ring-1 ${badge.selected?"bg-amber-500/10 ring-amber-500/35":"bg-zinc-950/40 ring-zinc-800"}`}><p className="text-sm font-medium">{badge.name}{badge.selected&&<span className="ml-2 text-xs text-amber-300">Seçili</span>}</p><p className="mt-1 text-xs text-zinc-500">{badge.description}</p></button>)}</div>}</section>
    </div>

    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/35 p-5"><h2 className="text-sm font-semibold">Son XP olayları</h2>{summary.events.length===0?<p className="mt-4 text-sm text-zinc-500">Henüz XP olayı yok.</p>:<div className="mt-4 space-y-2">{summary.events.map((event)=>{const amount=event.allocations.reduce((sum,item)=>item.axisType==="general"?sum+item.amount:sum,0)*event.effect;return <div key={event.id} className="flex flex-col gap-1 rounded-xl bg-zinc-950/40 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm">{xpEventLabel(event.eventType,event.action)}</p><p className="text-xs text-zinc-500">{XP_TRUST_LABELS[event.trustLevel]} · {new Date(event.occurredAt).toLocaleString("tr-TR")}</p></div><span className={`text-sm font-semibold ${amount<0?"text-rose-300":"text-amber-300"}`}>{amount>=0?"+":""}{amount} XP</span></div>;})}</div>}</section>
  </div>;
}
