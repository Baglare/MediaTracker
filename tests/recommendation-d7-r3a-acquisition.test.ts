import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { acquireResearchSources } from "@/features/recommendations/research/acquisition/orchestrator";
import { createResearchVersionScope } from "@/features/recommendations/research/domain/version-scope";
import type { SecureResearchHttpClient, SecureResearchHttpRequest, SecureResearchHttpResponse } from "@/features/recommendations/research/network/types";
import { FakeSecureResearchHttpClient, fakeHttpJson } from "@/features/recommendations/research/testing/fakes";
import { r3aAcquisitionRequest, r3aDirectDocument, r3aDiscoveredSource, r3aWikimediaIdentity } from "@/features/recommendations/research/testing/acquisition-fixtures";

const LIVE_ENV = { NODE_ENV: "test", MEDIA_TRACKER_WIKIMEDIA_RESEARCH_ENABLED: "1", MEDIA_TRACKER_RESEARCH_USER_AGENT: "MediaTracker/0.1 (contact@example.invalid)" };
const DISABLED_ENV = { NODE_ENV: "test" };

function pageBody(input: { qid?: string; revid?: number; extract?: unknown; missing?: boolean; disambiguation?: boolean; redirects?: unknown[] } = {}) {
  return {
    query: {
      ...(input.redirects ? { redirects: input.redirects } : {}),
      pages: [{
        pageid: 42, title: "Steins;Gate", fullurl: "https://en.wikipedia.org/wiki/Steins%3BGate",
        ...(input.missing ? { missing: true } : {}),
        pageprops: { wikibase_item: input.qid ?? "Q123", ...(input.disambiguation ? { disambiguation: "" } : {}) },
        revisions: [{ revid: input.revid ?? 777, timestamp: "2026-08-08T00:00:00Z" }],
        ...(input.extract !== undefined ? { extract: input.extract } : {}),
      }],
    },
  };
}

