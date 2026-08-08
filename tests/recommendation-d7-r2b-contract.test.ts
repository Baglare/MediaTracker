import { describe, expect, it } from "vitest";

import { decodeResearchDiscoveryRequest } from "@/features/recommendations/research/discovery/codec";
import {
  deriveResearchDiscoverySourcePolicy,
  hostnameMatchesDiscoveryDomain,
  requestMatchesResearchDiscoverySourcePolicy,
  resolveDiscoveredResearchUrl,
} from "@/features/recommendations/research/discovery/domain-policy";
import { buildResearchDiscoveryQueries } from "@/features/recommendations/research/discovery/query-builder";
import { createResearchVersionScope } from "@/features/recommendations/research/domain/version-scope";
import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import { steinsGateDiscoveryRequest } from "@/features/recommendations/research/testing/discovery-fixtures";

describe("D7-R2B discovery request codec", () => {
  it("valid public candidate/aspect request'i kabul eder", () => {
    expect(decodeResearchDiscoveryRequest(steinsGateDiscoveryRequest())).toMatchObject({ ok: true });
  });

  it.each(["ownerId", "rating", "note", "rawPrompt", "arbitraryUrl", "conversationText"])("private/arbitrary %s alanını fail-closed reddeder", (field) => {
    const result = decodeResearchDiscoveryRequest({ ...steinsGateDiscoveryRequest(), [field]: "private" });
    expect(result).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "research_discovery_private_data_forbidden" })]) });
  });

  it("unknown nested identity alanını reddeder", () => {
    const request = steinsGateDiscoveryRequest();
    expect(decodeResearchDiscoveryRequest({ ...request, candidateIdentity: { ...request.candidateIdentity, displayTitle: "x" } })).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([expect.objectContaining({ code: "research_discovery_unknown_field" })]),
    });
  });

  it("identity/scope mismatch ve unverified identity'yi reddeder", () => {
    const request = steinsGateDiscoveryRequest();
    expect(decodeResearchDiscoveryRequest({ ...request, candidateIdentity: { ...request.candidateIdentity, verified: false } })).toMatchObject({ ok: false });
    const other = createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: "1", mediaType: "anime" });
    expect(decodeResearchDiscoveryRequest({ ...request, versionScope: createResearchVersionScope({ identity: other, scopeKind: "work" }) })).toMatchObject({ ok: false });
  });

  it("empty domains, unsupported source ve maxSources overflow'u reddeder", () => {
    expect(decodeResearchDiscoveryRequest(steinsGateDiscoveryRequest({ allowedDomains: [] }))).toMatchObject({ ok: false });
    expect(decodeResearchDiscoveryRequest(steinsGateDiscoveryRequest({ allowedSourceIds: ["unknown" as never] }))).toMatchObject({ ok: false });
    expect(decodeResearchDiscoveryRequest(steinsGateDiscoveryRequest({ maxSources: 6 }))).toMatchObject({ ok: false });
    expect(decodeResearchDiscoveryRequest(steinsGateDiscoveryRequest({ allowedDomains: ["wikipedia.org", "wikipedia.org"] }))).toMatchObject({ ok: false });
  });
});

describe("D7-R2B deterministic query builder", () => {
  it("stable, registry-backed ve en fazla iki query üretir", () => {
    const request = steinsGateDiscoveryRequest();
    const first = buildResearchDiscoveryQueries(request);
    expect(first).toEqual(buildResearchDiscoveryQueries(request));
    expect(first).toHaveLength(2);
    expect(first[0]).toContain('"Steins;Gate"');
    expect(first[0]).toContain("Romance");
    expect(first[0]).toContain("romantic");
    expect(first.join(" ")).not.toContain("owner");
  });

  it("title quote escape eder; control ve aşırı uzun query'yi reddeder", () => {
    expect(buildResearchDiscoveryQueries(steinsGateDiscoveryRequest({ titleSnapshot: 'Say "Hello"' }))[0]).toContain('"Say \\"Hello\\""');
    expect(() => buildResearchDiscoveryQueries(steinsGateDiscoveryRequest({ titleSnapshot: "bad\nquery" }))).toThrow(/title_invalid/);
    expect(() => buildResearchDiscoveryQueries(steinsGateDiscoveryRequest({ titleSnapshot: "x".repeat(181) }))).toThrow(/title_invalid/);
  });

  it("raw user text alanı contract'ta olmadığı için query builder'a ulaşamaz", () => {
    const decoded = decodeResearchDiscoveryRequest({ ...steinsGateDiscoveryRequest(), rawPrompt: "eski sevgilimin sevdiği gibi" });
    expect(decoded.ok).toBe(false);
  });
});

describe("D7-R2B server-derived domain policy", () => {
  it("yalnız enabled Wikipedia policy'sini açar ve request exact policy ile eşleşir", () => {
    const request = steinsGateDiscoveryRequest();
    const policy = deriveResearchDiscoverySourcePolicy(request);
    expect(policy).toEqual({ allowedSourceIds: ["wikipedia"], allowedDomains: ["wikipedia.org"] });
    expect(policy && requestMatchesResearchDiscoverySourcePolicy(request, policy)).toBe(true);
    expect(policy && requestMatchesResearchDiscoverySourcePolicy({ ...request, allowedDomains: ["example.com"] }, policy)).toBe(false);
    expect(policy && requestMatchesResearchDiscoverySourcePolicy({ ...request, allowedSourceIds: ["editorial"] }, policy)).toBe(false);
  });

  it("subdomain boundary'sini doğru uygular ve deceptive hostname'i reddeder", () => {
    expect(hostnameMatchesDiscoveryDomain("en.wikipedia.org", "wikipedia.org")).toBe(true);
    expect(hostnameMatchesDiscoveryDomain("evilwikipedia.org", "wikipedia.org")).toBe(false);
    expect(hostnameMatchesDiscoveryDomain("wikipedia.org.evil.example", "wikipedia.org")).toBe(false);
  });

  it("OpenAI URL'sini HTTPS ve exact source registry host ile yeniden doğrular", () => {
    const policy = deriveResearchDiscoverySourcePolicy(steinsGateDiscoveryRequest())!;
    expect(resolveDiscoveredResearchUrl({ url: "https://en.wikipedia.org/wiki/Steins%3BGate#Plot", policy })).toMatchObject({
      ok: true, sourceId: "wikipedia", hostname: "en.wikipedia.org", canonicalUrl: "https://en.wikipedia.org/wiki/Steins%3BGate",
    });
    for (const url of [
      "http://en.wikipedia.org/wiki/Test",
      "https://user:pass@en.wikipedia.org/wiki/Test",
      "https://en.wikipedia.org.evil.example/wiki/Test",
      "https://127.0.0.1/wiki/Test",
      `https://en.wikipedia.org/${"x".repeat(2100)}`,
      "not a url",
      "https://de.wikipedia.org/wiki/Test",
    ]) expect(resolveDiscoveredResearchUrl({ url, policy }).ok).toBe(false);
  });
});
