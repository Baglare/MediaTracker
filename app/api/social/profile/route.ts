import { NextResponse } from "next/server";

import { loadOwnSocialEditorData, toShowcaseJson } from "@/lib/social/server";
import {
  validateMediaSnapshot,
  validateModuleCollection,
  validateProgressionSnapshot,
  validateSharedNote,
  validateSocialProfileInput,
  validateStatsSnapshot,
  validateUserId,
} from "@/lib/social/validation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function failure(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function context() {
  const client = await getSupabaseServerClient();
  if (!client) return null;
  const { data } = await client.auth.getUser();
  return data.user ? { client, user: data.user } : null;
}

export async function GET() {
  return NextResponse.json(await loadOwnSocialEditorData(), {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function POST(request: Request) {
  const auth = await context();
  if (!auth) return failure("Bu işlem için giriş yapmalısın.", 401);
  let body: unknown;
  try { body = await request.json(); } catch { return failure("İstek verisi geçersiz."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return failure("İstek verisi geçersiz.");
  const input = body as Record<string, unknown>;

  if (input.action === "save_profile") {
    const validated = validateSocialProfileInput(input.profile);
    if (!validated.ok) return failure(validated.error);
    const profile = validated.value;
    const { data, error } = await auth.client.rpc("social_save_unified_profile", {
      p_username: profile.username,
      p_display_name: profile.displayName,
      p_tagline: profile.tagline,
      p_bio: profile.bio,
      p_location: profile.location ?? "",
      p_language: profile.language ?? "",
      p_visibility_mode: profile.visibilityMode,
      p_connection_color: profile.connectionColor,
      p_selected_title: profile.selectedTitle ?? "",
      p_profile_palette_id: profile.presentation.paletteId,
      p_banner_mode: profile.presentation.bannerMode,
      p_banner_position: profile.presentation.bannerPosition,
      p_overlay_strength: profile.presentation.overlayStrength,
      p_avatar_frame: profile.presentation.avatarFrame,
      p_surface_style: profile.presentation.surfaceStyle,
      p_motif_intensity: profile.presentation.motifIntensity,
      p_banner_focal_x: profile.presentation.bannerTransform.focalX,
      p_banner_focal_y: profile.presentation.bannerTransform.focalY,
      p_banner_zoom: profile.presentation.bannerTransform.zoom,
      p_avatar_focal_x: profile.presentation.avatarTransform.focalX,
      p_avatar_focal_y: profile.presentation.avatarTransform.focalY,
      p_avatar_zoom: profile.presentation.avatarTransform.zoom,
    });
    return error ? failure("Profil kaydedilemedi. Kullanıcı adı veya değişiklik süresi kuralını kontrol et.", 409) : NextResponse.json(data);
  }

  if (input.action === "save_modules") {
    const validated = validateModuleCollection(input.modules);
    if (!validated.ok) return failure(validated.error);
    const rows = validated.value.map((module) => ({
      user_id: auth.user.id,
      module_key: module.moduleKey,
      enabled: module.enabled,
      visibility: module.visibility,
      grid_x: module.gridX,
      grid_y: module.gridY,
      grid_width: module.gridWidth,
      grid_height: module.gridHeight,
      mobile_order: module.mobileOrder,
      config: module.config,
    }));
    const { error } = await auth.client.from("profile_modules").upsert(rows, { onConflict: "user_id,module_key" });
    return error ? failure("Profil düzeni kaydedilemedi.", 500) : NextResponse.json({ ok: true });
  }

  if (input.action === "replace_showcase") {
    const kind = input.kind === "favorites" || input.kind === "current" ? input.kind : null;
    const max = kind === "favorites" ? 5 : 6;
    if (!kind || !Array.isArray(input.items) || input.items.length > max) return failure("Vitrin seçimi geçersiz.");
    const parsed = input.items.map((item) => validateMediaSnapshot(item, max));
    if (parsed.some((item) => !item.ok)) return failure("Vitrin medyası geçersiz.");
    const items = parsed.flatMap((item) => item.ok ? [item.value] : []);
    const keys = new Set(items.map((item) => `${item.externalSource ?? ""}:${item.externalId ?? ""}:${item.mediaType}:${item.title.toLowerCase()}`));
    if (keys.size !== items.length) return failure("Aynı medya vitrinde iki kez kullanılamaz.");
    const { data, error } = await auth.client.rpc("social_replace_showcase", { p_kind: kind, p_items: toShowcaseJson(items) });
    return error ? failure("Vitrin kaydedilemedi.", 500) : NextResponse.json(data);
  }

  if (input.action === "publish_stats") {
    const validated = validateStatsSnapshot(input.snapshot);
    if (!validated.ok) return failure(validated.error);
    const item = validated.value;
    const { error } = await auth.client.from("profile_stats_snapshots").upsert({ user_id: auth.user.id, total_media: item.totalMedia, completed: item.completed, active: item.active, planning: item.planning, favorites: item.favorites, rated: item.rated, world_counts: item.worldCounts, snapshot_at: item.snapshotAt });
    return error ? failure("İstatistik snapshot kaydedilemedi.", 500) : NextResponse.json({ ok: true });
  }

  if (input.action === "publish_progression") {
    const validated = validateProgressionSnapshot(input.snapshot);
    if (!validated.ok) return failure(validated.error);
    const item = validated.value;
    const { error } = await auth.client.from("profile_progression_snapshots").upsert({ user_id: auth.user.id, version: item.version, total_xp: item.totalXp, level: item.level, title: item.title, tier: item.tier, dominant_world: item.dominantWorld, progress_percent: item.progressPercent, world_counts: item.worldCounts, snapshot_at: item.snapshotAt });
    return error ? failure("Progression snapshot kaydedilemedi.", 500) : NextResponse.json({ ok: true });
  }

  if (input.action === "share_note") {
    const validated = validateSharedNote(input.note);
    if (!validated.ok) return failure(validated.error);
    const note = validated.value;
    const { data, error } = await auth.client.rpc("social_share_note", { p_media_title: note.mediaTitle, p_media_type: note.mediaType, p_external_source: note.externalSource ?? "", p_external_id: note.externalId ?? "", p_content: note.content, p_contains_spoiler: note.containsSpoiler, p_visibility: note.visibility, p_confirmed: note.confirmed });
    return error ? failure("Not snapshot paylaşılamadı.", 500) : NextResponse.json(data);
  }

  if (input.action === "unshare_note") {
    const id = validateUserId(input.noteId);
    if (!id.ok) return failure(id.error);
    const { data, error } = await auth.client.rpc("social_unshare_note", { p_note: id.value });
    return error ? failure("Paylaşım kaldırılamadı.", 500) : NextResponse.json(data);
  }

  return failure("Bilinmeyen sosyal profil işlemi.");
}
