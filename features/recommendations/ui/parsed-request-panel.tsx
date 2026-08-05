"use client";

import { useState } from "react";
import { decodeRecommendationRequestV2, type RecommendationRequestV2 } from "../domain/codec";
import { AspectConstraintEditor } from "./aspect-constraint-editor";
import { ObjectiveConstraintEditor } from "./objective-constraint-editor";
import { StrictnessSelector } from "./strictness-selector";
import { userFacingRecommendationWarning } from "./user-facing-text";

export function ParsedRequestPanel({ request, warnings, onChange }: { request: RecommendationRequestV2; warnings?: readonly string[]; onChange: (request: RecommendationRequestV2) => void }) {
  const [error, setError] = useState<string | null>(null);
  function commit(next: RecommendationRequestV2) {
    const decoded = decodeRecommendationRequestV2(next);
    if (!decoded.ok) { setError(decoded.issues[0]?.message ?? "İstek geçersiz."); return; }
    setError(null);
    onChange(decoded.value);
  }

  return <section aria-labelledby="request-summary-title" className="space-y-4 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
    <div><h3 id="request-summary-title" className="text-sm font-semibold text-zinc-100">İstek özeti</h3><p className="mt-1 text-xs text-zinc-500">Öneri aramasından önce koşulları inceleyip düzenleyebilirsin.</p></div>
    <div className="flex flex-wrap gap-1.5"><span className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">Hedef: {request.targetMediaTypes.join(", ")}</span>{request.profileSignalsEnabled && <span className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">Profil: yumuşak tercih</span>}</div>
    <StrictnessSelector value={request.strictness} onChange={(strictness) => commit({ ...request, strictness })} />
    <AspectConstraintEditor constraints={request.aspectConstraints} onChange={(aspectConstraints) => commit({ ...request, aspectConstraints })} />
    <ObjectiveConstraintEditor
      constraints={request.objectiveConstraints}
      targetMediaTypes={request.targetMediaTypes}
      onChange={(objectiveConstraints) => commit({ ...request, objectiveConstraints })}
      onTargetMediaTypesChange={(targetMediaTypes) => commit({
        ...request,
        targetMediaTypes,
        objectiveConstraints: request.objectiveConstraints.map((constraint) => constraint.field === "media_type" ? { ...constraint, value: targetMediaTypes[0] } : constraint),
      })}
    />
    {warnings?.length ? <p className="text-[11px] text-amber-300/80">{[...new Set(warnings.map(userFacingRecommendationWarning))].join(" · ")}</p> : null}
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
  </section>;
}
