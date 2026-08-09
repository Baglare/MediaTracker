import { analyzeIntent } from "@/lib/ai/intent-analyzer";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/local-state";
import type { AiSettings } from "@/lib/ai/types";
import { interpretRecommendationRequest } from "@/features/recommendations/intent/interpret-request";
import type { ReferenceMediaItem } from "@/features/recommendations/intent/reference-policy";
import { RECOMMENDATION_REQUEST_LIMITS } from "@/features/recommendations/domain/codec";
import { getPlanningProviderPolicy } from "@/lib/ai/provider";
import { availableSemanticVerifierModes } from "@/features/recommendations/evidence";
import { resolveAiEntitlement } from "@/lib/ai/entitlement";
import {
  AI_REQUEST_MAX_BYTES,
  enforceRateLimit,
  readStrictJsonObject,
  apiError,
  noStoreJson,
} from "@/lib/api/request-security";

const ALLOWED_FIELDS = new Set(["message", "mediaItems", "settings", "previousStructuredRequestV2", "strictness"]);
const REFERENCE_MEDIA_LIMIT = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeReferenceItems(value: unknown): ReferenceMediaItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, REFERENCE_MEDIA_LIMIT).flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.title !== "string" || typeof entry.type !== "string") return [];
    const title = entry.title.trim().slice(0, 300);
    if (!title) return [];
    return [{
      title,
      type: entry.type as ReferenceMediaItem["type"],
      ...(typeof entry.externalSource === "string" ? { externalSource: entry.externalSource.slice(0, 40) } : {}),
      ...(typeof entry.externalId === "string" ? { externalId: entry.externalId.slice(0, 160) } : {}),
    }];
  });
}

export async function POST(request: Request) {
  const parsed = await readStrictJsonObject(request, ALLOWED_FIELDS, AI_REQUEST_MAX_BYTES);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  const entitlement = await resolveAiEntitlement(request);
  const rateLimit = enforceRateLimit("ai:interpret", entitlement.rateLimitIdentity, 30, 60_000);
  if (rateLimit) return rateLimit;
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > RECOMMENDATION_REQUEST_LIMITS.queryText) return apiError("interpret_message_invalid", 400);
  const mediaItems = sanitizeReferenceItems(body.mediaItems);
  const rawSettings = isRecord(body.settings) ? body.settings : {};
  const settings: AiSettings = {
    ...DEFAULT_AI_SETTINGS,
    useProfile: rawSettings.useProfile !== false,
    useOpenAIProvider: entitlement.canUseOpenAi && rawSettings.useOpenAIProvider === true,
  };
  const strictness = body.strictness === undefined ? "balanced" : body.strictness;
  if (strictness !== "strict" && strictness !== "balanced" && strictness !== "exploratory") {
    return apiError("interpret_strictness_invalid", 400);
  }
  const result = interpretRecommendationRequest({ message, intent: analyzeIntent(message), settings, mediaItems, previousRequest: body.previousStructuredRequestV2, strictness, availableVerifierModes: availableSemanticVerifierModes() });
  return noStoreJson({
    ...result,
    planningPolicy: getPlanningProviderPolicy(settings, entitlement.canUseServerProviders ? undefined : "mock"),
  }, { status: result.request || result.needsClarification || "resetRequested" in result ? 200 : 422 });
}
