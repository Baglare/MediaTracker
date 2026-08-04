"use client";

import type { LengthUnit, NumericConstraintOperator, ObjectiveConstraint, ObjectiveConstraintField } from "../domain/constraints";
import type { RecommendationMediaType } from "../domain/types";

const MEDIA_TYPES: RecommendationMediaType[] = ["anime", "manga", "manhwa", "manhua", "tv", "movie", "book"];
const FIELD_LABELS: Record<ObjectiveConstraintField, string> = { media_type: "Medya türü", length: "Uzunluk", release_status: "Yayın durumu", release_year: "Yıl", format: "Format", language: "Dil", country: "Ülke" };
const OPERATOR_LABELS: Record<NumericConstraintOperator, string> = { eq: "Eşittir", lte: "En fazla", gte: "En az", between: "Aralık" };
const LENGTH_UNIT_LABELS: Record<LengthUnit, string> = { episode: "bölüm", chapter: "bölüm (chapter)", page: "sayfa", minute: "dakika" };
const RELEASE_STATUS_LABELS: Readonly<Record<string, string>> = { finished: "Tamamlandı", releasing: "Yayınlanıyor", not_yet_released: "Henüz yayınlanmadı", cancelled: "İptal edildi", ended: "Sona erdi", running: "Devam ediyor" };

function lengthUnit(targets: readonly RecommendationMediaType[]): LengthUnit {
  if (targets.every((item) => ["manga", "manhwa", "manhua"].includes(item))) return "chapter";
  if (targets.every((item) => item === "book")) return "page";
  if (targets.every((item) => item === "movie")) return "minute";
  return "episode";
}

export function ObjectiveConstraintEditor({ constraints, targetMediaTypes, onChange, onTargetMediaTypesChange }: { constraints: readonly ObjectiveConstraint[]; targetMediaTypes: readonly RecommendationMediaType[]; onChange: (next: ObjectiveConstraint[]) => void; onTargetMediaTypesChange: (next: RecommendationMediaType[]) => void }) {
  function setConstraint(index: number, next: ObjectiveConstraint) { onChange(constraints.map((item, i) => i === index ? next : item)); }
  function add(field: Exclude<ObjectiveConstraintField, "media_type">) {
    if (constraints.some((item) => item.field === field)) return;
    if (field === "length") onChange([...constraints, { id: "ui:length", kind: "objective", field, unit: lengthUnit(targetMediaTypes), operator: "lte", value: 12, role: "must", source: "explicit" }]);
    else if (field === "release_year") onChange([...constraints, { id: "ui:release_year", kind: "objective", field, operator: "gte", value: 2000, role: "must", source: "explicit" }]);
    else onChange([...constraints, { id: `ui:${field}`, kind: "objective", field, operator: "eq", value: field === "release_status" ? "finished" : field === "format" ? "TV" : field === "language" ? "tr" : "TR", role: "must", source: "explicit" }]);
  }

  return <div className="space-y-2">
    <label className="flex items-center gap-2 text-xs text-zinc-300">Hedef medya türü<select value={targetMediaTypes[0] ?? "anime"} onChange={(event) => onTargetMediaTypesChange([event.target.value as RecommendationMediaType])} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1">{MEDIA_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
    {constraints.filter((constraint) => constraint.field !== "media_type").map((constraint) => {
      const index = constraints.indexOf(constraint);
      return <div key={constraint.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800/70 px-2 py-2">
        <span className="text-xs text-zinc-300">{FIELD_LABELS[constraint.field]}</span>
        {(constraint.field === "length" || constraint.field === "release_year") && <>
          <select aria-label={`${FIELD_LABELS[constraint.field]} operatörü`} value={constraint.operator} onChange={(event) => { const operator = event.target.value as NumericConstraintOperator; setConstraint(index, operator === "between" ? { ...constraint, operator, value: undefined, min: 0, max: constraint.field === "release_year" ? 2030 : 12 } : { ...constraint, operator, value: constraint.value ?? constraint.max ?? 0, min: undefined, max: undefined }); }} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs">{Object.entries(OPERATOR_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          {constraint.operator === "between" ? <><input aria-label={`${FIELD_LABELS[constraint.field]} minimum`} type="number" min={0} value={constraint.min ?? ""} onChange={(event) => setConstraint(index, { ...constraint, min: Number(event.target.value) })} className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs" /><input aria-label={`${FIELD_LABELS[constraint.field]} maximum`} type="number" min={0} value={constraint.max ?? ""} onChange={(event) => setConstraint(index, { ...constraint, max: Number(event.target.value) })} className="w-20 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs" /></> : <input aria-label={`${FIELD_LABELS[constraint.field]} değeri`} type="number" min={0} value={constraint.value ?? ""} onChange={(event) => setConstraint(index, { ...constraint, value: Number(event.target.value) })} className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs" />}
          {constraint.field === "length" && <span className="text-[10px] text-zinc-500">{LENGTH_UNIT_LABELS[constraint.unit]}</span>}
        </>}
        {constraint.field === "release_status" && <select aria-label="Yayın durumu değeri" value={constraint.value} onChange={(event) => setConstraint(index, { ...constraint, value: event.target.value })} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs">{!RELEASE_STATUS_LABELS[constraint.value] && <option value={constraint.value}>{constraint.value}</option>}{Object.entries(RELEASE_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}
        {constraint.field !== "length" && constraint.field !== "release_year" && constraint.field !== "release_status" && <input aria-label={`${FIELD_LABELS[constraint.field]} değeri`} value={constraint.value} onChange={(event) => setConstraint(index, { ...constraint, value: event.target.value })} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs" />}
        <button type="button" aria-label={`${FIELD_LABELS[constraint.field]} koşulunu kaldır`} onClick={() => onChange(constraints.filter((_, i) => i !== index))} className="ml-auto text-xs text-zinc-500 hover:text-zinc-200">Kaldır</button>
      </div>;
    })}
    <div className="flex flex-wrap gap-2">{(["length", "release_status", "release_year", "format", "language", "country"] as const).filter((field) => !constraints.some((item) => item.field === field)).map((field) => <button type="button" key={field} onClick={() => add(field)} className="rounded border border-zinc-800 px-2 py-1 text-[10px] text-zinc-400">+ {FIELD_LABELS[field]}</button>)}</div>
  </div>;
}
