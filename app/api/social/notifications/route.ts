import { loadSocialNotifications } from "@/lib/social/interactions-server";
import { socialRecord, validateCursor, validateUuid } from "@/lib/social/interactions-validation";
import { PRIVATE_NO_STORE_HEADERS, readJsonBody, safeSocialRouteError } from "@/lib/social/route-response";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const cursor = validateCursor(new URL(request.url).searchParams);
  if (!cursor.ok) return Response.json({ message: cursor.error }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  try { return Response.json(await loadSocialNotifications(cursor.value), { headers: PRIVATE_NO_STORE_HEADERS }); }
  catch (error) { return safeSocialRouteError(error); }
}

export async function PATCH(request: Request) {
  const body = socialRecord(await readJsonBody(request));
  const action = String(body?.action ?? "");
  const notification = body?.notificationId ? validateUuid(body.notificationId, "Bildirim") : null;
  const entity = body?.entityId ? validateUuid(body.entityId, "İçerik") : null;
  const entityType = String(body?.entityType ?? "");
  const invalid = !body || !["read", "read_all", "mark_entity_read"].includes(action)
    || (action === "read" && (!notification || !notification.ok))
    || (action === "mark_entity_read" && (!entity || !entity.ok || !["profile", "activity", "comment", "recommendation"].includes(entityType)));
  if (invalid) return Response.json({ message: "Bildirim aksiyonu geçersiz." }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS });
  try {
    const client = await getSupabaseServerClient(); if (!client) throw new Error("social_not_configured");
    const { data, error } = await client.rpc("social_notification_action", { p_action: action, p_notification: notification?.ok ? notification.value : null, p_entity_type: action === "mark_entity_read" ? entityType : null, p_entity_id: entity?.ok ? entity.value : null });
    if (error) throw new Error(error.message);
    return Response.json(data, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) { return safeSocialRouteError(error); }
}
