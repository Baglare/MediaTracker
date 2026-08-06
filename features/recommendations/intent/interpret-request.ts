import type { AiIntent, AiSettings } from "@/lib/ai/types";
import { decodeRecommendationRequestV2, type RecommendationRequestV2 } from "../domain/codec";
import { adaptV1RequestToV2 } from "./v1-request-adapter";
import { patchRecommendationRequest } from "./request-patch";
import type { ReferenceMediaItem } from "./reference-policy";
import { evaluateRequestEvidenceCapabilities } from "../domain/evidence-capability";
import type { SemanticVerifierMode } from "../domain/types";

function attachCapabilities<T extends { request: RecommendationRequestV2 | null }>(
  result: T,
  availableVerifierModes: readonly Exclude<SemanticVerifierMode, "structured_only">[],
) {
  const capabilityResult = result.request
    ? evaluateRequestEvidenceCapabilities({ request: result.request, availableVerifierModes })
    : { capabilities: [], issues: [] };
  return { ...result, capabilities: capabilityResult.capabilities, availableVerifierModes };
}

export function interpretRecommendationRequest(input: {
  message: string;
  intent: AiIntent;
  settings: AiSettings;
  mediaItems: readonly ReferenceMediaItem[];
  previousRequest?: unknown;
  strictness?: RecommendationRequestV2["strictness"];
  availableVerifierModes?: readonly Exclude<SemanticVerifierMode, "structured_only">[];
}) {
  const availableVerifierModes = input.availableVerifierModes ?? [];
  if (input.previousRequest !== undefined) {
    const previous = decodeRecommendationRequestV2(input.previousRequest);
    if (!previous.ok) return attachCapabilities({ request: null, needsClarification: true, warnings: [], issues: previous.issues.map((entry) => `${entry.code}:${entry.path}`), clarificationQuestion: "Önceki istek taslağı geçersiz; yeni konu başlatır mısın?" }, availableVerifierModes);
    return attachCapabilities(patchRecommendationRequest(previous.value, input.message), availableVerifierModes);
  }
  const adapted = adaptV1RequestToV2({ message: input.message, intent: input.intent, retrievalPlan: null, settings: input.settings, mediaItems: input.mediaItems, candidates: [] });
  if (!adapted.request) return { ...adapted, clarificationQuestion: "Medya türünü ve zorunlu koşulları biraz daha açık yazar mısın?" };
  const decoded = decodeRecommendationRequestV2({ ...adapted.request, strictness: input.strictness ?? "balanced" });
  return attachCapabilities(decoded.ok
    ? { ...adapted, request: decoded.value }
    : { ...adapted, request: null, needsClarification: true, issues: decoded.issues.map((entry) => `${entry.code}:${entry.path}`), clarificationQuestion: "İstek koşulları doğrulanamadı; özeti kontrol eder misin?" }, availableVerifierModes);
}
