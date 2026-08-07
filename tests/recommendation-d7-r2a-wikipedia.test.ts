import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import { createResearchVersionScope } from "@/features/recommendations/research/domain/version-scope";
import type { ResolvedWikimediaIdentity, ResolvedWikipediaPage } from "@/features/recommendations/research/adapters/types";
import { decodeWikipediaExtractResponse, decodeWikipediaPageResponse } from "@/features/recommendations/research/adapters/wikipedia/codec";
import { buildWikipediaExtractQueryUrl, fetchWikipediaDirectDocument } from "@/features/recommendations/research/adapters/wikipedia/document-adapter";
import { buildWikipediaPageQueryUrl, resolveWikipediaPage, selectVerifiedWikipediaSitelink } from "@/features/recommendations/research/adapters/wikipedia/page-resolver";
import { BoundedMetadataCache } from "@/features/recommendations/research/orchestration/direct-source-cache";
import { researchDirectWikimediaSource } from "@/features/recommendations/research/orchestration/direct-source-research";
import { FakeSecureResearchHttpClient, fakeHttpJson } from "@/features/recommendations/research/testing/fakes";

const encoder = new TextEncoder();
const identity = (externalId = "9253") => createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: externalId, mediaType: "anime", secondaryIds: [{ kind: "anilist", externalId }] });
const wikimediaIdentity = (scopeKey = "scope-1", entityId = "Q123"): ResolvedWikimediaIdentity => ({
  candidateCanonicalKey: "anilist:anime:9253", versionScopeKey: scopeKey, wikidataEntityId: entityId,
  matchedPropertyId: "P8729", matchedExternalId: "9253", verificationStatus: "verified",
  sitelinks: { enwiki: "Steins;Gate", trwiki: "Steins;Gate" }, otherSitelinkKeys: [],
  entityRevisionId: "55", resolvedAt: "2026-08-08T00:00:00.000Z", warnings: [],
});
const pageBody = (input: Partial<{ pageid: number; title: string; revid: number; timestamp: string; qid: string; extract: unknown; disambiguation: boolean; redirects: unknown[]; missing: boolean }> = {}) => ({
  query: {
    ...(input.redirects ? { redirects: input.redirects } : {}),
    pages: [{
      pageid: input.pageid ?? 42, title: input.title ?? "Steins;Gate",
      fullurl: "https://en.wikipedia.org/wiki/Steins%3BGate",
      ...(input.missing ? { missing: true } : {}),
      pageprops: { wikibase_item: input.qid ?? "Q123", ...(input.disambiguation ? { disambiguation: "" } : {}) },
      revisions: [{ revid: input.revid ?? 777, timestamp: input.timestamp ?? "2026-08-08T00:00:00Z" }],
      ...(input.extract !== undefined ? { extract: input.extract } : {}),
    }],
  },
});
const resolvedPage = (): ResolvedWikipediaPage => ({
  sourceId: "wikipedia", wikiProject: "enwiki", language: "en", wikidataEntityId: "Q123",
  canonicalTitle: "Steins;Gate", pageId: 42, revisionId: "777", revisionTimestamp: "2026-08-08T00:00:00Z",
  canonicalUrl: "https://en.wikipedia.org/wiki/Steins%3BGate", revisionUrl: "https://en.wikipedia.org/w/index.php?title=Steins%3BGate&oldid=777", warnings: [],
});
const wdqsBody = (qid = "Q123") => ({ results: { bindings: [{ item: { type: "uri", value: `http://www.wikidata.org/entity/${qid}` } }] } });
const entityBody = (externalId = "9253", qid = "Q123") => ({ entities: { [qid]: {
  id: qid, lastrevid: 55, modified: "2026-08-08T00:00:00Z",
  claims: { P8729: [{ mainsnak: { datavalue: { value: externalId } } }] },
  sitelinks: { enwiki: { title: "Steins;Gate" } },
} } });

