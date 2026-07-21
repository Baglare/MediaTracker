import { isRecommendationTransitionAllowed } from "@/lib/social/interactions";
import { loadSocialRecommendationDetail, loadSocialRecommendations } from "@/lib/social/interactions-server";
import { safeSocialText, socialRecord, validateCursor, validateRecommendationProgressStatus, validateRecommendationResponseStatus, validateSocialMediaSnapshot, validateUuid } from "@/lib/social/interactions-validation";
import { PRIVATE_NO_STORE_HEADERS, readJsonBody, safeSocialRouteError } from "@/lib/social/route-response";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const search = new URL(request.url).searchParams;
  const detailId = search.get("recommendationId");
  if (detailId) {
    const recommendation = validateUuid(detailId, "Öneri");
    if (!recommendation.ok) return Response.json({ message: recommendation.error }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    try { return Response.json(await loadSocialRecommendationDetail(recommendation.value), { headers: PRIVATE_NO_STORE_HEADERS }); }
    catch (error) { return safeSocialRouteError(error); }
  }
  const cursor = validateCursor(search);
  const box = search.get("box") ?? "received";
  const status = search.get("status") ?? "all";
  if (!cursor.ok || !["received", "sent"].includes(box) || !["all", "pending", "deferred", "accepted", "started", "completed", "rejected", "withdrawn"].includes(status)) {
    return Response.json({ message: cursor.ok ? "Öneri filtresi geçersiz." : cursor.error }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  try { return Response.json(await loadSocialRecommendations({ box, status, ...cursor.value }), { headers: PRIVATE_NO_STORE_HEADERS }); }
  catch (error) { return safeSocialRouteError(error); }
}

export async function POST(request: Request) {
  const body = socialRecord(await readJsonBody(request));
  if (body?.action === "message") {
    const recommendation = validateUuid(body.recommendationId, "Öneri");
    const message = safeSocialText(body.message, 500);
    const dedupe = safeSocialText(body.dedupeKey, 220, true);
    if (!recommendation.ok || !message.ok || !message.value?.trim() || !dedupe.ok || !dedupe.value) {
      return Response.json({ message: !recommendation.ok ? recommendation.error : !message.ok ? message.error : !dedupe.ok ? dedupe.error : "Mesaj boş olamaz." }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
    }
    try {
      const client = await getSupabaseServerClient(); if (!client) throw new Error("social_not_configured");
      const { data, error } = await client.rpc("social_send_recommendation_message", { p_recommendation: recommendation.value, p_body: message.value, p_dedupe_key: dedupe.value });
      if (error) throw new Error(error.message);
      return Response.json(data, { headers: PRIVATE_NO_STORE_HEADERS });
    } catch (error) { return safeSocialRouteError(error); }
  }

  const recipient = validateUuid(body?.recipientId, "Alıcı");
  const media = validateSocialMediaSnapshot(body?.media);
  const note = safeSocialText(body?.senderNote, 500);
  const dedupe = safeSocialText(body?.dedupeKey, 220, true);
  if (!body || !recipient.ok || !media.ok || !note.ok || !dedupe.ok || !dedupe.value) {
    return Response.json({ message: !recipient.ok ? recipient.error : !media.ok ? media.error : !note.ok ? note.error : !dedupe.ok ? dedupe.error : "Öneri geçersiz." }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  try {
    const client = await getSupabaseServerClient(); if (!client) throw new Error("social_not_configured");
    const { data, error } = await client.rpc("social_send_recommendation", { p_recipient: recipient.value, p_media: media.value as unknown as Json, p_sender_note: note.value ?? "", p_dedupe_key: dedupe.value });
    if (error) throw new Error(error.message);
    return Response.json(data, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) { return safeSocialRouteError(error); }
}

export async function PATCH(request: Request) {
  const body = socialRecord(await readJsonBody(request));
  const recommendation = validateUuid(body?.recommendationId, "Öneri");
  const action = String(body?.action ?? "");
  const note = safeSocialText(body?.responseNote, 300);
  const responseMessage = safeSocialText(body?.responseMessage, 500);
  const dedupe = safeSocialText(body?.dedupeKey, 220);
  if (!body || !recommendation.ok || !["accept", "defer", "reject", "withdraw", "linked", "started", "completed"].includes(action) || !note.ok || !responseMessage.ok || !dedupe.ok) {
    return Response.json({ message: !recommendation.ok ? recommendation.error : !note.ok ? note.error : !responseMessage.ok ? responseMessage.error : !dedupe.ok ? dedupe.error : "Öneri geçişi geçersiz." }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  }
  const responseStatus = body.responseStatus === undefined ? null : validateRecommendationResponseStatus(body.responseStatus);
  const progressStatus = body.progressStatus === undefined ? null : validateRecommendationProgressStatus(body.progressStatus);
  if ((responseStatus && !responseStatus.ok) || (progressStatus && !progressStatus.ok)) return Response.json({ message: "Öneri durum bilgisi geçersiz." }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  if (responseStatus?.ok && progressStatus?.ok && !isRecommendationTransitionAllowed(responseStatus.value, progressStatus.value, action as Parameters<typeof isRecommendationTransitionAllowed>[2])) return Response.json({ message: "Bu öneri için geçiş geçerli değil." }, { status: 409, headers: PRIVATE_NO_STORE_HEADERS });
  try {
    const client = await getSupabaseServerClient(); if (!client) throw new Error("social_not_configured");
    const { data, error } = await client.rpc("social_recommendation_transition", { p_recommendation: recommendation.value, p_action: action, p_response_note: note.value ?? null, p_already_in_library: body.alreadyInLibrary === true, p_dedupe_key: dedupe.value ?? null, p_response_message: responseMessage.value ?? null });
    if (error) throw new Error(error.message);
    return Response.json(data, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) { return safeSocialRouteError(error); }
}
