import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmbeddingVectorPayload, EmbeddingVectorResult } from "@/lib/ai/embedding-types";

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));

import {
  readPersistentEmbeddingCache,
  writePersistentEmbeddingCache,
} from "@/lib/ai/persistent-embedding-cache";

const payload: EmbeddingVectorPayload = { id: "candidate-1", text: "Example text", hash: "hash-1" };
const result: EmbeddingVectorResult = {
  id: "candidate-1",
  hash: "hash-1",
  vector: [0.25, 0.75],
  dimensions: 2,
  provider: "python_service",
  model: "model-a",
};

function setupSupabaseClient(readResult: unknown = { data: [], error: null }) {
  const readBuilder = {
    eq: vi.fn(),
    in: vi.fn().mockResolvedValue(readResult),
  };
  readBuilder.eq.mockReturnValue(readBuilder);
  const updateIn = vi.fn().mockResolvedValue({ data: null, error: null });
  const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
  const from = vi.fn(() => ({
    select: vi.fn(() => readBuilder),
    update: vi.fn(() => ({ in: updateIn })),
    upsert,
  }));
  createClientMock.mockReturnValue({ from });
  return { from, readBuilder, updateIn, upsert };
}

function enablePersistentCache() {
  process.env.MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE = "on";
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.MEDIA_TRACKER_EMBEDDING_CACHE;
  delete process.env.MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE;
});

describe("persistent embedding cache", () => {
  it("is disabled when the service role key is missing", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    enablePersistentCache();

    const cache = await readPersistentEmbeddingCache({
      payloads: [payload], provider: "python_service", model: "model-a", dimensions: 2,
    });

    expect(cache.stats.disabled).toBe(true);
    expect(cache.misses).toEqual([payload]);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("is disabled when the Supabase URL is missing", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret";
    enablePersistentCache();

    const cache = await readPersistentEmbeddingCache({
      payloads: [payload], provider: "python_service", model: "model-a", dimensions: 2,
    });

    expect(cache.stats.disabled).toBe(true);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("fails closed when the explicit persistent-cache policy is missing or invalid", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret";

    for (const mode of [undefined, "enabled", "true", "invalid"]) {
      if (mode === undefined) delete process.env.MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE;
      else process.env.MEDIA_TRACKER_PERSISTENT_EMBEDDING_CACHE = mode;

      const cache = await readPersistentEmbeddingCache({
        payloads: [payload], provider: "python_service", model: "model-a", dimensions: 2,
      });
      expect(cache.stats.disabled).toBe(true);
    }

    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("maps a cache hit to the requested embedding result", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret";
    enablePersistentCache();
    setupSupabaseClient({
      data: [{
        id: "python_service|model-a|hash-1|2",
        provider: "python_service",
        model: "model-a",
        hash: "hash-1",
        dimensions: 2,
        vector: [0.25, 0.75],
      }],
      error: null,
    });

    const cache = await readPersistentEmbeddingCache({
      payloads: [payload], provider: "python_service", model: "model-a", dimensions: 2,
    });

    expect(cache.hits).toEqual([result]);
    expect(cache.misses).toEqual([]);
    expect(cache.stats).toMatchObject({ hits: 1, misses: 0, disabled: false });
  });

  it("treats a missing or invalid vector as a cache miss", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret";
    enablePersistentCache();
    setupSupabaseClient({
      data: [{
        id: "python_service|model-a|hash-1|2",
        provider: "python_service",
        model: "model-a",
        hash: "hash-1",
        dimensions: 2,
        vector: [0.25, "invalid"],
      }],
      error: null,
    });

    const cache = await readPersistentEmbeddingCache({
      payloads: [payload], provider: "python_service", model: "model-a", dimensions: 2,
    });

    expect(cache.hits).toEqual([]);
    expect(cache.misses).toEqual([payload]);
  });

  it("turns a Supabase read error into a disabled fallback result", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret";
    enablePersistentCache();
    setupSupabaseClient({ data: null, error: new Error("read failed") });

    const cache = await readPersistentEmbeddingCache({
      payloads: [payload], provider: "python_service", model: "model-a", dimensions: 2,
    });

    expect(cache).toMatchObject({
      hits: [],
      misses: [payload],
      stats: { disabled: true, hits: 0, misses: 1, stored: 0 },
    });
  });

  it("maps valid embedding results to cache rows", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret";
    enablePersistentCache();
    const client = setupSupabaseClient();

    const stats = await writePersistentEmbeddingCache({
      payloads: [payload], results: [result], provider: "python_service", model: "model-a", dimensions: 2,
    });

    expect(stats).toEqual({ hits: 0, misses: 0, stored: 1, disabled: false });
    expect(client.upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "python_service|model-a|hash-1|2",
        provider: "python_service",
        model: "model-a",
        hash: "hash-1",
        dimensions: 2,
        vector: [0.25, 0.75],
      }),
    ], { onConflict: "provider,model,hash,dimensions" });
    const rows = client.upsert.mock.calls[0]?.[0] as Record<string, unknown>[];
    expect(rows[0]).not.toHaveProperty("text_preview");
  });

  it("does not throw when a Supabase write fails", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret";
    enablePersistentCache();
    const client = setupSupabaseClient();
    client.upsert.mockResolvedValue({ data: null, error: new Error("write failed") });

    await expect(writePersistentEmbeddingCache({
      payloads: [payload], results: [result], provider: "python_service", model: "model-a", dimensions: 2,
    })).resolves.toEqual({ hits: 0, misses: 0, stored: 0, disabled: true });
  });

  it("never includes the service role key in returned objects", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret";
    enablePersistentCache();
    setupSupabaseClient({ data: [], error: null });

    const cache = await readPersistentEmbeddingCache({
      payloads: [payload], provider: "python_service", model: "model-a", dimensions: 2,
    });

    expect(JSON.stringify(cache)).not.toContain("service-secret");
    expect(createClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "service-secret",
      { auth: { persistSession: false } }
    );
  });
});
