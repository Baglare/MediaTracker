// ============================================
// Cloud Repository — Supabase okuma/yazma
// ============================================
// Manuel cloud aktarım için kullanılan ince repository katmanı.
// Otomatik sync yok; sadece UI tetiklemeleriyle çağrılır.

import type { MediaItem, ProgressLog } from "../types";
import { getSupabaseBrowserClient } from "./client";
import {
  fromMediaRow,
  fromProgressLogRow,
  toMediaRow,
  toProgressLogRow,
} from "./mapping";

export type CloudResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const ERR_NOT_CONFIGURED = "Supabase yapılandırılmadı.";
const ERR_NOT_AUTHED = "Giriş yapmalısın.";
const ERR_UPLOAD_FAILED = "Cloud aktarımı başarısız.";
const ERR_FETCH_FAILED = "Cloud verisi okunamadı.";
const ERR_DELETE_FAILED = "Cloud silme başarısız.";

function logError(scope: string, err: unknown): void {
  // Tam Postgres mesajını konsola düşür; UI'a kısa Türkçe metin döner.
  if (typeof console !== "undefined") {
    console.warn(`[cloud-repo:${scope}]`, err);
  }
}

// Supabase upsert tek seferde çok büyük diziye dayanmasın diye chunked.
const CHUNK_SIZE = 200;

function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length <= size) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type EnsureCtx =
  | { ok: true; client: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>; userId: string }
  | { ok: false; error: string };

function ensure(userId: string | null | undefined): EnsureCtx {
  const client = getSupabaseBrowserClient();
  if (!client) return { ok: false, error: ERR_NOT_CONFIGURED };
  if (!userId) return { ok: false, error: ERR_NOT_AUTHED };
  return { ok: true, client, userId };
}

// ============================================
// UPLOAD
// ============================================

export async function uploadMediaItems(
  userId: string,
  items: MediaItem[]
): Promise<CloudResult<{ count: number }>> {
  const ctx = ensure(userId);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (items.length === 0) return { ok: true, data: { count: 0 } };

  const rows = items.map((item) => toMediaRow(ctx.userId, item));

  for (const part of chunk(rows, CHUNK_SIZE)) {
    const { error } = await ctx.client
      .from("media_items")
      .upsert(part, { onConflict: "id" });
    if (error) {
      logError("upload", error);
      return { ok: false, error: ERR_UPLOAD_FAILED };
    }
  }
  return { ok: true, data: { count: items.length } };
}

export async function uploadProgressLogs(
  userId: string,
  logs: ProgressLog[]
): Promise<CloudResult<{ count: number }>> {
  const ctx = ensure(userId);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (logs.length === 0) return { ok: true, data: { count: 0 } };

  const rows = logs.map((log) => toProgressLogRow(ctx.userId, log));

  for (const part of chunk(rows, CHUNK_SIZE)) {
    const { error } = await ctx.client
      .from("progress_logs")
      .upsert(part, { onConflict: "id" });
    if (error) {
      logError("upload", error);
      return { ok: false, error: ERR_UPLOAD_FAILED };
    }
  }
  return { ok: true, data: { count: logs.length } };
}

// ============================================
// FETCH
// ============================================

export async function fetchCloudMediaItems(
  userId: string
): Promise<CloudResult<MediaItem[]>> {
  const ctx = ensure(userId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const { data, error } = await ctx.client
    .from("media_items")
    .select("*")
    .eq("user_id", ctx.userId)
    .is("deleted_at", null);

  if (error) {
    logError("fetch", error);
    return { ok: false, error: ERR_FETCH_FAILED };
  }
  return { ok: true, data: (data ?? []).map(fromMediaRow) };
}

export async function fetchCloudProgressLogs(
  userId: string
): Promise<CloudResult<ProgressLog[]>> {
  const ctx = ensure(userId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const { data, error } = await ctx.client
    .from("progress_logs")
    .select("*")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: true });

  if (error) {
    logError("fetch", error);
    return { ok: false, error: ERR_FETCH_FAILED };
  }
  return { ok: true, data: (data ?? []).map(fromProgressLogRow) };
}

// ============================================
// COUNT
// ============================================

export async function fetchCloudMediaCount(
  userId: string
): Promise<CloudResult<number>> {
  const ctx = ensure(userId);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { count, error } = await ctx.client
    .from("media_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.userId)
    .is("deleted_at", null);
  if (error) {
    logError("fetch", error);
    return { ok: false, error: ERR_FETCH_FAILED };
  }
  return { ok: true, data: count ?? 0 };
}

export async function fetchCloudProgressLogCount(
  userId: string
): Promise<CloudResult<number>> {
  const ctx = ensure(userId);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { count, error } = await ctx.client
    .from("progress_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.userId);
  if (error) {
    logError("fetch", error);
    return { ok: false, error: ERR_FETCH_FAILED };
  }
  return { ok: true, data: count ?? 0 };
}

// ============================================
// DELETE (tek satır)
// ============================================

export async function deleteMediaItem(
  userId: string,
  id: string
): Promise<CloudResult<{ count: number }>> {
  const ctx = ensure(userId);
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { error } = await ctx.client
    .from("media_items")
    .delete()
    .eq("user_id", ctx.userId)
    .eq("id", id);
  if (error) {
    logError("delete", error);
    return { ok: false, error: ERR_DELETE_FAILED };
  }
  return { ok: true, data: { count: 1 } };
}

// ============================================
// CLEAR (UI'dan kullanılmıyor — yedek)
// ============================================

export async function clearCloudData(
  userId: string
): Promise<CloudResult<{ media: number; logs: number }>> {
  const ctx = ensure(userId);
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const logsRes = await ctx.client
    .from("progress_logs")
    .delete()
    .eq("user_id", ctx.userId);
  if (logsRes.error) return { ok: false, error: logsRes.error.message };

  const mediaRes = await ctx.client
    .from("media_items")
    .delete()
    .eq("user_id", ctx.userId);
  if (mediaRes.error) return { ok: false, error: mediaRes.error.message };

  return { ok: true, data: { media: mediaRes.count ?? 0, logs: logsRes.count ?? 0 } };
}
