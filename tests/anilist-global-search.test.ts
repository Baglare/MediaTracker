import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET as searchAniList } from "@/app/api/anilist/search/route";
import {
  anilistDiagnosticMessage,
  collectFulfilledSearchResults,
  fetchAniListGlobalSearch,
} from "@/lib/anilist-search-diagnostic";
import {
  buildAniListSearchFallback,
  normalizeAniListMedia,
  rankAniListSearchResults,
} from "@/lib/anilist";
import { getGlobalSearchTitleDisplay } from "@/lib/global-search-title-display";
import type { AniListNormalizedResult } from "@/lib/anilist-types";
import type { AniListRawMedia } from "@/lib/anilist-types";

const normalized: AniListNormalizedResult = {
  externalSource: "anilist",
  externalId: "1",
  type: "anime",
  title: "Example",
  totalProgress: 12,
};

function response(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function rawMedia(overrides: Partial<AniListRawMedia> = {}): AniListRawMedia {
  return {
    id: 1,
    type: "ANIME",
    title: {
      english: "English Title",
      romaji: "Romaji Title",
      native: "日本語タイトル",
    },
    popularity: 10,
    ...overrides,
  };
}

describe("global AniList search diagnostics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a successful result separate from diagnostics", async () => {
    const outcome = await fetchAniListGlobalSearch({
      query: "example",
      category: "anime",
      fetcher: vi.fn().mockResolvedValue(response({ results: [normalized] })),
    });
    expect(outcome).toEqual({
      results: [normalized],
      diagnostic: { kind: "results", count: 1 },
    });
  });

  it("normalizes and displays English, Romaji and Native titles distinctly", () => {
    const result = normalizeAniListMedia(rawMedia());
    expect(result).toMatchObject({
      title: "English Title",
      originalTitle: "Romaji Title",
      nativeTitle: "日本語タイトル",
    });
    expect(getGlobalSearchTitleDisplay({
      source: "anilist",
      externalId: result.externalId,
      type: result.type,
      title: result.title,
      subtitle: result.originalTitle,
      nativeTitle: result.nativeTitle,
      raw: result,
    })).toEqual({
      secondary: "Romaji Title",
      native: "日本語タイトル",
    });
  });

  it("uses Romaji as the main title when English is missing", () => {
    const result = normalizeAniListMedia(rawMedia({
      title: { romaji: "Kusuriya no Hitorigoto", native: "薬屋のひとりごと" },
    }));
    expect(result.title).toBe("Kusuriya no Hitorigoto");
    expect(getGlobalSearchTitleDisplay({
      source: "anilist",
      externalId: result.externalId,
      type: result.type,
      title: result.title,
      subtitle: result.originalTitle,
      nativeTitle: result.nativeTitle,
    })).toEqual({ secondary: undefined, native: "薬屋のひとりごと" });
  });

  it("keeps synonyms bounded, normalized and duplicate-free", () => {
    const result = normalizeAniListMedia(rawMedia({
      synonyms: ["  De Wa  ", "De Wa", ...Array.from({ length: 20 }, (_, index) => `Alias ${index}`)],
    }));
    expect(result.synonyms?.[0]).toBe("De Wa");
    expect(result.synonyms).toHaveLength(12);
    expect(new Set(result.synonyms).size).toBe(result.synonyms?.length);
  });

  it("retries a successful empty 'de wa' search once with a normalized fallback", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ data: { Page: { media: [] } } }))
      .mockResolvedValueOnce(response({ data: { Page: { media: [rawMedia({
        synonyms: ["De Wa"],
      })] } } }));
    vi.stubGlobal("fetch", fetcher);
    const result = await searchAniList(new NextRequest(
      "http://localhost/api/anilist/search?q=de%20wa&category=anime",
    ));
    expect(result.status).toBe(200);
    expect((await result.json()).meta.fallbackUsed).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(fetcher.mock.calls[1][1].body as string);
    expect(secondBody.variables.search).toBe("dewa");
    expect(buildAniListSearchFallback("de wa")).toBe("dewa");
  });

  it("does not use aggressive fallback for a short query", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ data: { Page: { media: [] } } }));
    vi.stubGlobal("fetch", fetcher);
    const result = await searchAniList(new NextRequest(
      "http://localhost/api/anilist/search?q=go&category=anime",
    ));
    expect((await result.json()).meta.fallbackUsed).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(buildAniListSearchFallback("go")).toBeNull();
  });

  it("ranks exact and prefix matches across all title fields deterministically", () => {
    const ranked = rankAniListSearchResults([
      rawMedia({ id: 30, title: { english: "Other" }, synonyms: ["Dewa Chronicle Extra"] }),
      rawMedia({ id: 20, title: { romaji: "Dewa Chronicle" }, popularity: 5 }),
      rawMedia({ id: 10, title: { native: "別名" }, synonyms: ["De Wa Chronicle"], popularity: 1 }),
    ], "de wa chronicle");
    expect(ranked.map((item) => item.id)).toEqual([10, 20, 30]);
  });

  it("uses the neutral message for a successful empty result", async () => {
    const outcome = await fetchAniListGlobalSearch({
      query: "unknown",
      category: "all",
      fetcher: vi.fn().mockResolvedValue(response({ results: [] })),
    });
    expect(outcome.diagnostic).toEqual({ kind: "empty", count: 0 });
    if (outcome.diagnostic.kind === "results") throw new Error("unexpected results");
    expect(anilistDiagnosticMessage(outcome.diagnostic)).toBe(
      "AniList bu sorgu için sonuç döndürmedi. Daha kısa başlık, İngilizce başlık veya farklı yazım deneyin.",
    );
  });

  it("shows rate-limit and Retry-After for 429", async () => {
    const outcome = await fetchAniListGlobalSearch({
      query: "frieren",
      category: "anime",
      fetcher: vi.fn().mockResolvedValue(response(
        { error: "limited" },
        429,
        { "Retry-After": "30" },
      )),
    });
    expect(outcome.diagnostic).toEqual({
      kind: "rate_limited",
      count: 0,
      retryAfter: "30",
    });
    if (outcome.diagnostic.kind !== "rate_limited") throw new Error("unexpected diagnostic");
    expect(anilistDiagnosticMessage(outcome.diagnostic)).toContain("Retry-After: 30");
  });

  it("maps 403 to temporary API unavailability", async () => {
    const outcome = await fetchAniListGlobalSearch({
      query: "frieren",
      category: "anime",
      fetcher: vi.fn().mockResolvedValue(response({}, 403)),
    });
    expect(outcome.diagnostic).toEqual({ kind: "unavailable", count: 0 });
  });

  it("maps 5xx and network exceptions to source errors", async () => {
    const server = await fetchAniListGlobalSearch({
      query: "frieren",
      category: "anime",
      fetcher: vi.fn().mockResolvedValue(response({}, 502)),
    });
    const network = await fetchAniListGlobalSearch({
      query: "frieren",
      category: "anime",
      fetcher: vi.fn().mockRejectedValue(new TypeError("offline")),
    });
    expect(server.diagnostic).toEqual({ kind: "source_error", count: 0 });
    expect(network.diagnostic).toEqual({ kind: "source_error", count: 0 });
  });

  it("treats a defensive 200 GraphQL errors payload as a source error", async () => {
    const outcome = await fetchAniListGlobalSearch({
      query: "frieren",
      category: "anime",
      fetcher: vi.fn().mockResolvedValue(response({
        errors: [{ message: "upstream detail" }],
      })),
    });
    expect(outcome.diagnostic).toEqual({ kind: "source_error", count: 0 });
  });

  it("preserves fulfilled results from other providers", () => {
    const settled: PromiseSettledResult<string[]>[] = [
      { status: "fulfilled", value: ["tmdb-result"] },
      { status: "fulfilled", value: [] },
      { status: "fulfilled", value: ["tvmaze-result"] },
      { status: "rejected", reason: new Error("provider failed") },
    ];
    expect(collectFulfilledSearchResults(settled)).toEqual([
      "tmdb-result",
      "tvmaze-result",
    ]);
  });

  it("forwards upstream 429 and sanitizes GraphQL errors in the route", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(
      {},
      429,
      { "Retry-After": "15" },
    )));
    const limited = await searchAniList(new NextRequest(
      "http://localhost/api/anilist/search?q=frieren&category=anime",
    ));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("15");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({
      errors: [{ message: "raw GraphQL detail" }],
    })));
    const graphql = await searchAniList(new NextRequest(
      "http://localhost/api/anilist/search?q=frieren&category=anime",
    ));
    expect(graphql.status).toBe(502);
    const payload = await graphql.json();
    expect(payload.meta.reason).toBe("graphql_error");
    expect(JSON.stringify(payload)).not.toContain("raw GraphQL detail");
  });

  it("removes the unverified global outage claim from the UI", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "components/global-search.tsx"),
      "utf8",
    );
    expect(source).not.toContain("global olarak yanıt vermiyor");
    expect(source).not.toContain("doğrulandı: id ile arama çalışıyor");
    expect(source).toContain("anilistDiagnosticMessage");
  });
});
