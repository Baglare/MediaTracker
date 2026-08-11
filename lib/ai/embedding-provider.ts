import type {
  EmbeddingProvider,
  EmbeddingVectorPayload,
  EmbeddingVectorResult,
} from "@/lib/ai/embedding-types";
import {
  readEmbeddingCache,
  writeEmbeddingCache,
  type EmbeddingCacheStats,
} from "@/lib/ai/embedding-cache";
import {
  readPersistentEmbeddingCache,
  isPersistentEmbeddingCacheEnabled,
  writePersistentEmbeddingCache,
  type PersistentEmbeddingCacheStats,
} from "@/lib/ai/persistent-embedding-cache";

export interface EmbeddingProviderRunResult {
  provider: string;
  requested: number;
  embedded: number;
  dimensions: number;
  fallbackUsed: boolean;
  error?: string;
  cache?: EmbeddingCacheStats;
  persistentCache?: PersistentEmbeddingCacheStats;
  results: EmbeddingVectorResult[];
}

const DEFAULT_TIMEOUT_MS = 2500;
const MOCK_DIMENSIONS = 8;
const PYTHON_EMBEDDING_DIMENSIONS = 384;
const DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2";

function hashNumber(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mockVector(payload: EmbeddingVectorPayload): number[] {
  const seed = `${payload.hash}|${payload.text}|${(payload.signals || []).join("|")}`;
  const vector: number[] = [];
  for (let i = 0; i < MOCK_DIMENSIONS; i++) {
    const n = hashNumber(`${seed}:${i}`);
    vector.push(Math.round(((n % 2000) / 1000 - 1) * 1000) / 1000);
  }
  return vector;
}

function serviceUrl(): string | null {
  const raw = process.env.MEDIA_TRACKER_ML_SERVICE_URL;
  if (!raw || !raw.trim()) return null;
  return raw.replace(/\/+$/, "");
}

function pythonModelName(): string {
  return process.env.MEDIA_TRACKER_EMBEDDING_MODEL?.trim() || DEFAULT_MODEL;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 120) : "unknown";
}

export class LocalMockEmbeddingProvider implements EmbeddingProvider {
  name = "local_mock";

  async embedMany(payloads: EmbeddingVectorPayload[], _options?: { timeoutMs?: number }): Promise<EmbeddingVectorResult[]> {
    void _options;
    return payloads.map((payload) => ({
      id: payload.id,
      hash: payload.hash,
      vector: mockVector(payload),
      dimensions: MOCK_DIMENSIONS,
      provider: this.name,
    }));
  }
}

export class PythonServiceEmbeddingProvider implements EmbeddingProvider {
  name = "python_service";

  constructor(private readonly baseUrl: string) {}

