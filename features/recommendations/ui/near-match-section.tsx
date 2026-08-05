"use client";
import { useId, useState } from "react";
import type { AiNearMatchRecommendation } from "@/lib/ai/types";
import type { RecommendationStrictness } from "../domain/types";
import { EvidenceSummary } from "./evidence-summary";
import { RecommendationCardHeader } from "./recommendation-card-header";

export function NearMatchSection({ strictness, items, onAdd, onDiscover, onDismiss }: { strictness: RecommendationStrictness; items: readonly AiNearMatchRecommendation[]; onAdd: (item: AiNearMatchRecommendation) => void; onDiscover: (item: AiNearMatchRecommendation) => void; onDismiss: (item: AiNearMatchRecommendation) => void }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (strictness !== "exploratory" || items.length === 0) return null;
  return <section className="rounded-2xl border border-dashed border-amber-500/30 bg-amber-500/5 p-3">
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)} className="w-full text-left text-sm font-medium text-amber-200">Yakın eşleşmeler ({Math.min(3, items.length)})</button>
    {open && <div id={id} className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">{items.slice(0, 3).map((item) => <article key={item.id} className="group min-w-0 rounded-xl border border-zinc-800 bg-zinc-950/30 p-3">
      <RecommendationCardHeader title={item.title} coverUrl={item.coverUrl} mediaType={item.mediaType} source={item.source} releaseYear={item.candidate?.releaseYear} badge="Yakın eşleşme" resultKind="near_match" />
      <p className="mt-2 text-xs text-red-200/80">Karşılanmayan: {item.violatedConstraints.join(" ")}</p>
      {item.satisfiedConstraints.length > 0 && <p className="mt-1 text-xs text-zinc-400">Karşılanan: {item.satisfiedConstraints.join(" · ")}</p>}
      <p className="mt-1 text-xs text-zinc-500">{item.nearMatchReason}</p>
      <EvidenceSummary items={item.evidenceSummary} />
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => item.candidate?.globalSearch ? onAdd(item) : onDiscover(item)} className="text-xs text-violet-300">{item.candidate?.globalSearch ? "Listeye Ekle" : "Keşfet'te Ara"}</button><button type="button" onClick={() => onDismiss(item)} className="text-xs text-zinc-500">İlgilenmiyorum</button></div>
    </article>)}</div>}
  </section>;
}
