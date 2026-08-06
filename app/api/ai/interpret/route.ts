import { NextResponse } from "next/server";
import { analyzeIntent } from "@/lib/ai/intent-analyzer";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/local-state";
import type { AiSettings } from "@/lib/ai/types";
import { interpretRecommendationRequest } from "@/features/recommendations/intent/interpret-request";
import type { ReferenceMediaItem } from "@/features/recommendations/intent/reference-policy";
import { RECOMMENDATION_REQUEST_LIMITS } from "@/features/recommendations/domain/codec";
import { getPlanningProviderPolicy } from "@/lib/ai/provider";
import { availableSemanticVerifierModes } from "@/features/recommendations/evidence";

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
  let parsed: unknown;
  try { parsed = await request.json(); } catch { return NextResponse.json({ code: "interpret_invalid_json" }, { status: 400 }); }
  if (!isRecord(parsed)) return NextResponse.json({ code: "interpret_payload_invalid" }, { status: 400 });
  const body = parsed;
  if (Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) {
    return NextResponse.json({ code: "interpret_unknown_field" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > RECOMMENDATION_REQUEST_LIMITS.queryText) return NextResponse.json({ code: "interpret_message_invalid" }, { status: 400 });
  const mediaItems = sanitizeReferenceItems(body.mediaItems);
  const rawSettings = isRecord(body.settings) ? body.settings : {};
  const settings: AiSettings = {
    ...DEFAULT_AI_SETTINGS,
    useProfile: rawSettings.useProfile !== false,
    useOpenAIProvider: rawSettings.useOpenAIProvider === true,
  };
  const strictness = body.strictness === undefined ? "balanced" : body.strictness;
  if (strictness !== "strict" && strictness !== "balanced" && strictness !== "exploratory") {
    return NextResponse.json({ code: "interpret_strictness_invalid" }, { status: 400 });
  }
  const result = interpretRecommendationRequest({ message, intent: analyzeIntent(message), settings, mediaItems, previousRequest: body.previousStructuredRequestV2, strictness, availableVerifierModes: availableSemanticVerifierModes() });
  return NextResponse.json({
    ...result,
    planningPolicy: getPlanningProviderPolicy(settings),
  }, { status: result.request || result.needsClarification || "resetRequested" in result ? 200 : 422 });
}
