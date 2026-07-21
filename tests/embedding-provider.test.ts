import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { embedManyWithFallback } from "@/lib/ai/embedding-provider";
import type { EmbeddingVectorPayload } from "@/lib/ai/embedding-types";

function payload(id: string): EmbeddingVectorPayload {
  return { id, hash: `hash-${id}`, text: `Text ${id}`, signals: ["test"] };
}

beforeEach(() => {
  delete process.env.MEDIA_TRACKER_ML_SERVICE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.MEDIA_TRACKER_EMBEDDING_CACHE = "on";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MEDIA_TRACKER_ML_SERVICE_URL;
  delete process.env.MEDIA_TRACKER_EMBEDDING_CACHE;
});

describe("embedding provider modes", () => {
  it("uses deterministic local mock embeddings when the Python service is not configured", async () => {
    const first = await embedManyWithFallback([payload("local")]);
    const second = await embedManyWithFallback([payload("local")]);

    expect(first).toMatchObject({ provider: "local_mock", fallbackUsed: false, embedded: 1, dimensions: 8 });
    expect(second.results).toEqual(first.results);
  });

  it("reports Python ML service mode when a valid service response is used", async () => {
    process.env.MEDIA_TRACKER_ML_SERVICE_URL = "http://ml.test";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "sentence-transformers/test-model",
        results: [{ id: "python", hash: "hash-python", vector: Array.from({ length: 384 }, () => 0.1) }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await embedManyWithFallback([payload("python")]);

    expect(result).toMatchObject({ provider: "python_service", fallbackUsed: false, embedded: 1, dimensions: 384 });
    expect(result.results[0].model).toBe("sentence-transformers/test-model");
  });

  it("falls back to local mock embeddings when the Python service fails", async () => {
    process.env.MEDIA_TRACKER_ML_SERVICE_URL = "http://ml.test";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("service unavailable")));

    const result = await embedManyWithFallback([payload("fallback")]);

    expect(result).toMatchObject({ provider: "local_mock", fallbackUsed: true, embedded: 1, dimensions: 8 });
    expect(result.results[0].provider).toBe("local_mock");
  });

  it("uses a memory cache hit without calling the Python service again", async () => {
    process.env.MEDIA_TRACKER_ML_SERVICE_URL = "http://ml.test";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "sentence-transformers/all-MiniLM-L6-v2",
        results: [{ id: "cached", hash: "hash-cached", vector: Array.from({ length: 384 }, () => 0.2) }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await embedManyWithFallback([payload("cached")]);
    const second = await embedManyWithFallback([payload("cached")]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.cache?.hits).toBe(1);
    expect(second.provider).toBe("python_service");
  });
});
