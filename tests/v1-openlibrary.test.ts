import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidProviderUserAgent, providerUserAgent } from "@/lib/api/provider-identity";
import { resolvePublicProviderCapabilities } from "@/lib/providers/release-policy";
import { openLibrarySourceUrl } from "@/lib/providers/openlibrary-source-url";
import { prepareProviderEvidencePipeline } from "@/features/recommendations/providers/pipeline";
import { mapOpenLibraryResult } from "@/features/discovery/domain/media-mappers";
import OpenLibraryResultCard from "@/components/openlibrary-result-card";
import MediaDetailModal from "@/components/media-detail-modal";
import MediaModal from "@/components/media-modal";
import type { AiCandidate } from "@/lib/ai/types";

const mocks = vi.hoisted(() => ({ admission: vi.fn(), cooldown: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/distributed-rate-limit", () => ({
  enforceDistributedRateLimit: mocks.admission, reportProviderCooldown: mocks.cooldown,
}));
const UA = "MediaTracker/1.0 (mediatracker.contact@gmail.com)";
const doc = { key: "/works/OL27448W", title: "Book", subject: ["Fantasy"], number_of_pages_median: 321,
  first_publish_year: 2001, language: ["eng"], edition_key: ["OL2M"] };
const noop = () => {};
let route: typeof import("@/app/api/openlibrary/search/route");
const post = (query = "Book") => new NextRequest("https://app.invalid/api/openlibrary/search", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }),
});
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("MEDIA_TRACKER_PROVIDER_USER_AGENT", UA);
  mocks.admission.mockReset().mockResolvedValue(null);
  mocks.cooldown.mockReset().mockResolvedValue(null);
  route = await import("@/app/api/openlibrary/search/route");
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("identified provider deployment contract", () => {
  it("accepts the intended UA consistently", () => {
    expect(isValidProviderUserAgent(UA)).toBe(true);
    expect(providerUserAgent(UA)).toBe(UA);
    expect(resolvePublicProviderCapabilities({ NODE_ENV: "test", MEDIA_TRACKER_PROVIDER_USER_AGENT: UA }).providers.openlibrary.enabled).toBe(true);
  });
  it.each(["", " ", "Mozilla/5.0", "MediaTracker", "MediaTracker/1.0", "OtherApp/1.0 (contact@example.com)",
    "MediaTracker/1.0 (bad@)", "MediaTracker/1.0 (a..b@example.com)", "MediaTracker/1.0 (contact@-example.com)",
    `${UA}\r\nX-Forged: yes`, `${UA}\n`, "MediaTracker/1.0 (a\u0001b@example.com)",
    `MediaTracker/1.0 (${"a".repeat(256)}@example.com)`, "MediaTracker/1.0 (https://example.com)",
  ])("rejects invalid UA %j in runtime and capability", (value) => {
    expect(isValidProviderUserAgent(value)).toBe(false);
    expect(providerUserAgent(value)).toBeNull();
    expect(resolvePublicProviderCapabilities({ NODE_ENV: "test", MEDIA_TRACKER_PROVIDER_USER_AGENT: value }).providers.openlibrary.enabled).toBe(false);
  });
});

