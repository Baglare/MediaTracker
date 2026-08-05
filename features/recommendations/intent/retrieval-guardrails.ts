import type { AiRetrievalPlan } from "@/lib/ai/types";
import { ASPECT_REGISTRY } from "../domain/aspect-registry";
import type { RecommendationRequestV2 } from "../domain/codec";

export function applyStructuredRequestToRetrievalPlan(
  plan: AiRetrievalPlan,
  request?: RecommendationRequestV2,
): AiRetrievalPlan {
  if (!request) return plan;
  const positiveSignals = request.aspectConstraints
    .filter((constraint) => constraint.role !== "avoid")
    .map((constraint) => ASPECT_REGISTRY[constraint.aspectId].labelEn);
  const avoidSignals = request.aspectConstraints
    .filter((constraint) => constraint.role === "avoid")
    .map((constraint) => ASPECT_REGISTRY[constraint.aspectId].labelEn);
  return {
    ...plan,
    targetMediaTypes: [...request.targetMediaTypes],
    preferenceSignals: [...new Set([...positiveSignals, ...plan.preferenceSignals])],
    avoidSignals: [...new Set([...avoidSignals, ...plan.avoidSignals])],
    needsClarification: false,
    clarificationQuestion: undefined,
  };
}
