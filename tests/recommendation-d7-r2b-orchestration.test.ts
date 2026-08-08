import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ResearchDiscoveryOrchestrator } from "@/features/recommendations/research/discovery/orchestrator";
import type { SearchDiscoveryPort, SearchDiscoveryPortRequest, SearchDiscoveryPortResult } from "@/features/recommendations/research/discovery/port";
import { emptyResearchDiscoveryTelemetry } from "@/features/recommendations/research/discovery/types";
import { validateResearchEvidenceCacheEntry } from "@/features/recommendations/research/cache/policy";
import { steinsGateDiscoveryRequest } from "@/features/recommendations/research/testing/discovery-fixtures";
import { cacheEntry } from "./fixtures/recommendations-v2/grounded-research";

const enabled = () => ({ enabled: true, liveSmokeEnabled: false, apiKey: "test", model: "model", explicitResearchModel: true, valid: true, warnings: [] as string[] });

class FakeDiscoveryPort implements SearchDiscoveryPort {
  readonly providerId = "openai" as const;
  readonly adapterId = "openai_web_search" as const;
  readonly requests: SearchDiscoveryPortRequest[] = [];
  constructor(private readonly handler: (input: SearchDiscoveryPortRequest) => Promise<SearchDiscoveryPortResult>) {}
  async discover(input: SearchDiscoveryPortRequest): Promise<SearchDiscoveryPortResult> { this.requests.push(input); return this.handler(input); }
}

function completed(urls: string[]): SearchDiscoveryPortResult {
  return {
    providerId: "openai",
    status: "completed",
    rawUrlSignals: urls.map((url, rank) => ({ url, rank })),
    telemetry: { ...emptyResearchDiscoveryTelemetry(), requestCount: 1, webSearchCallCount: 1, rawSourceUrlCount: urls.length },
    warnings: [],
  };
}

