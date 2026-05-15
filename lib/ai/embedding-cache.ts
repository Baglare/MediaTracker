import type { EmbeddingVectorPayload, EmbeddingVectorResult } from "@/lib/ai/embedding-types";

export interface EmbeddingCacheStats {
  hits: number;
  misses: number;
  stored: number;
  size: number;
  enabled: boolean;
}

interface EmbeddingCacheEntry {
  key: string;
  hash: string;
  vector: number[];
  provider: string;
  model?: string;
  dimensions: number;
  createdAt: number;
  lastUsedAt: number;
}

const MAX_CACHE_SIZE = 1000;
const cache = new Map<string, EmbeddingCacheEntry>();

function isCacheEnabled(): boolean {
  return process.env.MEDIA_TRACKER_EMBEDDING_CACHE !== "off";
}

export function embeddingCacheKey(args: {
  provider: string;
  model?: string;
  hash: string;
  dimensions: number;
}): string {
  return `${args.provider}|${args.model || "default"}|${args.hash}|${args.dimensions}`;
}

function trimCache(): void {
  if (cache.size <= MAX_CACHE_SIZE) return;
  const overflow = cache.size - MAX_CACHE_SIZE;
  const oldest = [...cache.values()]
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt)
    .slice(0, overflow);
  for (const entry of oldest) {
    cache.delete(entry.key);
  }
}

export function readEmbeddingCache(args: {
  payloads: EmbeddingVectorPayload[];
  provider: string;
  model?: string;
  dimensions: number;
}): { hits: EmbeddingVectorResult[]; misses: EmbeddingVectorPayload[]; stats: EmbeddingCacheStats } {
  if (!isCacheEnabled()) {
    return {
      hits: [],
      misses: args.payloads,
      stats: { hits: 0, misses: args.payloads.length, stored: 0, size: cache.size, enabled: false },
    };
  }

  const now = Date.now();
  const hits: EmbeddingVectorResult[] = [];
  const misses: EmbeddingVectorPayload[] = [];
  for (const payload of args.payloads) {
    const key = embeddingCacheKey({
      provider: args.provider,
      model: args.model,
      hash: payload.hash,
      dimensions: args.dimensions,
    });
    const entry = cache.get(key);
    if (!entry) {
      misses.push(payload);
      continue;
    }
    entry.lastUsedAt = now;
    hits.push({
      id: payload.id,
      hash: payload.hash,
      vector: entry.vector,
      dimensions: entry.dimensions,
      provider: entry.provider,
      model: entry.model,
    });
  }

  return {
    hits,
    misses,
    stats: { hits: hits.length, misses: misses.length, stored: 0, size: cache.size, enabled: true },
  };
}

export function writeEmbeddingCache(args: {
  payloads: EmbeddingVectorPayload[];
  results: EmbeddingVectorResult[];
  provider: string;
  model?: string;
  dimensions: number;
}): EmbeddingCacheStats {
  if (!isCacheEnabled()) {
    return { hits: 0, misses: 0, stored: 0, size: cache.size, enabled: false };
  }

  const payloadById = new Map(args.payloads.map((payload) => [payload.id, payload]));
  const now = Date.now();
  let stored = 0;
  for (const result of args.results) {
    const payload = payloadById.get(result.id);
    if (!payload) continue;
    if (result.provider !== args.provider || result.dimensions !== args.dimensions) continue;
    const key = embeddingCacheKey({
      provider: args.provider,
      model: result.model || args.model,
      hash: result.hash,
      dimensions: result.dimensions,
    });
    cache.set(key, {
      key,
      hash: result.hash,
      vector: result.vector,
      provider: result.provider,
      model: result.model || args.model,
      dimensions: result.dimensions,
      createdAt: now,
      lastUsedAt: now,
    });
    stored++;
  }
  trimCache();
  return { hits: 0, misses: 0, stored, size: cache.size, enabled: true };
}
