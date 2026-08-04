import { NextResponse } from "next/server";
import { analyzeIntent } from "@/lib/ai/intent-analyzer";
import { DEFAULT_AI_SETTINGS } from "@/lib/ai/local-state";
import type { AiSettings } from "@/lib/ai/types";
import type { MediaItem } from "@/lib/types";
import { interpretRecommendationRequest } from "@/features/recommendations/intent/interpret-request";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ code: "interpret_invalid_json" }, { status: 400 }); }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 4000) return NextResponse.json({ code: "interpret_message_invalid" }, { status: 400 });
  const mediaItems = Array.isArray(body.mediaItems) ? body.mediaItems.slice(0, 5000) as MediaItem[] : [];
  const settings = typeof body.settings === "object" && body.settings ? { ...DEFAULT_AI_SETTINGS, ...body.settings as Partial<AiSettings> } : DEFAULT_AI_SETTINGS;
  const result = interpretRecommendationRequest({ message, intent: analyzeIntent(message), settings, mediaItems, previousRequest: body.previousStructuredRequestV2, strictness: body.strictness === "strict" || body.strictness === "exploratory" ? body.strictness : "balanced" });
  return NextResponse.json(result, { status: result.request || result.needsClarification ? 200 : 422 });
}