describe("Open Library bounded ephemeral search", () => {
  it("caches normalized success, sends UA, bounds results and admits every hit", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ docs: Array.from({ length: 20 }, () => doc), numFound: 20 }));
    vi.stubGlobal("fetch", fetcher);
    const miss = await route.POST(post());
    const first = await miss.json();
    expect(first.results).toHaveLength(12);
    expect(first.results[0]).toMatchObject({ siteUrl: "https://openlibrary.org/works/OL27448W", pageCount: 321 });
    expect(fetcher.mock.calls[0][0]).toContain("search.json?");
    expect(fetcher.mock.calls[0][1].headers["user-agent"]).toBe(UA);
    expect(fetcher.mock.calls[0][1].cache).toBe("no-store");
    const hit = await route.POST(post(" Book "));
    expect(await hit.json()).toEqual(first);
    expect(hit.headers.get("cache-control")).toBe("no-store");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(mocks.admission).toHaveBeenCalledTimes(2);
    expect(mocks.admission).toHaveBeenLastCalledWith(expect.any(Request), "openlibrary_search");
    mocks.admission.mockResolvedValue(Response.json({ code: "rate_limited" }, { status: 429 }));
    expect((await route.POST(post())).status).toBe(429);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.stubEnv("MEDIA_TRACKER_PROVIDER_USER_AGENT", "Mozilla/5.0");
    expect((await route.POST(post())).status).toBe(503);
    expect(mocks.admission).toHaveBeenCalledTimes(3);
  });
  it.each([429, 500, 503])("never caches failure %s or exposes upstream body", async (status) => {
    const fetcher = vi.fn().mockImplementation(async () => new Response("private upstream error", { status }));
    vi.stubGlobal("fetch", fetcher);
    if (status === 429) mocks.cooldown.mockImplementation(async () => Response.json({ code: "rate_limited" }, { status: 429 }));
    for (let i = 0; i < 2; i++) {
      const response = await route.POST(post());
      expect(response.status).toBe(status === 429 ? 429 : 502);
      expect(await response.text()).not.toContain("private upstream error");
    }
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(mocks.cooldown).toHaveBeenCalledWith(expect.any(Request), "openlibrary_search", expect.any(Response));
  });
  it.each([{ docs: [], numFound: 0 }, { docs: "malformed", numFound: 1 }, { docs: [doc], numFound: -1 }])(
    "does not cache negative or malformed success %j", async (payload) => {
      const fetcher = vi.fn().mockImplementation(async () => Response.json(payload));
      vi.stubGlobal("fetch", fetcher);
      await route.POST(post()); await route.POST(post());
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  it("does not cache JSON decode failure", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response("{bad json"));
    vi.stubGlobal("fetch", fetcher);
    expect((await route.POST(post())).status).toBe(502);
    expect((await route.POST(post())).status).toBe(502);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("bounds memory by LRU capacity and expires after five minutes", async () => {
    vi.useFakeTimers();
    const cache = await import("@/lib/api/openlibrary-search-cache");
    const key = cache.openLibrarySearchCacheKey("private search");
    expect(key).toMatch(/^openlibrary:search:v1:[a-f0-9]{64}$/);
    const payload = { results: [route.normalizeDoc(doc)], totalFound: 1 };
    cache.setOpenLibrarySearchCache(key, payload);
    for (let i = 0; i < cache.OPEN_LIBRARY_SEARCH_CACHE_MAX_ENTRIES; i++) cache.setOpenLibrarySearchCache(cache.openLibrarySearchCacheKey(String(i)), payload);
    expect(cache.getOpenLibrarySearchCache(key)).toBeUndefined();
    const last = cache.openLibrarySearchCacheKey("63");
    expect(cache.getOpenLibrarySearchCache(last)).toEqual(payload);
    vi.advanceTimersByTime(cache.OPEN_LIBRARY_SEARCH_CACHE_TTL_MS);
    expect(cache.getOpenLibrarySearchCache(last)).toBeUndefined();
  });
  it("rejects unsafe identities and bounds retained metadata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ numFound: 2, docs: [
      { ...doc, key: "/redirect?url=evil" },
      { ...doc, title: "<b>Book</b>", subject: Array(100).fill("x".repeat(1000)), author_name: "invalid", cover_i: -1 },
    ] })));
    const body = await (await route.POST(post())).json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].title).toBe("Book");
    expect(body.results[0].subjects).toHaveLength(5);
    expect(body.results[0].subjects[0]).toHaveLength(256);
    expect(body.results[0].authors).toBeUndefined();
    expect(body.results[0].coverUrl).toBeUndefined();
  });
});

