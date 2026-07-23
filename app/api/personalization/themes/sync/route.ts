import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import {
  normalizeCanonicalThemeSyncPayload,
  normalizeThemeCloudState,
} from "@/lib/personalization/theme-cloud-sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

function failure(message: string, status: number): Response {
  return Response.json({ message }, { status, headers: HEADERS });
}

async function context() {
  const client = await getSupabaseServerClient();
  if (!client) return null;
  const { data: { user } } = await client.auth.getUser();
  return user ? { client } : null;
}

function safeError(error: unknown): Response {
  const raw = error instanceof Error ? error.message : "";
  if (raw.includes("authentication_required")) {
    return failure("Tema senkronizasyonu için giriş yapmalısın.", 401);
  }
  if (raw.includes("theme_sync_payload_invalid")) {
    return failure("Tema senkronizasyon verisi geçersiz.", 400);
  }
  return failure("Tema senkronizasyonu tamamlanamadı.", 500);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(): Promise<Response> {
  try {
    const auth = await context();
    if (!auth) return failure("Tema senkronizasyonu için giriş yapmalısın.", 401);
    const { data, error } = await auth.client.rpc("get_theme_sync_state");
    if (error) throw new Error(error.message);
    const state = normalizeThemeCloudState(data);
    if (!state) throw new Error("theme_sync_payload_invalid");
    return Response.json(state, { headers: HEADERS });
  } catch (error) {
    return safeError(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const auth = await context();
    if (!auth) return failure("Tema senkronizasyonu için giriş yapmalısın.", 401);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return failure("Tema senkronizasyon verisi geçersiz.", 400);
    }
    if (!isRecord(body)
      || Object.keys(body).some((key) => !["expectedRevision", "activeThemeSelection", "customThemes"].includes(key))
      || typeof body.expectedRevision !== "number"
      || !Number.isSafeInteger(body.expectedRevision)
      || body.expectedRevision < 0) {
      return failure("Tema senkronizasyon verisi geçersiz.", 400);
    }
    const payload = normalizeCanonicalThemeSyncPayload({
      schemaVersion: 1,
      activeThemeSelection: body.activeThemeSelection,
      customThemes: body.customThemes,
    });
    if (!payload.ok || !payload.value) {
      return failure("Tema senkronizasyon verisi geçersiz.", 400);
    }
    const { data, error } = await auth.client.rpc("save_theme_sync_state", {
      p_expected_revision: body.expectedRevision,
      p_active_theme_selection: payload.value.activeThemeSelection as unknown as Json,
      p_custom_themes: payload.value.customThemes as unknown as Json,
    });
    if (error) throw new Error(error.message);
    if (isRecord(data) && data.conflict === true) {
      const state = normalizeThemeCloudState(data.state);
      return Response.json({
        conflict: true,
        message: "Bulutta daha yeni tema değişiklikleri bulundu.",
        state,
      }, { status: 409, headers: HEADERS });
    }
    if (!isRecord(data) || data.ok !== true) throw new Error("theme_sync_save_failed");
    const state = normalizeThemeCloudState(data.state);
    if (!state) throw new Error("theme_sync_payload_invalid");
    return Response.json({ conflict: false, state }, { headers: HEADERS });
  } catch (error) {
    return safeError(error);
  }
}

export async function DELETE(): Promise<Response> {
  try {
    const auth = await context();
    if (!auth) return failure("Tema senkronizasyonu için giriş yapmalısın.", 401);
    const { data, error } = await auth.client.rpc("delete_theme_sync_state");
    if (error) throw new Error(error.message);
    return Response.json({
      ok: isRecord(data) && data.ok === true,
      deleted: isRecord(data) && data.deleted === true,
    }, { headers: HEADERS });
  } catch (error) {
    return safeError(error);
  }
}
