import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { validateMediaStateBatch } from "@/lib/xp/validation";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

function failure(message: string, status = 400): Response {
  return Response.json({ message }, { status, headers: HEADERS });
}

async function context() {
  const client = await getSupabaseServerClient();
  if (!client) return null;
  const { data: { user } } = await client.auth.getUser();
  return user ? { client, user } : null;
}

function safeError(error: unknown): Response {
  const raw = error instanceof Error ? error.message : "";
  if (raw.includes("authentication_required")) return failure("Bu işlem için giriş yapmalısın.", 401);
  if (raw.includes("invalid_media_state") || raw.includes("unsafe_media_state") || raw.includes("duplicate_media_state")) return failure("Kütüphane XP eşitleme verisi geçersiz.");
  if (raw.includes("library_full_sync_required")) return failure("Eski XP ilerlemesini dönüştürmek için önce İlerleme ekranından kütüphanenin tamamını eşitle.", 409);
  if (raw.includes("badge_not_earned") || raw.includes("title_not_earned")) return failure("Henüz kazanılmamış bir seçim yapılamaz.", 403);
  return failure("XP işlemi tamamlanamadı.", 500);
}

export async function GET(): Promise<Response> {
  try {
    const auth = await context();
    if (!auth) return failure("Bu işlem için giriş yapmalısın.", 401);
    const { data, error } = await auth.client.rpc("get_xp_dashboard", { p_event_limit: 25 });
    if (error) throw new Error(error.message);
    return Response.json(data, { headers: HEADERS });
  } catch (error) { return safeError(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await context();
    if (!auth) return failure("Bu işlem için giriş yapmalısın.", 401);
    let body: unknown;
    try { body = await request.json(); } catch { return failure("İstek verisi geçersiz."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return failure("İstek verisi geçersiz.");
    const input = body as Record<string, unknown>;
    if ("amount" in input || "effect" in input || "allocations" in input || "badge" in input || "beneficiary" in input) return failure("XP miktarı, etkisi ve ödül sahibi client tarafından belirlenemez.");

    if (input.action === "sync_states") {
      const validated = validateMediaStateBatch(input);
      if (!validated.ok) return failure(validated.error);
      const item = validated.value;
      const { data, error } = await auth.client.rpc("xp_sync_media_states", { p_items: item.items as unknown as Json, p_replace: item.replace });
      if (error) throw new Error(error.message);
      return Response.json(data, { headers: HEADERS });
    }

    if (input.action === "select_badges") {
      const keys = Array.isArray(input.badgeKeys) && input.badgeKeys.length <= 5 && input.badgeKeys.every((key) => typeof key === "string" && /^[a-z0-9_]{2,60}$/.test(key)) ? input.badgeKeys as string[] : null;
      if (!keys || new Set(keys).size !== keys.length) return failure("Rozet seçimi geçersiz.");
      const { data, error } = await auth.client.rpc("xp_select_badges", { p_badge_keys: keys });
      if (error) throw new Error(error.message);
      return Response.json(data, { headers: HEADERS });
    }

    if (input.action === "select_title") {
      const title = typeof input.title === "string" && input.title.trim().length >= 2 && input.title.trim().length <= 80 ? input.title.trim() : null;
      if (!title) return failure("Unvan seçimi geçersiz.");
      const { data, error } = await auth.client.rpc("xp_select_title", { p_title: title });
      if (error) throw new Error(error.message);
      return Response.json(data, { headers: HEADERS });
    }
    return failure("Bilinmeyen XP işlemi.");
  } catch (error) { return safeError(error); }
}
