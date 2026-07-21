"use client";

import { useState } from "react";

import { applyGridPreset, defaultProfileModules, moveModule, reflowModules, type GridPreset } from "@/lib/social/grid";
import { MODULE_VISIBILITIES, type ProfileModuleKey, type ProfileModuleLayout, type ProfileVisibility, type ViewerPreviewMode } from "@/lib/social/types";
import { canViewModule, previewContext } from "@/lib/social/visibility";

const NAMES: Record<ProfileModuleKey, string> = { favorites: "Favori vitrini", current: "Şu anda", stats: "İstatistikler", progression: "Yolculuk seviyesi", badges: "Rozet altyapısı", follows: "Takip listeleri", shared_lists: "Paylaşılan liste altyapısı", shared_notes: "Paylaşılan notlar" };

export function SocialLayoutEditor({ modules, profileVisibility, onChange, onSave }: { modules: ProfileModuleLayout[]; profileVisibility: ProfileVisibility; onChange: (value: ProfileModuleLayout[]) => void; onSave: () => Promise<void> }) {
  const [preview, setPreview] = useState<ViewerPreviewMode>("self");
  const [dragged, setDragged] = useState<ProfileModuleKey | null>(null);
  const visible = modules.filter((module) => module.enabled && canViewModule(profileVisibility, module.visibility, previewContext(preview)));
  function update(key: ProfileModuleKey, patch: Partial<ProfileModuleLayout>) { onChange(modules.map((module) => module.moduleKey === key ? { ...module, ...patch } : module)); }
  function reorder(target: ProfileModuleKey) {
    if (!dragged || dragged === target) return;
    const ordered = [...modules].sort((a, b) => a.mobileOrder - b.mobileOrder);
    const from = ordered.findIndex((item) => item.moduleKey === dragged);
    const to = ordered.findIndex((item) => item.moduleKey === target);
    const [item] = ordered.splice(from, 1); ordered.splice(to, 0, item);
    onChange(reflowModules(ordered)); setDragged(null);
  }
  function resize(key: ProfileModuleKey, preset: GridPreset) { onChange(reflowModules(modules.map((module) => module.moduleKey === key ? applyGridPreset(module, preset) : module))); }
  return <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-zinc-100">Profil grid düzeni</h3><p className="text-xs text-zinc-500">12 sütun masaüstü; mobil sıra ayrıca korunur.</p></div><div className="flex gap-2"><button type="button" onClick={() => onChange(defaultProfileModules())} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs">Sıfırla</button><button type="button" onClick={() => void onSave()} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white">Düzeni kaydet</button></div></div>
    <div className="mt-4 grid gap-3 lg:grid-cols-2">{[...modules].sort((a, b) => a.mobileOrder - b.mobileOrder).map((module) => <article key={module.moduleKey} draggable onDragStart={() => setDragged(module.moduleKey)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorder(module.moduleKey)} className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="flex items-center justify-between gap-2"><strong className="text-sm">{NAMES[module.moduleKey]}</strong><label className="text-xs text-zinc-400"><input type="checkbox" checked={module.enabled} onChange={(event) => update(module.moduleKey, { enabled: event.target.checked })} className="mr-2" />Aktif</label></div>
      <div className="mt-3 flex flex-wrap gap-2"><select value={module.visibility} onChange={(event) => update(module.moduleKey, { visibility: event.target.value as ProfileModuleLayout["visibility"] })} className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs">{MODULE_VISIBILITIES.map((value) => <option key={value} value={value}>{value}</option>)}</select>{(["small", "medium", "wide", "full"] as GridPreset[]).map((preset) => <button type="button" key={preset} onClick={() => resize(module.moduleKey, preset)} className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-300">{preset}</button>)}</div>
      <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => onChange(moveModule(modules, module.moduleKey, -1))} className="text-xs text-zinc-400">↑ Yukarı taşı</button><button type="button" onClick={() => onChange(moveModule(modules, module.moduleKey, 1))} className="text-xs text-zinc-400">↓ Aşağı taşı</button><button type="button" onClick={() => onChange(reflowModules(modules.map((item) => item.moduleKey === module.moduleKey ? { ...item, gridHeight: Math.max(1, item.gridHeight - 1) } : item)))} className="text-xs text-zinc-400">− Küçült</button><button type="button" onClick={() => onChange(reflowModules(modules.map((item) => item.moduleKey === module.moduleKey ? { ...item, gridHeight: Math.min(6, item.gridHeight + 1) } : item)))} className="text-xs text-zinc-400">+ Büyüt</button></div>
    </article>)}</div>
    <div className="mt-5 border-t border-zinc-800 pt-4"><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-zinc-500">Ziyaretçi önizlemesi:</span>{(["public", "followers", "mutual", "self"] as ViewerPreviewMode[]).map((mode) => <button type="button" key={mode} onClick={() => setPreview(mode)} className={`rounded-md px-2 py-1 text-xs ${preview === mode ? "bg-violet-500/20 text-violet-200" : "bg-zinc-800 text-zinc-400"}`}>{mode === "public" ? "Herkes" : mode === "followers" ? "Takipçi" : mode === "mutual" ? "Karşılıklı" : "Yalnızca ben"}</button>)}</div><p className="mt-3 text-sm text-zinc-300">Görünür modüller: {visible.map((item) => NAMES[item.moduleKey]).join(", ") || "Yok"}</p><p className="mt-1 text-xs text-zinc-500">Bu önizleme yalnızca simülasyondur; gerçek erişim RPC tarafından filtrelenir.</p></div>
  </section>;
}
