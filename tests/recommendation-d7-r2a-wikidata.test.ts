import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import { createResearchVersionScope } from "@/features/recommendations/research/domain/version-scope";
import { decodeWikidataEntityResponse, decodeWikidataQueryResponse } from "@/features/recommendations/research/adapters/wikidata/codec";
import { resolveExactWikidataIdentity } from "@/features/recommendations/research/adapters/wikidata/identity-resolver";
import { validateWikidataExternalIdRegistry, WIKIDATA_EXTERNAL_ID_PROPERTIES, wikidataIdentityCandidates } from "@/features/recommendations/research/adapters/wikidata/external-id-registry";
import { buildExactWikidataQuery, buildExactWikidataQueryUrl, escapeSparqlExactLiteral } from "@/features/recommendations/research/adapters/wikidata/query-builder";
import { FakeSecureResearchHttpClient, fakeHttpJson } from "@/features/recommendations/research/testing/fakes";

const encoder = new TextEncoder();
const queryBody = (...values: unknown[]) => ({
  head: { vars: ["item"] }, results: { bindings: values.map((value) => typeof value === "string" ? { item: { type: "uri", value } } : value) },
});
const entityBody = (input: { entityId?: string; propertyId?: string; externalId?: string; sitelinks?: Record<string, unknown> } = {}) => {
  const entityId = input.entityId ?? "Q123";
  const propertyId = input.propertyId ?? "P8729";
  return {
    entities: {
      [entityId]: {
        id: entityId, lastrevid: 55, modified: "2026-08-08T00:00:00Z",
        claims: { [propertyId]: [{ mainsnak: { snaktype: "value", datavalue: { type: "string", value: input.externalId ?? "9253" } } }] },
        sitelinks: input.sitelinks ?? { enwiki: { site: "enwiki", title: "Steins;Gate" }, trwiki: { site: "trwiki", title: "Steins;Gate" }, dewiki: { site: "dewiki", title: "Steins;Gate" } },
      },
    },
  };
};

function animeIdentity(externalId = "9253") {
  return createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: externalId, mediaType: "anime", secondaryIds: [{ kind: "anilist", externalId }] });
}

describe("D7-R2A Wikidata external-ID registry ve query", () => {
  it("enabled property mapping'leri official property URL ve exact media scope taşır", () => {
    expect(validateWikidataExternalIdRegistry()).toEqual([]);
    expect(WIKIDATA_EXTERNAL_ID_PROPERTIES.filter((entry) => entry.queryEnabled).map((entry) => [entry.registryKey, entry.propertyId])).toEqual([
      ["anilist_anime", "P8729"], ["anilist_manga", "P8731"], ["imdb", "P345"], ["tmdb_movie", "P4947"], ["tmdb_tv", "P4983"],
    ]);
  });

  it("TVMaze ve Open Library mapping'lerini doğrulanana kadar query-disabled tutar", () => {
    expect(WIKIDATA_EXTERNAL_ID_PROPERTIES.filter((entry) => ["tvmaze", "openlibrary_work", "openlibrary_edition"].includes(entry.registryKey)).every((entry) => !entry.queryEnabled)).toBe(true);
  });

  it("media/scope mismatch ve unsupported provider candidate üretmez", () => {
    const tmdb = createVerifiedCandidateIdentity({ primaryProvider: "tmdb", primaryExternalId: "1399", mediaType: "tv", secondaryIds: [{ kind: "tmdb", externalId: "1399" }] });
    const season = createResearchVersionScope({ identity: tmdb, scopeKind: "season", seasonNumber: 1 });
    expect(wikidataIdentityCandidates({ identity: tmdb, versionScope: season })).toEqual([]);
    const tvmaze = createVerifiedCandidateIdentity({ primaryProvider: "tvmaze", primaryExternalId: "1", mediaType: "tv", secondaryIds: [{ kind: "tvmaze", externalId: "1" }] });
    expect(wikidataIdentityCandidates({ identity: tvmaze, versionScope: createResearchVersionScope({ identity: tvmaze, scopeKind: "work" }) })).toEqual([]);
  });

  it("exact literal query bounded LIMIT kullanır; title/regex/fuzzy içermez", () => {
    const identity = animeIdentity();
    const candidate = wikidataIdentityCandidates({ identity, versionScope: createResearchVersionScope({ identity, scopeKind: "work" }) })[0];
    const query = buildExactWikidataQuery(candidate);
    expect(query).toContain('wdt:P8729 "9253"');
    expect(query).toContain("LIMIT 2");
    expect(query).not.toMatch(/regex|label|title|contains/i);
    expect(new URL(buildExactWikidataQueryUrl(candidate)).hostname).toBe("query.wikidata.org");
  });

  it("SPARQL literal'i escape eder; control/oversize input reddeder", () => {
    expect(escapeSparqlExactLiteral('a"\\b')).toBe('a\\"\\\\b');
    expect(() => escapeSparqlExactLiteral("a\nb")).toThrow("wikidata_external_id_literal_invalid");
    expect(() => escapeSparqlExactLiteral("x".repeat(201))).toThrow("wikidata_external_id_literal_invalid");
  });
});

