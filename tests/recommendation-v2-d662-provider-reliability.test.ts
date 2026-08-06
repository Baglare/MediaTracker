import { describe, expect, it, vi } from "vitest";
import {
  RANKED_TAG_ASPECT_IDS,
  RANKED_TAG_PROVIDER_COVERAGE,
  RANKED_TAG_SEMANTIC_CONFIRMATION_ASPECT_IDS,
} from "@/features/recommendations/domain/ranked-tag-provider-coverage";
import {
  ASPECT_REGISTRY,
  providerRetrievalMappingsFor,
} from "@/features/recommendations/domain/aspect-registry";
import {
  PROVIDER_REQUEST_BUDGETS,
  ProviderRequestError,
  boundedRetryAfterMs,
  fetchWithProviderRequestPolicy,
} from "@/features/recommendations/providers/request-policy";
import { evaluateRequestEvidenceCapabilities } from "@/features/recommendations/domain/evidence-capability";
import { userFacingCapabilityValidationSummary } from "@/features/recommendations/ui/user-facing-text";
import type { RecommendationRequestV2 } from "@/features/recommendations/domain/codec";

describe("D6.6-2 ranked-tag provider coverage", () => {
  it("21 ranked-tag aspect için beş provider kaydını eksiksiz üretir", () => {
    expect(RANKED_TAG_ASPECT_IDS).toHaveLength(21);
    expect(new Set(RANKED_TAG_ASPECT_IDS).size).toBe(21);
    expect(RANKED_TAG_PROVIDER_COVERAGE).toHaveLength(105);
    for (const aspectId of RANKED_TAG_ASPECT_IDS) {
      expect(RANKED_TAG_PROVIDER_COVERAGE.filter((item) => item.aspectId === aspectId)).toHaveLength(5);
    }
  });

  it("yalnız doğrulanmış repository mapping'lerini queryable sayar", () => {
    const mapped = RANKED_TAG_PROVIDER_COVERAGE.filter((item) => item.status === "mapped_queryable");
    expect(mapped.map((item) => item.aspectId).sort()).toEqual(["political_intrigue", "revenge"]);
    for (const item of mapped) {
      expect(item.provider).toBe("anilist");
      expect(item.canonicalProviderTags.length).toBeGreaterThan(0);
      expect(item.supportsServerSideQuery).toBe(true);
      expect(item.supportsMinimumRank).toBe(true);
      expect(providerRetrievalMappingsFor(item.aspectId, item.provider)).toEqual(expect.arrayContaining([
        expect.objectContaining({ queryable: true, canonicalTags: item.canonicalProviderTags }),
      ]));
    }
  });

  it("labelEn değerini canonical provider tag'i olarak türetmez", () => {
    expect(ASPECT_REGISTRY.political_intrigue.labelEn).toBe("Political Intrigue");
    const politics = RANKED_TAG_PROVIDER_COVERAGE.find((item) => item.aspectId === "political_intrigue" && item.provider === "anilist");
    expect(politics?.canonicalProviderTags).toEqual(["Politics"]);
    const loveTriangle = RANKED_TAG_PROVIDER_COVERAGE.find((item) => item.aspectId === "love_triangle" && item.provider === "anilist");
    expect(loveTriangle).toMatchObject({ status: "evidence_only", canonicalProviderTags: [], supportsServerSideQuery: false, canUseAsMust: false });
  });

  it("geniş veya bileşik aspect'leri semantik onay listesinde tutar", () => {
    expect(RANKED_TAG_SEMANTIC_CONFIRMATION_ASPECT_IDS).toEqual(expect.arrayContaining([
      "power_progression", "found_family", "antihero", "dark", "disturbing_content",
    ]));
    for (const aspectId of RANKED_TAG_SEMANTIC_CONFIRMATION_ASPECT_IDS) {
      const anilist = RANKED_TAG_PROVIDER_COVERAGE.find((item) => item.aspectId === aspectId && item.provider === "anilist");
      expect(anilist).toMatchObject({ status: "semantic_confirmation_required", requiresSemanticConfirmation: true, canUseAsMust: false });
    }
  });

  it("avoid ailelerini retrieval yerine post-evidence güvenliğiyle sınırlar", () => {
    for (const aspectId of ["love_triangle", "fanservice", "sexual_content", "violence_gore"] as const) {
      const anilist = RANKED_TAG_PROVIDER_COVERAGE.find((item) => item.aspectId === aspectId && item.provider === "anilist");
      expect(anilist).toMatchObject({ status: "evidence_only", canUseAsMust: false, canUseAsAvoid: true });
    }
  });
});

