import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { EmbeddingVectorPayload, EmbeddingVectorResult } from "@/lib/ai/embedding-types";

export interface PersistentEmbeddingCacheStats {
  hits: number;
  misses: number;
  stored: number;
  disabled: boolean;
}

interface EmbeddingCacheRow {
  id: string;
  provider: string;
  model: string;
  hash: string;
  dimensions: number;
  vector: unknown;
}

function isPersistentCacheEnabled(): boolean {
  if (process.env.MEDIA_TRACKER_EMBEDDING_CACHE === "off") return false;
  if (process.env.MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE === "off") return false;
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getClient() {
  if (!isPersistentCacheEnabled()) return null;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } }
  );
}

function cacheId(args: { provider: string; model: string; hash: string; dimensions: number }): string {
  return `${args.provider}|${args.model}|${args.hash}|${args.dimensions}`;
}

function vectorFromJson(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const vector = value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
  return vector.length === value.length && vector.length > 0 ? vector : null;
}

export async function readPersistentEmbeddingCache(args: {
  payloads: EmbeddingVectorPayload[];
  provider: string;
  model: string;
  dimensions: number;
}): Promise<{ hits: EmbeddingVectorResult[]; misses: EmbeddingVectorPayload[]; stats: PersistentEmbeddingCacheStats }> {
  const client = getClient();
  if (!client || args.payloads.length === 0) {
    return {
      hits: [],
      misses: args.payloads,
      stats: { hits: 0, misses: args.payloads.length, stored: 0, disabled: !client },
    };
  }

  try {
    const hashes = Array.from(new Set(args.payloads.map((payload) => payload.hash)));
    const { data, error } = await client
      .from("embedding_cache")
      .select("id,provider,model,hash,dimensions,vector")
      .eq("provider", args.provider)
      .eq("model", args.model)
      .eq("dimensions", args.dimensions)
      .in("hash", hashes);
    if (error) throw error;

    const rowByKey = new Map<string, EmbeddingCacheRow>();
    for (const row of (data || []) as EmbeddingCacheRow[]) {
      rowByKey.set(cacheId(row), row);
    }

    const hits: EmbeddingVectorResult[] = [];
    const misses: EmbeddingVectorPayload[] = [];
    const hitIds: string[] = [];
    for (const payload of args.payloads) {
      const key = cacheId({ provider: args.provider, model: args.model, hash: payload.hash, dimensions: args.dimensions });
      const row = rowByKey.get(key);
      const vector = row ? vectorFromJson(row.vector) : null;
      if (!row || !vector || vector.length !== args.dimensions) {
        misses.push(payload);
        continue;
      }
      hitIds.push(row.id);
      hits.push({
        id: payload.id,
        hash: payload.hash,
        vector,
        dimensions: row.dimensions,
        provider: row.provider,
        model: row.model,
      });
    }

    if (hitIds.length > 0) {
      await client
        .from("embedding_cache")
        .update({ last_used_at: new Date().toISOString() })
        .in("id", hitIds);
    }

    return {
      hits,
      misses,
      stats: { hits: hits.length, misses: misses.length, stored: 0, disabled: false },
    };
  } catch {
    return {
      hits: [],
      misses: args.payloads,
      stats: { hits: 0, misses: args.payloads.length, stored: 0, disabled: true },
    };
  }
}

export async function writePersistentEmbeddingCache(args: {
  payloads: EmbeddingVectorPayload[];
  results: EmbeddingVectorResult[];
  provider: string;
  model: string;
  dimensions: number;
}): Promise<PersistentEmbeddingCacheStats> {
  const client = getClient();
  if (!client || args.results.length === 0) {
    return { hits: 0, misses: 0, stored: 0, disabled: !client };
  }

  const payloadById = new Map(args.payloads.map((payload) => [payload.id, payload]));
  const now = new Date().toISOString();
  const rows = args.results.flatMap((result) => {
    const payload = payloadById.get(result.id);
    const vector = vectorFromJson(result.vector);
    if (!payload) return [];
    if (result.provider !== args.provider || result.dimensions !== args.dimensions) return [];
    if (result.hash !== payload.hash || !vector || vector.length !== args.dimensions) return [];
    return [{
      id: cacheId({ provider: args.provider, model: result.model || args.model, hash: result.hash, dimensions: result.dimensions }),
      provider: args.provider,
      model: result.model || args.model,
      hash: result.hash,
      dimensions: result.dimensions,
      vector,
      text_preview: payload.text.slice(0, 240),
      last_used_at: now,
    }];
  });
  if (rows.length === 0) return { hits: 0, misses: 0, stored: 0, disabled: false };

  try {
    const { error } = await client
      .from("embedding_cache")
      .upsert(rows, { onConflict: "provider,model,hash,dimensions" });
    if (error) throw error;
    return { hits: 0, misses: 0, stored: rows.length, disabled: false };
  } catch {
    return { hits: 0, misses: 0, stored: 0, disabled: true };
  }
}