describe("D7-R2A Wikidata codec ve exact entity verification", () => {
  it("0/1/>1 query sonucunu deterministic codec ile ayırır", () => {
    expect(decodeWikidataQueryResponse(encoder.encode(JSON.stringify(queryBody()))).entityIds).toEqual([]);
    expect(decodeWikidataQueryResponse(encoder.encode(JSON.stringify(queryBody("http://www.wikidata.org/entity/Q123")))).entityIds).toEqual(["Q123"]);
    expect(decodeWikidataQueryResponse(encoder.encode(JSON.stringify(queryBody("http://www.wikidata.org/entity/Q2", "http://www.wikidata.org/entity/Q1")))).entityIds).toEqual(["Q1", "Q2"]);
  });

  it("malformed row'u atlar; bütünü malformed response'u reddeder", () => {
    const decoded = decodeWikidataQueryResponse(encoder.encode(JSON.stringify(queryBody({}, "https://www.wikidata.org/entity/Q9"))));
    expect(decoded.entityIds).toEqual(["Q9"]);
    expect(decoded.warnings).toContain("wikidata_binding_qid_invalid");
    expect(() => decodeWikidataQueryResponse(encoder.encode(JSON.stringify({ results: {} })))).toThrow("wikidata_bindings_missing");
  });

  it("entity property, revision ve sitelink'i strict decode eder", () => {
    const entity = decodeWikidataEntityResponse({ bytes: encoder.encode(JSON.stringify(entityBody())), entityId: "Q123", propertyId: "P8729" });
    expect(entity).toMatchObject({ entityId: "Q123", externalIds: ["9253"], sitelinks: { enwiki: "Steins;Gate", trwiki: "Steins;Gate" }, lastRevisionId: "55" });
    expect(entity.otherSitelinkKeys).toEqual(["dewiki"]);
  });

  it("missing entity/property mismatch ve snak drift'i fail-closed taşır", () => {
    expect(() => decodeWikidataEntityResponse({ bytes: encoder.encode(JSON.stringify({ entities: {} })), entityId: "Q1", propertyId: "P345" })).toThrow("wikidata_entity_missing");
    const drift = entityBody();
    (drift.entities.Q123.claims.P8729[0].mainsnak.datavalue as unknown) = { type: "string", value: 9253 };
    const decoded = decodeWikidataEntityResponse({ bytes: encoder.encode(JSON.stringify(drift)), entityId: "Q123", propertyId: "P8729" });
    expect(decoded.externalIds).toEqual([]);
    expect(decoded.warnings).toContain("wikidata_property_snak_drift");
  });
});

describe("D7-R2A exact Wikidata resolver", () => {
  it("1 QID'yi entity JSON'da aynı property/external ID ile yeniden doğrular", async () => {
    const identity = animeIdentity();
    const scope = createResearchVersionScope({ identity, scopeKind: "work" });
    const client = new FakeSecureResearchHttpClient([
      fakeHttpJson(queryBody("http://www.wikidata.org/entity/Q123"), { finalUrl: "https://query.wikidata.org/sparql" }),
      fakeHttpJson(entityBody(), { finalUrl: "https://www.wikidata.org/w/api.php" }),
    ]);
    const result = await resolveExactWikidataIdentity({ identity, versionScope: scope, httpClient: client, userAgent: "MediaTracker/0.1 (contact@example.invalid)", now: () => new Date("2026-08-08T00:00:00Z") });
    expect(result).toMatchObject({ status: "verified", propertyId: "P8729", resultCount: 1, identity: { wikidataEntityId: "Q123", matchedExternalId: "9253", versionScopeKey: scope.scopeKey } });
    expect(client.requests).toHaveLength(2);
    expect(client.requests[0]).toMatchObject({
      method: "GET",
      headers: { accept: "application/sparql-results+json, application/json" },
      acceptedContentTypes: ["application/sparql-results+json", "application/json"],
    });
    expect(client.requests[1]).toMatchObject({ method: "GET", headers: { accept: "application/json" }, acceptedContentTypes: ["application/json"] });
    expect(client.requests.map((request) => request.url).join(" ")).not.toMatch(/opensearch|title=/i);
  });

  it("0 result not-found, >1 ambiguous ve external mismatch unverified olur", async () => {
    const identity = animeIdentity();
    const scope = createResearchVersionScope({ identity, scopeKind: "work" });
    expect(await resolveExactWikidataIdentity({ identity, versionScope: scope, httpClient: new FakeSecureResearchHttpClient([fakeHttpJson(queryBody())]), userAgent: "MediaTracker/0.1 (contact@example.invalid)" })).toMatchObject({ status: "identity_not_found" });
    expect(await resolveExactWikidataIdentity({ identity, versionScope: scope, httpClient: new FakeSecureResearchHttpClient([fakeHttpJson(queryBody("http://www.wikidata.org/entity/Q1", "http://www.wikidata.org/entity/Q2"))]), userAgent: "MediaTracker/0.1 (contact@example.invalid)" })).toMatchObject({ status: "identity_ambiguous", resultCount: 2 });
    const mismatch = new FakeSecureResearchHttpClient([fakeHttpJson(queryBody("http://www.wikidata.org/entity/Q123")), fakeHttpJson(entityBody({ externalId: "999" }))]);
    expect(await resolveExactWikidataIdentity({ identity, versionScope: scope, httpClient: mismatch, userAgent: "MediaTracker/0.1 (contact@example.invalid)" })).toMatchObject({ status: "identity_unverified" });
  });

  it("scope/identity mismatch ve title fallback'i reddeder", async () => {
    const identity = animeIdentity();
    const other = animeIdentity("1");
    const client = new FakeSecureResearchHttpClient([]);
    const result = await resolveExactWikidataIdentity({ identity, versionScope: createResearchVersionScope({ identity: other, scopeKind: "work" }), httpClient: client, userAgent: "MediaTracker/0.1 (contact@example.invalid)" });
    expect(result).toMatchObject({ status: "identity_unverified" });
    expect(client.requests).toHaveLength(0);
  });
});