describe("D7-R2A Wikipedia verified sitelink/page codec", () => {
  it("language policy enwiki sonra trwiki seçer ve sitelink yoksa title aramaz", () => {
    expect(selectVerifiedWikipediaSitelink({ identity: wikimediaIdentity("scope") })).toEqual({ project: "enwiki", title: "Steins;Gate" });
    expect(selectVerifiedWikipediaSitelink({ identity: { ...wikimediaIdentity("scope"), sitelinks: { trwiki: "Steins;Gate" } } })).toEqual({ project: "trwiki", title: "Steins;Gate" });
    expect(selectVerifiedWikipediaSitelink({ identity: { ...wikimediaIdentity("scope"), sitelinks: {} } })).toBeNull();
    expect(buildWikipediaPageQueryUrl("enwiki", "Steins;Gate")).not.toMatch(/opensearch|search=/i);
  });

  it("page ID/revision/QID decode eder; canonical redirect warning taşır", () => {
    const decoded = decodeWikipediaPageResponse(encoder.encode(JSON.stringify(pageBody({ redirects: [{ from: "X", to: "Steins;Gate" }] }))), "Q123");
    expect(decoded).toMatchObject({ pageId: 42, title: "Steins;Gate", revisionId: "777", wikidataEntityId: "Q123" });
    expect(decoded.warnings).toContain("wikipedia_canonical_redirect");
  });

  it.each([
    [pageBody({ missing: true }), "wikipedia_page_missing"],
    [pageBody({ disambiguation: true }), "wikipedia_disambiguation_page"],
    [pageBody({ qid: "Q999" }), "wikipedia_wikidata_identity_mismatch"],
    [pageBody({ revid: 0 }), "wikipedia_revision_invalid"],
  ])("missing/disambiguation/identity/revision drift'i reddeder", (body, message) => {
    expect(() => decodeWikipediaPageResponse(encoder.encode(JSON.stringify(body)), "Q123")).toThrow(message);
  });

  it("page resolver final canonical ve stable revision URL üretir", async () => {
    const client = new FakeSecureResearchHttpClient([fakeHttpJson(pageBody(), { finalUrl: "https://en.wikipedia.org/w/api.php" })]);
    const result = await resolveWikipediaPage({ identity: wikimediaIdentity(), httpClient: client, userAgent: "MediaTracker/0.1 (contact@example.invalid)" });
    expect(result).toMatchObject({ status: "resolved", page: { pageId: 42, revisionId: "777", canonicalUrl: expect.stringContaining("/wiki/"), revisionUrl: expect.stringContaining("oldid=777") } });
    expect(client.requests[0].url).toContain("titles=Steins%3BGate");
  });
});

describe("D7-R2A revision-bound direct document", () => {
  it("bounded plaintext'ten transient-only document ve persisted citation metadata üretir", async () => {
    const client = new FakeSecureResearchHttpClient([fakeHttpJson(pageBody({ extract: "A bounded synthetic encyclopedia lead." }), { finalUrl: "https://en.wikipedia.org/w/api.php" })]);
    const result = await fetchWikipediaDirectDocument({ page: resolvedPage(), httpClient: client, userAgent: "MediaTracker/0.1 (contact@example.invalid)", now: () => new Date("2026-08-08T00:00:00Z") });
    expect(result.document).toMatchObject({ sourceId: "wikipedia", revisionId: "777", retention: "transient_only", securityFlags: [] });
    expect(result.document.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.citation).toMatchObject({ sourceId: "wikipedia", revisionId: "777", licenseClass: "cc_by_sa", canonicalUrl: expect.stringContaining("oldid=777") });
    expect(result.citation).not.toHaveProperty("boundedText");
    const url = buildWikipediaExtractQueryUrl(resolvedPage());
    expect(url).toContain("explaintext=1");
    expect(url).toContain("pageids=42");
    expect(url).not.toContain("opensearch");
  });

  it("revision race, oversized text, control char ve non-string extract'i reddeder", async () => {
    const cases = [
      pageBody({ revid: 778, extract: "changed" }),
      pageBody({ extract: "x".repeat(24_001) }),
      pageBody({ extract: "unsafe\u0000text" }),
      pageBody({ extract: 7 }),
    ];
    for (const body of cases) {
      await expect(fetchWikipediaDirectDocument({ page: resolvedPage(), httpClient: new FakeSecureResearchHttpClient([fakeHttpJson(body)]), userAgent: "MediaTracker/0.1 (contact@example.invalid)" })).rejects.toBeInstanceOf(Error);
    }
  });

  it("extract codec malformed page item'i ve API error'u fail-closed reddeder", () => {
    expect(() => decodeWikipediaExtractResponse(encoder.encode(JSON.stringify({ query: { pages: [null] } })), "Q123")).toThrow("wikipedia_page_ambiguous");
    expect(() => decodeWikipediaExtractResponse(encoder.encode(JSON.stringify({ error: { code: "ratelimited" } })), "Q123")).toThrow("wikipedia_api_error:ratelimited");
  });
});

