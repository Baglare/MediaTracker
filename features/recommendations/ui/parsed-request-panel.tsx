"use client";

import { useState } from "react";
import { decodeRecommendationRequestV2, type RecommendationRequestV2 } from "../domain/codec";
import { AspectConstraintEditor } from "./aspect-constraint-editor";
import { ObjectiveConstraintEditor } from "./objective-constraint-editor";
import { StrictnessSelector } from "./strictness-selector";
import { userFacingRecommendationWarning } from "./user-facing-text";
import { evaluateRequestEvidenceCapabilities } from "../domain/evidence-capability";
import type { SemanticVerifierMode } from "../domain/types";

export function ParsedRequestPanel({ request, warnings, availableVerifierModes = [], onChange }: { request: RecommendationRequestV2; warnings?: readonly string[]; availableVerifierModes?: readonly Exclude<SemanticVerifierMode, "structured_only">[]; onChange: (request: RecommendationRequestV2) => void }) {
  const [error, setError] = useState<string | null>(null);
  function commit(next: RecommendationRequestV2) {
    const decoded = decodeRecommendationRequestV2(next);
    if (!decoded.ok) { setError(decoded.issues[0]?.message ?? "İstek geçersiz."); return; }
    setError(null);
    onChange(decoded.value);
  }
  const capabilities = evaluateRequestEvidenceCapabilities({ request, availableVerifierModes }).capabilities;
  const needsSemanticVerifier = capabilities.some((capability) => capability.status === "requires_semantic_verifier");

  return <section aria-labelledby="request-summary-title" className="space-y-4 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
    <div><h3 id="request-summary-title" className="text-sm font-semibold text-zinc-100">İstek özeti</h3><p className="mt-1 text-xs text-zinc-500">Öneri aramasından önce koşulları inceleyip düzenleyebilirsin.</p></div>
    <div className="flex flex-wrap gap-1.5"><span className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">Hedef: {request.targetMediaTypes.join(", ")}</span>{request.profileSignalsEnabled && <span className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">Profil: yumuşak tercih</span>}</div>
    <StrictnessSelector value={request.strictness} onChange={(strictness) => commit({ ...request, strictness })} />
    <AspectConstraintEditor constraints={request.aspectConstraints} capabilities={capabilities} onChange={(aspectConstraints) => commit({ ...request, aspectConstraints })} />
    {needsSemanticVerifier && availableVerifierModes.length > 0 && <label className="block text-xs text-zinc-300">Semantik doğrulama
      <select aria-label="Semantik doğrulama modu" value={request.semanticVerifierMode} onChange={(event) => commit({ ...request, semanticVerifierMode: event.target.value as SemanticVerifierMode })} className="ml-2 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs">
        <option value="structured_only">Yalnız yapılandırılmış kaynaklar</option>
        {availableVerifierModes.includes("local_enhanced") && <option value="local_enhanced">Yerel içerik doğrulayıcı</option>}
        {availableVerifierModes.includes("remote_enhanced") && <option value="remote_enhanced">Uzak içerik doğrulayıcı</option>}
      </select>
    </label>}
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
