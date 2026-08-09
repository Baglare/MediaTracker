import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decodeResearchSourceAcquisitionRequest } from "@/features/recommendations/research/acquisition/codec";
import { parseDiscoveredWikipediaArticleUrl } from "@/features/recommendations/research/acquisition/wikipedia-url";
import { buildResearchEvidenceCacheKey } from "@/features/recommendations/research/cache/key";
import { createResearchVersionScope } from "@/features/recommendations/research/domain/version-scope";
import { validateResearchEvidenceCacheEntry } from "@/features/recommendations/research/cache/policy";
import { buildWikipediaPageQueryUrl } from "@/features/recommendations/research/adapters/wikipedia/page-resolver";
import { r3aAcquisitionRequest, r3aCandidateIdentity, r3aDiscoveredSource } from "@/features/recommendations/research/testing/acquisition-fixtures";

describe("D7-R3A acquisition request contract", () => {
  it("valid exact identity/scope/direct-document request'i kabul eder", () => {
    expect(decodeResearchSourceAcquisitionRequest(r3aAcquisitionRequest())).toMatchObject({ ok: true });
  });

  it.each(["ownerId", "userId", "note", "rating", "progress", "rawPrompt", "searchQuery", "snippet", "searchResponse", "providerSynthesizedOutput"])("forbidden %s alanını fail-closed reddeder", (field) => {
    expect(decodeResearchSourceAcquisitionRequest({ ...r3aAcquisitionRequest(), [field]: "private" })).toMatchObject({
      ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "research_acquisition_private_or_search_data_forbidden" })]),
    });
  });

  it("unknown nested field ve identity/scope mismatch'i reddeder", () => {
    const request = r3aAcquisitionRequest();
    expect(decodeResearchSourceAcquisitionRequest({ ...request, wikimediaIdentity: { ...request.wikimediaIdentity, title: "fuzzy" } })).toMatchObject({ ok: false });
    const other = r3aCandidateIdentity("1");
    expect(decodeResearchSourceAcquisitionRequest({ ...request, versionScope: createResearchVersionScope({ identity: other, scopeKind: "work" }) })).toMatchObject({ ok: false });
  });

  it("budget ve policy version'ları exact sınırlar", () => {
    expect(decodeResearchSourceAcquisitionRequest(r3aAcquisitionRequest({ maxDocuments: 3 }))).toMatchObject({ ok: false });
    expect(decodeResearchSourceAcquisitionRequest(r3aAcquisitionRequest({ maxPassages: 9 }))).toMatchObject({ ok: false });
    expect(decodeResearchSourceAcquisitionRequest(r3aAcquisitionRequest({ maxPacketCharacters: 12_001 }))).toMatchObject({ ok: false });
    expect(decodeResearchSourceAcquisitionRequest(r3aAcquisitionRequest({ acquisitionPolicyVersion: "future" as never }))).toMatchObject({ ok: false });
  });
});

describe("D7-R3A discovered Wikipedia URL policy", () => {
  it.each([
    ["https://en.wikipedia.org/wiki/Steins%3BGate", "enwiki", "Steins;Gate"],
    ["https://tr.wikipedia.org/wiki/Steins%3BGate", "trwiki", "Steins;Gate"],
    ["https://en.wikipedia.org/wiki/Steins_Gate", "enwiki", "Steins Gate"],
  ])("exact enabled article URL'yi title-search yapmadan çözer", (url, project, title) => {
    expect(parseDiscoveredWikipediaArticleUrl(r3aDiscoveredSource({ canonicalUrl: url, hostname: new URL(url).hostname }))).toMatchObject({ ok: true, value: { project, title } });
  });

  it("fragment'i canonical URL'den çıkarır", () => {
    expect(parseDiscoveredWikipediaArticleUrl(r3aDiscoveredSource({ canonicalUrl: "https://en.wikipedia.org/wiki/Steins%3BGate#Plot" }))).toMatchObject({
      ok: true, value: { canonicalUrl: "https://en.wikipedia.org/wiki/Steins%3BGate" },
    });
  });

  it.each([
    "https://de.wikipedia.org/wiki/Test",
    "https://evil.wikipedia.org/wiki/Test",
    "https://en.wikipedia.org.evil.example/wiki/Test",
    "http://en.wikipedia.org/wiki/Test",
    "https://user:pass@en.wikipedia.org/wiki/Test",
    "https://en.wikipedia.org/w/index.php?title=Test",
    "https://en.wikipedia.org/wiki/Test?utm_source=x",
    "https://en.wikipedia.org/wiki/%E0%A4%A",
  ])("disabled/deceptive/query/malformed URL'yi reddeder: %s", (url) => {
    const parsed = new URL(url);
    expect(parseDiscoveredWikipediaArticleUrl(r3aDiscoveredSource({ canonicalUrl: url, hostname: parsed.hostname })).ok).toBe(false);
  });

  it("MediaWiki query yalnız exact title kullanır; search/opensearch yoktur", () => {
    const url = buildWikipediaPageQueryUrl("enwiki", "Steins;Gate");
    expect(url).toContain("titles=Steins%3BGate");
    expect(url).not.toMatch(/opensearch|list=search|srsearch/i);
  });
});

describe("D7-R3A persistence boundary", () => {
  it.each([
    { packet: { retention: "transient_only" } },
    { passages: [{ text: "raw" }] },
    { normalizedDocument: { normalizedText: "raw" } },
  ])("packet/document/passage payload'u evidence cache codec'inde reddeder", (transient) => {
    const request = r3aAcquisitionRequest();
    const createdAt = "2026-08-08T00:00:00Z";
    const expiresAt = "2026-08-08T01:00:00Z";
    const result = validateResearchEvidenceCacheEntry({
      key: buildResearchEvidenceCacheKey({ versionScope: request.versionScope, aspectId: request.aspectId }),
      decision: {
        version: 1, versionScope: request.versionScope, aspectId: request.aspectId, status: "unknown", level: null,
        confidence: "none", supportingClaimIds: [], contradictingClaimIds: [], sourceCount: 0,
        independentSourceCount: 0, decisionPolicyVersion: "test", reasonCode: "no_source_found",
        researchedAt: createdAt, expiresAt, warnings: [],
      },
      claims: [], citations: [], createdAt, expiresAt, sourceRevisionFingerprint: "none",
      cacheStatus: "fresh", warnings: [], ...transient,
    } as never);
    expect(result).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "research_cache_transient_payload_forbidden" })]) });
  });
});