describe("D7-R2B discovery orchestration", () => {
  it("feature disabled iken network çağrısı yapmaz", async () => {
    const port = new FakeDiscoveryPort(async () => completed([]));
    const orchestrator = new ResearchDiscoveryOrchestrator({ port, readEnvironment: () => ({ enabled: false, liveSmokeEnabled: false, apiKey: null, model: null, explicitResearchModel: false, valid: false, warnings: ["disabled"] }) });
    await expect(orchestrator.discover(steinsGateDiscoveryRequest())).resolves.toMatchObject({ status: "disabled" });
    expect(port.requests).toHaveLength(0);
  });

  it("request domain/source server policy'den saparsa unrestricted search açmaz", async () => {
    const port = new FakeDiscoveryPort(async () => completed([]));
    const orchestrator = new ResearchDiscoveryOrchestrator({ port, readEnvironment: enabled });
    await expect(orchestrator.discover(steinsGateDiscoveryRequest({ allowedDomains: ["example.com"] }))).resolves.toMatchObject({ status: "source_policy_blocked" });
    await expect(orchestrator.discover(steinsGateDiscoveryRequest({ allowedSourceIds: ["editorial"] }))).resolves.toMatchObject({ status: "source_policy_blocked" });
    expect(port.requests).toHaveLength(0);
  });

  it("accepted URL'leri revalidate/dedupe/cap eder; out-of-domain ve HTTP düşer", async () => {
    const port = new FakeDiscoveryPort(async () => completed([
      "https://en.wikipedia.org/wiki/Steins%3BGate#Plot",
      "https://en.wikipedia.org/wiki/Steins%3BGate",
      "https://evil.example/wiki/Test",
      "http://tr.wikipedia.org/wiki/Test",
      "https://tr.wikipedia.org/wiki/Steins_Gate",
    ]));
    const result = await new ResearchDiscoveryOrchestrator({ port, readEnvironment: enabled, now: () => Date.parse("2026-08-08T00:00:00.000Z") })
      .discover(steinsGateDiscoveryRequest({ maxSources: 2 }));
    expect(result).toMatchObject({ status: "sources_discovered", telemetry: { acceptedSourceCount: 2, rejectedSourceCount: 2, rejectedDomainCount: 1 } });
    expect(result.sources).toHaveLength(2);
    expect(result.sources[0]).toMatchObject({ sourceId: "wikipedia", discoveryAdapter: "openai_web_search", discoveryRank: 0, discoveredAt: "2026-08-08T00:00:00.000Z" });
    expect(result.sources[0]).not.toHaveProperty("snippet");
    expect(result.sources[0]).not.toHaveProperty("citationId");
    expect(result.sources[0].queryFingerprint).toMatch(/^sha256:/);
    expect(port.requests).toHaveLength(1);
    expect(port.requests[0].queries.length).toBeLessThanOrEqual(2);
  });

  it("no accepted source absent claim üretmeden no_source_discovered olur", async () => {
    const port = new FakeDiscoveryPort(async () => completed(["https://example.com/nope"]));
    const result = await new ResearchDiscoveryOrchestrator({ port, readEnvironment: enabled }).discover(steinsGateDiscoveryRequest());
    expect(result).toMatchObject({ status: "no_source_discovered", sources: [] });
    expect(result).not.toHaveProperty("claims");
    expect(result).not.toHaveProperty("decision");
  });

  it("adapter timeout/unavailable durumlarını ayırır", async () => {
    for (const [portStatus, expected] of [["budget_exhausted", "budget_exhausted"], ["unavailable", "adapter_unavailable"], ["response_invalid", "adapter_unavailable"]] as const) {
      const port = new FakeDiscoveryPort(async () => ({ providerId: "openai", status: portStatus, rawUrlSignals: [], telemetry: emptyResearchDiscoveryTelemetry(), warnings: [portStatus] }));
      await expect(new ResearchDiscoveryOrchestrator({ port, readEnvironment: enabled }).discover(steinsGateDiscoveryRequest())).resolves.toMatchObject({ status: expected });
    }
  });

  it("aynı candidate/aspect/policy in-flight request'i coalesce eder", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const port = new FakeDiscoveryPort(async () => { await gate; return completed(["https://en.wikipedia.org/wiki/Steins%3BGate"]); });
    const orchestrator = new ResearchDiscoveryOrchestrator({ port, readEnvironment: enabled });
    const first = orchestrator.discover(steinsGateDiscoveryRequest({ requestId: "first" }));
    const second = orchestrator.discover(steinsGateDiscoveryRequest({ requestId: "second" }));
    release?.();
    const [, coalesced] = await Promise.all([first, second]);
    expect(port.requests).toHaveLength(1);
    expect(coalesced.telemetry.coalescedCount).toBe(1);
  });

  it("global discovery concurrency iki ile sınırlıdır", async () => {
    let active = 0;
    let maximum = 0;
    const releases: Array<() => void> = [];
    const port = new FakeDiscoveryPort(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return completed([]);
    });
    const orchestrator = new ResearchDiscoveryOrchestrator({ port, readEnvironment: enabled });
    const calls = ["romance", "political_intrigue", "character_driven"].map((aspectId, index) => orchestrator.discover(steinsGateDiscoveryRequest({ aspectId: aspectId as never, requestId: `request-${index}` })));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(maximum).toBe(2);
    releases.splice(0).forEach((release) => release());
    await new Promise((resolve) => setTimeout(resolve, 0));
    releases.splice(0).forEach((release) => release());
    await Promise.all(calls);
    expect(maximum).toBe(2);
  });

  it("raw OpenAI/search payload'u evidence cache policy'sinde kalıcı değildir", () => {
    const invalid = validateResearchEvidenceCacheEntry({ ...cacheEntry(), openaiResponse: { output_text: "not evidence" }, snippet: "not evidence", query: "not persistent" } as never);
    expect(invalid).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "research_cache_transient_payload_forbidden" })]) });
  });

  it.each(["groqResponse", "openrouterResponse", "tavilyMetadata", "exaMetadata", "providerSynthesizedAnswer", "highlight", "responseId"])("%s persistent evidence cache'e giremez", (field) => {
    const invalid = validateResearchEvidenceCacheEntry({ ...cacheEntry(), [field]: { text: "not evidence" } } as never);
    expect(invalid).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "research_cache_transient_payload_forbidden" })]) });
  });
});
