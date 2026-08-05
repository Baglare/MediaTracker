"use client";

import { useMemo, useState } from "react";
import { ASPECT_IDS, ASPECT_REGISTRY, normalizeAspectAlias, type AspectId } from "../domain/aspect-registry";
import type { AspectConstraint } from "../domain/constraints";
import { DEFAULT_AVOID_REJECT_LEVEL } from "../domain/constraints";

const ROLE_LABEL = { must: "Zorunlu", prefer: "Tercih", avoid: "Kaçınılacak" } as const;
const GROUP_LABEL = { core: "Tür ve anlatı", narrative: "Tema", relationship: "İlişki", tone_content: "Ton ve içerik", experience: "Deneyim" } as const;

export function AspectConstraintEditor({ constraints, onChange }: { constraints: readonly AspectConstraint[]; onChange: (next: AspectConstraint[]) => void }) {
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const results = useMemo(() => {
    const query = normalizeAspectAlias(search);
    return ASPECT_IDS.filter((id) => {
      const entry = ASPECT_REGISTRY[id];
      return !constraints.some((item) => item.aspectId === id)
        && (!query || [entry.labelTr, entry.labelEn, ...entry.aliasesTr, ...entry.aliasesEn]
          .some((value) => normalizeAspectAlias(value).includes(query)));
    }).slice(0, 8);
  }, [constraints, search]);

  function add(id: AspectId) {
    const role = String(ASPECT_REGISTRY[id].mustSafety) === "unsafe" ? "prefer" : "must";
    onChange([...constraints, { id: `ui:${id}`, kind: "aspect", aspectId: id, role, source: "explicit", minimumLevel: "significant" }]);
    setSearch("");
  }

  function update(index: number, role: AspectConstraint["role"]) {
    const current = constraints[index];
    const entry = ASPECT_REGISTRY[current.aspectId];
    if ((role === "must" && String(entry.mustSafety) === "unsafe")
      || (role === "avoid" && String(entry.avoidSafety) === "unsafe")) return;
    const next: AspectConstraint = {
      id: current.id, kind: "aspect", aspectId: current.aspectId, role, source: "explicit",
      ...(role === "avoid" ? { rejectAtLevel: current.rejectAtLevel ?? DEFAULT_AVOID_REJECT_LEVEL } : { minimumLevel: current.minimumLevel ?? "significant" }),
    };
    onChange(constraints.map((item, i) => i === index ? next : item));
  }

  function updateLevel(index: number, level: "primary" | "significant" | "incidental") {
    const current = constraints[index];
    const next: AspectConstraint = current.role === "avoid"
      ? { ...current, rejectAtLevel: level }
      : { ...current, minimumLevel: level };
    onChange(constraints.map((item, i) => i === index ? next : item));
  }

  return <div className="space-y-2">
    <label className="block text-xs text-zinc-300" htmlFor="aspect-search">Aspect ekle</label>
    <input id="aspect-search" role="combobox" aria-autocomplete="list" aria-controls="aspect-search-results" aria-expanded={Boolean(search && results.length)} aria-activedescendant={search && results[activeIndex] ? `aspect-option-${results[activeIndex]}` : undefined} value={search} onChange={(event) => { setSearch(event.target.value); setActiveIndex(0); }} onKeyDown={(event) => { if (!results.length) return; if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(results.length - 1, index + 1)); } else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); } else if (event.key === "Enter") { event.preventDefault(); add(results[activeIndex]); } else if (event.key === "Escape") { setSearch(""); } }} placeholder="Romantizm, karanlık ton, tempo…" className="w-full rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-200" />
    {search && results.length > 0 && <div id="aspect-search-results" role="listbox" className="grid gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1">{results.map((id, index) => <button id={`aspect-option-${id}`} type="button" role="option" aria-selected={index === activeIndex} key={id} onMouseEnter={() => setActiveIndex(index)} onClick={() => add(id)} className="rounded px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800">{ASPECT_REGISTRY[id].labelTr}<span className="ml-2 text-zinc-600">{GROUP_LABEL[ASPECT_REGISTRY[id].group]}</span></button>)}</div>}
    {constraints.map((constraint, index) => {
      const entry = ASPECT_REGISTRY[constraint.aspectId];
      return <div key={constraint.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800/70 px-2 py-2">
        <span className="min-w-28 text-xs text-zinc-200">{entry.labelTr}</span>
        <select aria-label={`${entry.labelTr} rolü`} value={constraint.role} onChange={(event) => update(index, event.target.value as AspectConstraint["role"])} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs">
          <option value="must" disabled={String(entry.mustSafety) === "unsafe"}>{ROLE_LABEL.must}</option>
          <option value="prefer">{ROLE_LABEL.prefer}</option>
          <option value="avoid" disabled={String(entry.avoidSafety) === "unsafe"}>{ROLE_LABEL.avoid}</option>
        </select>
        <select aria-label={`${entry.labelTr} eşiği`} value={constraint.role === "avoid" ? constraint.rejectAtLevel ?? DEFAULT_AVOID_REJECT_LEVEL : constraint.minimumLevel ?? "significant"} onChange={(event) => updateLevel(index, event.target.value as "primary" | "significant" | "incidental")} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs">
          <option value="incidental">{constraint.role === "avoid" ? "İkincil ve üzerini çıkar" : "İkincil veya daha güçlü"}</option>
          <option value="significant">{constraint.role === "avoid" ? "Belirgin ve üzerini çıkar" : "Belirgin veya ana unsur"}</option>
          <option value="primary">{constraint.role === "avoid" ? "Yalnız ana unsursa çıkar" : "Ana unsur"}</option>
        </select>
        <span className="text-[10px] text-zinc-500">{constraint.source === "explicit" ? "Kullanıcının açık isteği" : constraint.source === "profile" ? "Profil tercihi" : "Sistem çıkarımı"}</span>
        <button type="button" aria-label={`${entry.labelTr} koşulunu kaldır`} onClick={() => onChange(constraints.filter((_, i) => i !== index))} className="ml-auto px-2 text-xs text-zinc-500 hover:text-zinc-200">Kaldır</button>
        {entry.limitationNoteTr && <p className="w-full text-[10px] text-amber-300/70">{entry.limitationNoteTr}</p>}
      </div>;
    })}
  </div>;
}