  async embedMany(
    payloads: EmbeddingVectorPayload[],
    options?: { timeoutMs?: number }
  ): Promise<EmbeddingVectorResult[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs || DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ inputs: payloads }),
      });
      if (!res.ok) {
        throw new Error(`embedding_service_http_${res.status}`);
      }
      const data = await res.json() as {
        model?: unknown;
        results?: { id?: unknown; hash?: unknown; vector?: unknown }[];
      };
      const model = typeof data.model === "string" && data.model.trim() ? data.model.trim() : pythonModelName();
      const results = Array.isArray(data.results) ? data.results : [];
      return results.flatMap((item) => {
        if (typeof item.id !== "string" || typeof item.hash !== "string" || !Array.isArray(item.vector)) {
          return [];
        }
        const vector = item.vector.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
        if (vector.length === 0) return [];
        return [{
          id: item.id,
          hash: item.hash,
          vector,
          dimensions: vector.length,
          provider: this.name,
          model,
        }];
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function embedManyWithFallback(
  payloads: EmbeddingVectorPayload[],
  options?: { timeoutMs?: number }
): Promise<EmbeddingProviderRunResult> {
  const fallback = new LocalMockEmbeddingProvider();
  if (payloads.length === 0) {
    return {
      provider: fallback.name,
      requested: 0,
      embedded: 0,
      dimensions: 0,
      fallbackUsed: false,
      cache: { hits: 0, misses: 0, stored: 0, size: 0, enabled: process.env.MEDIA_TRACKER_EMBEDDING_CACHE !== "off" },
      persistentCache: { hits: 0, misses: 0, stored: 0, disabled: !isPersistentEmbeddingCacheEnabled() },
      results: [],
    };
  }

  const url = serviceUrl();
  if (!url) {
    const results = await fallback.embedMany(payloads, options);
    return {
      provider: fallback.name,
      requested: payloads.length,
      embedded: results.length,
      dimensions: results[0]?.dimensions || 0,
      fallbackUsed: false,
      cache: { hits: 0, misses: 0, stored: 0, size: 0, enabled: process.env.MEDIA_TRACKER_EMBEDDING_CACHE !== "off" },
      persistentCache: { hits: 0, misses: 0, stored: 0, disabled: true },
      results,
    };
  }

  try {
    const provider = new PythonServiceEmbeddingProvider(url);
    const model = pythonModelName();
    const cached = readEmbeddingCache({
      payloads,
      provider: provider.name,
      model,
      dimensions: PYTHON_EMBEDDING_DIMENSIONS,
    });
    const persistent = await readPersistentEmbeddingCache({
      payloads: cached.misses,
      provider: provider.name,
      model,
      dimensions: PYTHON_EMBEDDING_DIMENSIONS,
    });
    const persistentMemoryStore = writeEmbeddingCache({
      payloads: cached.misses,
      results: persistent.hits,
      provider: provider.name,
      model,
      dimensions: PYTHON_EMBEDDING_DIMENSIONS,
    });
    const freshResults = persistent.misses.length > 0
      ? await provider.embedMany(persistent.misses, options)
      : [];
    const stored = writeEmbeddingCache({
      payloads: persistent.misses,
      results: freshResults.filter((result) => (
        result.provider === provider.name && result.dimensions === PYTHON_EMBEDDING_DIMENSIONS
      )),
      provider: provider.name,
      model,
      dimensions: PYTHON_EMBEDDING_DIMENSIONS,
    });
    const persistentStored = await writePersistentEmbeddingCache({
      payloads: persistent.misses,
      results: freshResults.filter((result) => (
        result.provider === provider.name && result.dimensions === PYTHON_EMBEDDING_DIMENSIONS
      )),
      provider: provider.name,
      model,
      dimensions: PYTHON_EMBEDDING_DIMENSIONS,
    });
    const results = [...cached.hits, ...persistent.hits, ...freshResults];
    return {
      provider: provider.name,
      requested: payloads.length,
      embedded: results.length,
      dimensions: results[0]?.dimensions || 0,
      fallbackUsed: false,
      cache: {
        hits: cached.stats.hits,
        misses: cached.stats.misses,
        stored: stored.stored + persistentMemoryStore.stored,
        size: stored.size,
        enabled: cached.stats.enabled,
      },
      persistentCache: {
        hits: persistent.stats.hits,
        misses: persistent.stats.misses,
        stored: persistentStored.stored,
        disabled: persistent.stats.disabled || persistentStored.disabled,
      },
      results,
    };
  } catch (error) {
    const results = await fallback.embedMany(payloads, options);
    return {
      provider: fallback.name,
      requested: payloads.length,
      embedded: results.length,
      dimensions: results[0]?.dimensions || 0,
      fallbackUsed: true,
      error: errorMessage(error),
      cache: { hits: 0, misses: payloads.length, stored: 0, size: 0, enabled: process.env.MEDIA_TRACKER_EMBEDDING_CACHE !== "off" },
      persistentCache: { hits: 0, misses: payloads.length, stored: 0, disabled: true },
      results,
    };
  }
}
