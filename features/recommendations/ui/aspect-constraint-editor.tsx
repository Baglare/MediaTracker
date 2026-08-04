"use client";

import { useMemo, useState } from "react";
import { ASPECT_IDS, ASPECT_REGISTRY, normalizeAspectAlias, type AspectId } from "../domain/aspect-registry";
import type { AspectConstraint } from "../domain/constraints";

const ROLE_LABEL = { must: "Zorunlu", prefer: "Tercih", avoid: "Kaçınılacak" } as const;

export function AspectConstraintEditor({ constraints, onChange }: { constraints: readonly AspectConstraint[]; onChange: (next: AspectConstraint[]) => void }) {
  const [search, setSearch] = useState("");
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
      ...(role === "avoid" ? { rejectAtLevel: "significant" } : { minimumLevel: current.minimumLevel ?? "significant" }),
    };
    onChange(constraints.map((item, i) => i === index ? next : item));
  }

  return <div className="space-y-2">
    <label className="block text-xs text-zinc-300" htmlFor="aspect-search">Aspect ekle</label>
    <input id="aspect-search" role="combobox" aria-controls="aspect-search-results" aria-expanded={Boolean(search && results.length)} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Romantizm, karanlık ton, tempo…" className="w-full rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-200" />
    {search && results.length > 0 && <div id="aspect-search-results" role="listbox" className="grid gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1">{results.map((id) => <button type="button" role="option" aria-selected="false" key={id} onClick={() => add(id)} className="rounded px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800">{ASPECT_REGISTRY[id].labelTr}<span className="ml-2 text-zinc-600">{ASPECT_REGISTRY[id].group}</span></button>)}</div>}
    {constraints.map((constraint, index) => {
      const entry = ASPECT_REGISTRY[constraint.aspectId];
      return <div key={constraint.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800/70 px-2 py-2">
        <span className="min-w-28 text-xs text-zinc-200">{entry.labelTr}</span>
        <select aria-label={`${entry.labelTr} rolü`} value={constraint.role} onChange={(event) => update(index, event.target.value as AspectConstraint["role"])} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs">
          <option value="must" disabled={String(entry.mustSafety) === "unsafe"}>{ROLE_LABEL.must}</option>
          <option value="prefer">{ROLE_LABEL.prefer}</option>
          <option value="avoid" disabled={String(entry.avoidSafety) === "unsafe"}>{ROLE_LABEL.avoid}</option>
        </select>
        <span className="text-[10px] text-zinc-500">{constraint.source === "explicit" ? "Kullanıcının açık isteği" : constraint.source === "profile" ? "Profil tercihi" : "Sistem çıkarımı"}</span>
        <button type="button" aria-label={`${entry.labelTr} koşulunu kaldır`} onClick={() => onChange(constraints.filter((_, i) => i !== index))} className="ml-auto px-2 text-xs text-zinc-500 hover:text-zinc-200">Kaldır</button>
        {entry.limitationNoteTr && <p className="w-full text-[10px] text-amber-300/70">{entry.limitationNoteTr}</p>}
      </div>;
    })}
  </div>;
}