describe("Search evidence without automated Work enrichment", () => {
  it("keeps the candidate and structured evidence while description remains partial", async () => {
    const raw = route.normalizeDoc(doc);
    const candidate: AiCandidate = { source: "openlibrary", externalId: raw.externalId, type: "book", title: raw.title,
      globalSearch: { source: "openlibrary", externalId: raw.externalId, type: "book", title: raw.title, raw } };
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const result = await prepareProviderEvidencePipeline({ candidates: [candidate], baseUrl: "https://app.invalid", fetchImpl: fetcher });
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.candidates).toEqual([candidate]);
    expect(result.rejectedCandidates).toEqual([]);
    const snapshot = [...result.evidenceByCandidateKey.values()][0];
    expect(snapshot.objectiveMetadata).toMatchObject({ subjects: ["Fantasy"], pageCount: 321, releaseYear: 2001, language: "eng" });
    expect(snapshot.providerCoverage.openlibrary).toBe("partial");
    expect(snapshot.missingFields).toContain("description");
    expect(snapshot.rawEvidenceClaims).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "openlibrary", sourceKind: "provider_keyword", field: "subjects", value: "Fantasy" }),
      expect.objectContaining({ provider: "openlibrary", field: "pageCount", value: 321 }),
    ]));
    expect(result.telemetry.enrichedCandidates).toBe(0);
    expect(readFileSync("features/recommendations/providers/openlibrary-adapter.ts", "utf8")).not.toContain("fetchOpenLibraryWorkEvidence");
  });
});

describe("safe Open Library attribution", () => {
  it.each(["/works/OL27448W", "/books/OL2M"])("accepts exact work/book %s", (externalId) => {
    const siteUrl = `https://openlibrary.org${externalId}`;
    expect(openLibrarySourceUrl({ externalSource: "openlibrary", externalId })).toBe(siteUrl);
    expect(openLibrarySourceUrl({ externalSource: "openlibrary", siteUrl })).toBe(siteUrl);
  });
  it.each(["javascript:alert(1)", "data:text/html,hi", "https://evil.example/works/OL1W", "https://openlibrary.org.evil/works/OL1W",
    "http://openlibrary.org/works/OL1W", "https://openlibrary.org/redirect", "https://openlibrary.org/works/OL1W?evil=1",
    "https://user@openlibrary.org/works/OL1W", "https://openlibrary.org:444/works/OL1W", "https://openlibrary.org/works/OLbadW",
    "https://openlibrary.org/works/OL1W\n", "https://openlibrary.org/works/OL1W#x",
  ])("rejects unsafe source %j", (siteUrl) => {
    expect(openLibrarySourceUrl({ externalSource: "openlibrary", siteUrl })).toBeUndefined();
  });
  it.each(["/works/OLbadW", "/works/OL0W", "/books/OL1W", "/arbitrary", "/works/OL1W\n", "OL1W"])("rejects malformed key %j", (externalId) => {
    expect(openLibrarySourceUrl({ externalSource: "openlibrary", externalId })).toBeUndefined();
  });
  it.each([undefined, "javascript:bad", "https://evil.example", "https://openlibrary.org/works/OL999W"])("renders advanced and saved existing links safely: %j", (siteUrl) => {
    const raw = { ...route.normalizeDoc(doc), siteUrl };
    const media = mapOpenLibraryResult(raw);
    expect(media.siteUrl).toBe("https://openlibrary.org/works/OL27448W");
    const saved = { ...media, siteUrl };
    const outputs = [
      renderToStaticMarkup(createElement(OpenLibraryResultCard, { result: raw, isAlreadyAdded: false, isAdding: false, onAdd: noop })),
      renderToStaticMarkup(createElement(MediaDetailModal, { media: saved, open: true, onClose: noop, onEdit: noop, onDelete: noop, onToggleFavorite: noop, onIncrementProgress: noop, onComplete: noop })),
      renderToStaticMarkup(createElement(MediaModal, { editingItem: saved, isOpen: true, onClose: noop, onSave: noop })),
    ];
    for (const html of outputs) {
      const link = html.match(/<a\b[^>]*>/g)?.find((tag) => tag.includes('href="https://openlibrary.org/works/OL27448W"'));
      expect(link).toContain('rel="noopener noreferrer"');
      expect(link).toContain('target="_blank"');
      expect(link).toMatch(/aria-label="[^"]*Open Library/);
      expect(html).not.toMatch(/href="(?:javascript:|data:|https:\/\/evil)/);
    }
  });
});