describe("D7-R2A direct-source orchestration ve metadata cache", () => {
  it("feature flag veya User-Agent eksikse fail-closed ve network'süz kapanır", async () => {
    const candidate = identity();
    const client = new FakeSecureResearchHttpClient([]);
    const result = await researchDirectWikimediaSource({ identity: candidate, versionScope: createResearchVersionScope({ identity: candidate, scopeKind: "work" }), httpClient: client, environment: {} });
    expect(result).toMatchObject({ status: "adapter_unavailable", documents: [], citations: [] });
    expect(client.requests).toHaveLength(0);
  });

  it("exact identity → Wikidata verify → sitelink → revision → transient document akışını tamamlar", async () => {
    const candidate = identity("9260");
    const scope = createResearchVersionScope({ identity: candidate, scopeKind: "season", seasonNumber: 1 });
    const client = new FakeSecureResearchHttpClient([
      fakeHttpJson(wdqsBody("Q777")), fakeHttpJson(entityBody("9260", "Q777")),
      fakeHttpJson(pageBody({ qid: "Q777", revid: 888 })), fakeHttpJson(pageBody({ qid: "Q777", revid: 888, extract: "Synthetic bounded direct document." })),
    ]);
    const result = await researchDirectWikimediaSource({
      identity: candidate, versionScope: scope, httpClient: client,
      environment: { MEDIA_TRACKER_WIKIMEDIA_RESEARCH_ENABLED: "1", MEDIA_TRACKER_RESEARCH_USER_AGENT: "MediaTracker/0.1 (contact@example.invalid)" },
      now: () => new Date("2026-08-08T00:00:00Z"),
    });
    expect(result).toMatchObject({ status: "document_ready", wikimediaIdentity: { versionScopeKey: scope.scopeKey }, telemetry: { entityVerificationPassed: true, revisionFetched: true, documentReady: true } });
    expect(result.documents).toHaveLength(1);
    expect(result.citations).toHaveLength(1);
    expect(result).not.toHaveProperty("claims");
  });

  it("scope/identity mismatch'te network açmaz", async () => {
    const candidate = identity("9300");
    const other = identity("9301");
    const client = new FakeSecureResearchHttpClient([]);
    const result = await researchDirectWikimediaSource({
      identity: candidate, versionScope: createResearchVersionScope({ identity: other, scopeKind: "work" }), httpClient: client,
      environment: { MEDIA_TRACKER_WIKIMEDIA_RESEARCH_ENABLED: "1", MEDIA_TRACKER_RESEARCH_USER_AGENT: "MediaTracker/0.1 (contact@example.invalid)" },
    });
    expect(result.status).toBe("identity_unverified");
    expect(client.requests).toHaveLength(0);
  });

  it("metadata cache coalesce eder; loader/network hatasını negative-cache etmez", async () => {
    const cache = new BoundedMetadataCache<string>();
    let loads = 0;
    const loader = async () => { loads += 1; throw new Error("network"); };
    await expect(cache.getOrLoad("key", loader, 1000)).rejects.toThrow("network");
    await expect(cache.getOrLoad("key", loader, 1000)).rejects.toThrow("network");
    expect(loads).toBe(2);
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const success = async () => { await gate; return "value"; };
    const first = cache.getOrLoad("ok", success, 1000);
    const second = cache.getOrLoad("ok", success, 1000);
    release?.();
    expect((await Promise.all([first, second])).map((item) => item.source).sort()).toEqual(["coalesced", "loaded"]);
  });
});
