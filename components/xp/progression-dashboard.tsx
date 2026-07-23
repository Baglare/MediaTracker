"use client";

import { useCallback, useEffect, useState } from "react";
import { Award, BookOpen, Clapperboard, ShieldCheck, Swords, Trophy } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { PageSection } from "@/components/ui/page-section";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { WORLD_THEME_REGISTRY } from "@/lib/personalization/world-theme-registry";
import { loadMediaList } from "@/lib/storage";
import { buildSafeMediaState, earnedWorldTitles, xpEventLabel, XP_TRUST_LABELS } from "@/lib/xp/progression";
import type { XpDashboardSummary, XpWorldKey } from "@/lib/xp/types";
import { parseXpDashboard } from "@/lib/xp/validation";

const BRANCH_LABELS = { tracker: "İz Sürücü", explorer: "Kaşif", critic: "Eleştirmen", curator: "Küratör", connector: "Bağ Kurucu" } as const;
const WORLD_ICONS = { east: Swords, screen: Clapperboard, arch: BookOpen } as const;

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

  if (loading && !summary) return <LoadingState label="İlerleme yükleniyor…" rows={5}/>;
  if (error && !summary) return <ErrorState title="İlerleme yüklenemedi" description={error} onRetry={() => void refresh()}/>;
  if (!summary) return null;
  const current = summary.totalXp - summary.currentLevelStartXp;
  const span = summary.nextLevelStartXp - summary.currentLevelStartXp;
  const percent = span > 0 ? Math.min(100, Math.max(0, Math.round(current / span * 100))) : 0;

  return <div className="space-y-5">
    <PageSection
      title="Genel Yolculuk Seviyesi"
      description={`${summary.totalXp} toplam XP · sonraki seviyeye ${Math.max(0, summary.nextLevelStartXp-summary.totalXp)} XP`}
      action={<Link href="/profile" className="rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-surface-1)] px-3 py-2 text-xs font-medium text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]">Profilime dön</Link>}
      className="border-[color-mix(in_srgb,var(--app-warning)_28%,var(--app-border))]"
    >
      <div className="flex items-start justify-between gap-4"><p className="text-3xl font-semibold text-[var(--app-text-primary)]">Seviye {summary.level}</p><Trophy className="h-10 w-10 text-[var(--app-warning)]" aria-hidden="true"/></div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--app-surface-3)]" role="progressbar" aria-label="Sonraki seviyeye ilerleme" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><div className="h-full rounded-full bg-[var(--app-warning)]" style={{width:`${percent}%`}}/></div>
      {(summary.worlds.length>0||summary.badges.length>0)&&<label className="mt-5 block max-w-sm text-xs text-[var(--app-text-secondary)]">Ana unvan<select value={summary.selectedTitle??""} onChange={(event)=>void saveTitle(event.target.value)} className="app-input mt-2 w-full rounded-lg border px-3 py-2 text-sm"><option value="" disabled>Kazanılmış unvan seç</option>{[...new Set([...summary.worlds.flatMap((world)=>earnedWorldTitles(world.key,world.level)),...summary.badges.map((badge)=>badge.name)])].map((title)=><option key={title} value={title}>{title}</option>)}</select></label>}
      <div className="mt-5 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-4"><p className="text-sm font-medium">Kütüphanemi XP V2 ile eşitle</p><p className="mt-1 text-xs leading-5 text-[var(--app-text-muted)]">Her medyanın güvenli mevcut durumu eşitlenir; kişisel not, tam medya kaydı ve client XP hesabı gönderilmez.</p><button type="button" onClick={()=>void synchronizeLibrary()} className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--app-warning)_38%,transparent)] bg-[var(--app-warning-soft)] px-3 py-2 text-xs font-semibold text-[var(--app-warning)]">Kütüphaneyi eşitle</button></div>
      {summary.librarySynchronized&&<p className="mt-4 text-xs text-[var(--app-success)]">Kütüphane mevcut durum eşitlemesi etkin.</p>}{message&&<p role="status" className="mt-3 text-xs text-[var(--app-text-secondary)]">{message}</p>}
    </PageSection>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="XP kaynak dökümü">
      <StatCard label="Aktif kütüphane ilerlemesi" value={`${summary.breakdown.localCurrentXp} XP`}/>
      <StatCard label="Sosyal olarak doğrulandı" value={`${summary.breakdown.socialXp} XP`} tone="success"/>
      <StatCard label="Kalıcı görev ve sistem" value={`${summary.breakdown.systemXp} XP`} tone="warning"/>
      <StatCard label="Eski ilerleme düzeltmesi" value={`${summary.breakdown.legacyCorrectionXp} XP`}/>
    </section>

    <div className="grid gap-5 xl:grid-cols-2">
      <PageSection title="Dünya ustalıkları" description="Doğu, Kadraj ve Arşiv yolculuğundaki seviyelerin.">
        <div className="grid gap-3">{(["east","screen","arch"] as const).map((key)=><WorldMasteryCard key={key} worldKey={key} world={summary.worlds.find((item)=>item.key===key)}/>)}</div>
      </PageSection>
      <PageSection title="Uzmanlık dalları" description="Takip, keşif, eleştiri, kürasyon ve bağlantı ustalıkların.">
        <div className="grid gap-2 sm:grid-cols-2">{(Object.keys(BRANCH_LABELS) as Array<keyof typeof BRANCH_LABELS>).map((key)=>{const branch=summary.branches.find((item)=>item.key===key);return <article key={key} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] p-3"><p className="text-sm font-medium">{BRANCH_LABELS[key]}</p><p className="mt-1 text-xs text-[var(--app-text-muted)]">Seviye {branch?.level??1} · {branch?.xp??0} XP</p></article>;})}</div>
      </PageSection>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <PageSection title="Görevler" description="Kalıcı ilerleme hedeflerin.">
        {summary.quests.length===0?<EmptyState compact title="Etkin görev yok" description="Yeni görevler açıldığında burada görünecek." icon={<ShieldCheck className="h-5 w-5" aria-hidden="true"/>}/>:<div className="space-y-2">{summary.quests.map((quest)=><article key={quest.key} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] p-3"><div className="flex justify-between gap-3"><p className="text-sm font-medium">{quest.name}</p><StatusBadge tone={quest.active?"accent":"neutral"}>{quest.active?`${quest.currentValue}/${quest.target}`:"Yakında"}</StatusBadge></div><p className="mt-1 text-xs text-[var(--app-text-muted)]">{quest.description} · +{quest.rewardXp} XP</p></article>)}</div>}
      </PageSection>
      <PageSection title="Rozetler" description="Profilinde göstermek için en fazla 5 kazanılmış rozet seç.">
        {summary.badges.length===0?<EmptyState compact title="Henüz rozet yok" description="Kazandığın rozetler burada sergilenecek." icon={<Award className="h-5 w-5" aria-hidden="true"/>}/>:<div className="grid gap-2">{summary.badges.map((badge)=><button type="button" onClick={()=>void saveBadges(badge.key)} key={badge.key} aria-pressed={badge.selected} className={`rounded-xl border p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] ${badge.selected?"border-[var(--app-selected-border)] bg-[var(--app-selected-bg)]":"border-[var(--app-border)] bg-[var(--app-surface-2)] hover:bg-[var(--app-card-hover)]"}`}><p className="text-sm font-medium">{badge.name}{badge.selected&&<span className="ml-2 text-xs text-[var(--app-selected-text)]">✓ Seçili</span>}</p><p className="mt-1 text-xs text-[var(--app-text-muted)]">{badge.description}</p></button>)}</div>}
      </PageSection>
    </div>

    <PageSection title="Son XP olayları" description="İlerlemene etki eden en yeni hareketler.">
      {summary.events.length===0?<EmptyState compact title="Henüz XP olayı yok" description="Kütüphane ve sosyal ilerleme hareketleri burada görünecek."/>:<div className="space-y-2">{summary.events.map((event)=>{const amount=event.allocations.reduce((sum,item)=>item.axisType==="general"?sum+item.amount:sum,0)*event.effect;return <article key={event.id} className="flex flex-col gap-1 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm">{xpEventLabel(event.eventType,event.action)}</p><p className="text-xs text-[var(--app-text-muted)]">{XP_TRUST_LABELS[event.trustLevel]} · {new Date(event.occurredAt).toLocaleString("tr-TR")}</p></div><span className={`text-sm font-semibold ${amount<0?"text-[var(--app-danger)]":"text-[var(--app-warning)]"}`}>{amount>=0?"+":""}{amount} XP</span></article>;})}</div>}
    </PageSection>
  </div>;
}

function WorldMasteryCard({worldKey,world}:{worldKey:XpWorldKey;world:XpDashboardSummary["worlds"][number]|undefined}) {
  const definition=WORLD_THEME_REGISTRY[worldKey];
  const Icon=WORLD_ICONS[worldKey];
  return <article data-world={worldKey} className="world-identity-card relative overflow-hidden rounded-xl border border-[var(--w-border)] bg-[var(--w-soft)] p-4">
    <span className="world-identity-motif pointer-events-none absolute inset-0" aria-hidden="true"/>
    <div className="relative flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--w-border)] bg-[var(--app-panel-bg)] text-[var(--w-primary-strong)]"><Icon className="h-4 w-4" aria-hidden="true"/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{definition.label}</p><span className="text-xs tabular-nums text-[var(--app-text-secondary)]">Seviye {world?.level??1} · {world?.xp??0} XP</span></div><p className="mt-1 text-xs text-[var(--app-text-muted)]">{world?.title??`${definition.label} Yolcusu`} · {definition.shortDescription}</p></div></div>
  </article>;
}