describe("D6.6-2 bounded provider request policy", () => {
  const budget = {
    ...PROVIDER_REQUEST_BUDGETS.anilist,
    timeoutMs: 20,
    maxAttempts: 2,
  };

  it("429 Retry-After değerini bounded uygular ve bir kez retry eder", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "60" } }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const result = await fetchWithProviderRequestPolicy({ provider: "anilist", url: "https://provider.invalid", fetchImpl, sleepImpl, budget });
    expect(result.response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenCalledWith(1_000);
    expect(result.telemetry).toMatchObject({ retryCount: 1, rateLimitCount: 1, retryAfterAppliedMs: 1_000 });
  });

  it("permanent 4xx yanıtını retry etmez", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    const result = await fetchWithProviderRequestPolicy({ provider: "anilist", url: "https://provider.invalid", fetchImpl, budget });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.telemetry).toMatchObject({ attemptCount: 1, retryCount: 0, unavailableCount: 1 });
  });

  it("network hatasını sınırlı tekrarlar ve ham hata taşımadan fail eder", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("secret upstream body"));
    await expect(fetchWithProviderRequestPolicy({ provider: "tvmaze", url: "https://provider.invalid", fetchImpl, budget: { ...budget, maxAttempts: 2 } }))
      .rejects.toMatchObject({ name: "ProviderRequestError", kind: "network" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    try {
      await fetchWithProviderRequestPolicy({ provider: "tvmaze", url: "https://provider.invalid", fetchImpl, budget: { ...budget, maxAttempts: 1 } });
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderRequestError);
      expect((error as Error).message).not.toContain("secret");
    }
  });

  it("timeout'u bounded tekrarlar ve telemetry'de ayırır", async () => {
    const fetchImpl = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    await expect(fetchWithProviderRequestPolicy({
      provider: "anilist",
      url: "https://provider.invalid",
      fetchImpl: fetchImpl as typeof fetch,
      budget: { ...budget, timeoutMs: 5, maxAttempts: 2 },
    })).rejects.toMatchObject({
      kind: "timeout",
      telemetry: expect.objectContaining({ timeoutCount: 2, retryCount: 1, unavailableCount: 1 }),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("parent abort sonucunu retry etmez", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn();
    await expect(fetchWithProviderRequestPolicy({ provider: "openlibrary", url: "https://provider.invalid", fetchImpl, init: { signal: controller.signal }, budget }))
      .rejects.toMatchObject({ kind: "aborted" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("Retry-After sayı ve tarih değerlerini üst sınırda tutar", () => {
    expect(boundedRetryAfterMs("0.25")).toBe(250);
    expect(boundedRetryAfterMs("60")).toBe(1_000);
    expect(boundedRetryAfterMs("invalid")).toBe(0);
  });
});

describe("D6.6-2 controlled capability validation UX", () => {
  it("raw 422/code/enum yerine aspect, kaynak ve eylem gösterir", () => {
    const request: RecommendationRequestV2 = {
      version: 2,
      queryText: "Karakter odaklı anime öner.",
      targetMediaTypes: ["anime"],
      aspectConstraints: [{ id: "character", kind: "aspect", aspectId: "character_driven", role: "must", source: "explicit", minimumLevel: "significant" }],
      objectiveConstraints: [],
      strictness: "balanced",
      references: [],
      profileSignalsEnabled: false,
      semanticVerifierMode: "structured_only",
      locale: "tr-TR",
    };
    const capabilities = evaluateRequestEvidenceCapabilities({ request }).capabilities;
    const message = userFacingCapabilityValidationSummary({ request, capabilities });
    expect(message).toContain("Karakter odaklı");
    expect(message).toContain("AniList");
    expect(message).toContain("tercihe çevirebilir");
    expect(message).toContain("kaldırabilirsin");
    expect(message).not.toMatch(/422|structured_request|semantic_required|provider internal|GraphQL/i);
  });
});
