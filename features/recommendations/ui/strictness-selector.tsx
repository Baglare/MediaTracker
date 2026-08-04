"use client";

import type { RecommendationStrictness } from "../domain/types";

const OPTIONS: { value: RecommendationStrictness; label: string; description: string }[] = [
  { value: "strict", label: "Katı", description: "Bilinmeyen zorunlu kanıt elenir; sonuç sayısı düşük olabilir." },
  { value: "balanced", label: "Dengeli", description: "Açık zorunlular korunur; birleşik orta güvenli kanıt kabul edilebilir." },
  { value: "exploratory", label: "Keşifçi", description: "Zorunlular korunur; yakın eşleşmeler ayrı gösterilebilir." },
];

export function StrictnessSelector({ value, onChange, disabled = false }: { value: RecommendationStrictness; onChange: (value: RecommendationStrictness) => void; disabled?: boolean }) {
  return <fieldset disabled={disabled} className="space-y-2"><legend className="text-xs font-medium text-zinc-300">Eşleşme modu</legend><div className="grid grid-cols-1 sm:grid-cols-3 gap-2">{OPTIONS.map((option) => <label key={option.value} className={`rounded-xl border px-3 py-2 cursor-pointer ${value === option.value ? "border-violet-500/50 bg-violet-500/10" : "border-zinc-800 bg-zinc-950/20"}`}><span className="flex items-center gap-2 text-xs font-medium text-zinc-200"><input type="radio" name="recommendation-strictness" value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="accent-violet-500" />{option.label}</span><span className="mt-1 block text-[10px] leading-relaxed text-zinc-500">{option.description}</span></label>)}</div></fieldset>;
}