describe("D7-R3A direct and discovered Wikimedia acquisition", () => {
  it("verified direct R2A document'tan network açmadan transient packet üretir", async () => {
    const client = new FakeSecureResearchHttpClient([]);
    const result = await acquireResearchSources(r3aAcquisitionRequest(), { httpClient: client, environment: DISABLED_ENV, now: () => new Date("2026-08-08T00:00:00Z") });
    expect(result).toMatchObject({ status: "packet_ready", acquiredSources: [{ acquisitionKind: "direct", wikidataEntityId: "Q123" }] });
    expect(client.requests).toHaveLength(0);
    expect(result.packet).toMatchObject({ retention: "transient_only", sourceCount: 1 });
    expect(result.packet).not.toHaveProperty("claims");
    expect(result.packet).not.toHaveProperty("decision");
  });

  it("same direct/discovered page'i canonical URL'de dedupe eder", async () => {
    const client = new FakeSecureResearchHttpClient([]);
    const result = await acquireResearchSources(r3aAcquisitionRequest({ discoveredSources: [r3aDiscoveredSource()] }), { httpClient: client, environment: LIVE_ENV });
    expect(result).toMatchObject({ status: "packet_ready", packet: { sourceCount: 1 } });
    expect(result.warnings).toContain("direct_discovered_duplicate");
    expect(client.requests).toHaveLength(0);
  });

  it("discovered URL'yi Action API ile exact QID/page/revision olarak yeniden doğrular", async () => {
    const client = new FakeSecureResearchHttpClient([
      fakeHttpJson(pageBody()),
      fakeHttpJson(pageBody({ extract: r3aDirectDocument().document.boundedText })),
    ]);
    const result = await acquireResearchSources(r3aAcquisitionRequest({ directDocuments: [], discoveredSources: [r3aDiscoveredSource()] }), {
      httpClient: client, environment: LIVE_ENV, now: () => new Date("2026-08-08T00:00:00Z"),
    });
    expect(result).toMatchObject({ status: "packet_ready", acquiredSources: [{ acquisitionKind: "discovered", pageId: 42, revisionId: "777" }] });
    expect(client.requests).toHaveLength(2);
    expect(client.requests[0].url).toContain("titles=Steins%3BGate");
    expect(client.requests[1].url).toContain("pageids=42");
    expect(client.requests.map((request) => request.url).join(" ")).not.toMatch(/opensearch|srsearch|list=search|\/wiki\//i);
  });

  it("different-QID related page'i title benzerliğine rağmen reddeder", async () => {
    const client = new FakeSecureResearchHttpClient([fakeHttpJson(pageBody({ qid: "Q999" }))]);
    const result = await acquireResearchSources(r3aAcquisitionRequest({ directDocuments: [], discoveredSources: [r3aDiscoveredSource()] }), { httpClient: client, environment: LIVE_ENV });
    expect(result.status).toBe("source_identity_mismatch");
    expect(result.telemetry.qidMismatchCount).toBe(1);
    expect(client.requests).toHaveLength(1);
  });

  it.each([
    [pageBody({ missing: true }), "wikipedia_page_missing"],
    [pageBody({ disambiguation: true }), "wikipedia_disambiguation_page"],
  ])("missing/disambiguation için fallback link seçmez", async (body, warning) => {
    const client = new FakeSecureResearchHttpClient([fakeHttpJson(body)]);
    const result = await acquireResearchSources(r3aAcquisitionRequest({ directDocuments: [], discoveredSources: [r3aDiscoveredSource()] }), { httpClient: client, environment: LIVE_ENV });
    expect(result.status).toBe("adapter_unavailable");
    expect(result.warnings.join(",")).toContain(warning);
    expect(client.requests).toHaveLength(1);
  });

  it("discovered acquisition feature/User-Agent kapalıysa network açmadan unavailable olur", async () => {
    const client = new FakeSecureResearchHttpClient([]);
    const result = await acquireResearchSources(r3aAcquisitionRequest({ directDocuments: [], discoveredSources: [r3aDiscoveredSource()] }), { httpClient: client, environment: DISABLED_ENV });
    expect(result.status).toBe("adapter_unavailable");
    expect(client.requests).toHaveLength(0);
  });

  it("revision/citation mismatch direct document'i security_rejected yapar", async () => {
    const direct = r3aDirectDocument();
    const result = await acquireResearchSources(r3aAcquisitionRequest({ directDocuments: [{ ...direct, citation: { ...direct.citation, revisionId: "778" } }] }));
    expect(result.status).toBe("security_rejected");
  });
});

describe("D7-R3A exact version-scope isolation", () => {
  it("work scope exact QID chain'i kabul eder", async () => {
    expect((await acquireResearchSources(r3aAcquisitionRequest())).status).toBe("packet_ready");
  });

  it.each(["season", "installment", "edition"] as const)("%s scope work-QID fallback yapmaz", async (kind) => {
    const request = r3aAcquisitionRequest();
    const candidate = request.candidateIdentity;
    const versionScope = kind === "season"
      ? createResearchVersionScope({ identity: candidate, scopeKind: "season", seasonNumber: 2 })
      : kind === "installment"
        ? createResearchVersionScope({ identity: candidate, scopeKind: "installment", installmentKey: "part-2" })
        : { ...request.versionScope, scopeKind: "edition" as const, editionKey: "OL1M", scopeKey: `${request.versionScope.scopeKey}:edition-OL1M`, mediaType: "book" as const };
    const result = await acquireResearchSources({ ...request, versionScope, wikimediaIdentity: request.wikimediaIdentity });
    expect(result.status).toBe("version_scope_unresolved");
  });

  it("exact season scope/QID envelope başka season'a sızmadan çalışabilir", async () => {
    const request = r3aAcquisitionRequest();
    const versionScope = createResearchVersionScope({ identity: request.candidateIdentity, scopeKind: "season", seasonNumber: 1 });
    const result = await acquireResearchSources({ ...request, versionScope, wikimediaIdentity: r3aWikimediaIdentity(versionScope.scopeKey) });
    expect(result.status).toBe("packet_ready");
    if (result.packet) expect(result.packet.versionScope.scopeKey).toBe(versionScope.scopeKey);
  });
});

describe("D7-R3A request coalescing", () => {
  it("same page/revision acquisition'ı in-flight tek kez çalıştırır", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const responses = [fakeHttpJson(pageBody()), fakeHttpJson(pageBody({ extract: r3aDirectDocument().document.boundedText }))];
    class GatedClient implements SecureResearchHttpClient {
      requests: SecureResearchHttpRequest[] = [];
      async request(input: SecureResearchHttpRequest): Promise<SecureResearchHttpResponse> {
        this.requests.push(input);
        if (this.requests.length === 1) await gate;
        return responses[this.requests.length - 1];
      }
    }
    const client = new GatedClient();
    const request = r3aAcquisitionRequest({
      directDocuments: [],
      discoveredSources: [r3aDiscoveredSource({ canonicalUrl: "https://en.wikipedia.org/wiki/Steins%3BGate_(coalescing_fixture)" })],
      requestId: "coalesce",
    });
    const first = acquireResearchSources(request, { httpClient: client, environment: LIVE_ENV });
    const second = acquireResearchSources(request, { httpClient: client, environment: LIVE_ENV });
    await new Promise((resolve) => setTimeout(resolve, 0));
    release?.();
    const results = await Promise.all([first, second]);
    expect(results.every((result) => result.status === "packet_ready")).toBe(true);
    expect(client.requests).toHaveLength(2);
    expect(results.some((result) => result.telemetry.coalescedCount > 0)).toBe(true);
  });
});
