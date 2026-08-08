import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ResearchDiscoveryOrchestrator } from "@/features/recommendations/research/discovery/orchestrator";
import type { SearchDiscoveryPort, SearchDiscoveryPortRequest, SearchDiscoveryPortResult } from "@/features/recommendations/research/discovery/port";
import {
  getResearchDiscoveryProviderEntry,
  providerCanPerformHardResearch,
  RESEARCH_DISCOVERY_PROVIDER_REGISTRY,
} from "@/features/recommendations/research/discovery/provider-registry";
import {
  readResearchDiscoverySelectionEnvironment,
  selectResearchDiscoveryProviders,
} from "@/features/recommendations/research/discovery/selection";
import { emptyResearchDiscoveryTelemetry, type ResearchDiscoveryProviderId } from "@/features/recommendations/research/discovery/types";
import { steinsGateDiscoveryRequest } from "@/features/recommendations/research/testing/discovery-fixtures";

class FakePort implements SearchDiscoveryPort {
  readonly requests: SearchDiscoveryPortRequest[] = [];
  readonly adapterId;
  constructor(
    readonly providerId: ResearchDiscoveryProviderId,
    private readonly handler: () => SearchDiscoveryPortResult,
  ) {
    this.adapterId = providerId === "openai" ? "openai_web_search"
      : providerId === "groq" ? "groq_compound_web_search" : "openrouter_web_search";
  }
  async discover(input: SearchDiscoveryPortRequest): Promise<SearchDiscoveryPortResult> {
    this.requests.push(input);
    return this.handler();
  }
}

function result(providerId: ResearchDiscoveryProviderId, status: SearchDiscoveryPortResult["status"], urls: string[] = []): SearchDiscoveryPortResult {
  return {
    providerId,
    status,
    rawUrlSignals: urls.map((url, rank) => ({ url, rank })),
    telemetry: { ...emptyResearchDiscoveryTelemetry(), providerId, requestCount: 1, rawSourceUrlCount: urls.length },
    warnings: [],
  };
}

describe("D7-R2C provider registry", () => {
  it("capability ve persistence kararlarını code-controlled registry'den verir", () => {
    expect(Object.keys(RESEARCH_DISCOVERY_PROVIDER_REGISTRY)).toEqual(["openai", "groq", "openrouter"]);
    expect(RESEARCH_DISCOVERY_PROVIDER_REGISTRY.openai).toMatchObject({ enabledByDefault: false, supportsHardDomainAllowlist: true, responseContractStatus: "stable", underlyingSearchVendor: "openai" });
    expect(RESEARCH_DISCOVERY_PROVIDER_REGISTRY.groq).toMatchObject({ enabledByDefault: false, supportsHardDomainAllowlist: true, underlyingSearchVendor: "tavily" });
    expect(RESEARCH_DISCOVERY_PROVIDER_REGISTRY.openrouter).toMatchObject({ enabledByDefault: false, supportsHardDomainAllowlist: true, responseContractStatus: "beta", underlyingSearchVendor: "exa" });
    expect(getResearchDiscoveryProviderEntry("unknown")).toBeNull();
    expect(providerCanPerformHardResearch("openrouter", "must")).toBe(true);
    expect(Object.values(RESEARCH_DISCOVERY_PROVIDER_REGISTRY).every((entry) => entry.persistencePolicy === "ephemeral_only")).toBe(true);
  });
});

describe("D7-R2C provider selection", () => {
  it("invalid/unset selector fail-closed disabled olur", () => {
    expect(readResearchDiscoverySelectionEnvironment({}).mode).toBe("disabled");
    expect(readResearchDiscoverySelectionEnvironment({ D7_RESEARCH_DISCOVERY_PROVIDER: "surprise" })).toMatchObject({ mode: "disabled", warnings: ["research_discovery_provider_invalid"] });
  });

  it("explicit provider yalnız kendisini seçer; flag/key/model eksikliği config'te görünür", () => {
    const environment = readResearchDiscoverySelectionEnvironment({ D7_RESEARCH_DISCOVERY_PROVIDER: "groq" });
    expect(selectResearchDiscoveryProviders(environment, "must")).toEqual(["groq"]);
    expect(environment.providers.groq.valid).toBe(false);
  });

  it("auto yalnız explicit enabled+configured provider'ları deterministic seçer ve AI_PROVIDER eşleşmesini öne alır", () => {
    const environment = readResearchDiscoverySelectionEnvironment({
      D7_RESEARCH_DISCOVERY_PROVIDER: "auto",
      AI_PROVIDER: "groq",
      D7_OPENAI_WEB_DISCOVERY_ENABLED: "1", OPENAI_API_KEY: "o", OPENAI_RESEARCH_MODEL: "gpt-5.4-mini",
      D7_GROQ_WEB_DISCOVERY_ENABLED: "1", GROQ_API_KEY: "g", GROQ_RESEARCH_MODEL: "groq/compound-mini",
    });
    expect(selectResearchDiscoveryProviders(environment, "must")).toEqual(["groq", "openai"]);
  });

  it("adapter_unavailable auto fallback yapar; no_source provider storm üretmez", async () => {
    const environment = readResearchDiscoverySelectionEnvironment({
      D7_RESEARCH_DISCOVERY_PROVIDER: "auto",
      D7_OPENAI_WEB_DISCOVERY_ENABLED: "1", OPENAI_API_KEY: "o", OPENAI_RESEARCH_MODEL: "gpt-5.4-mini",
      D7_GROQ_WEB_DISCOVERY_ENABLED: "1", GROQ_API_KEY: "g", GROQ_RESEARCH_MODEL: "groq/compound-mini",
    });
    const openai = new FakePort("openai", () => result("openai", "unavailable"));
    const groq = new FakePort("groq", () => result("groq", "completed", ["https://en.wikipedia.org/wiki/Steins%3BGate"]));
    const fallback = await new ResearchDiscoveryOrchestrator({ ports: { openai, groq }, readSelectionEnvironment: () => environment }).discover(steinsGateDiscoveryRequest());
    expect(fallback).toMatchObject({ status: "sources_discovered", provider: "groq", attemptedProviders: ["openai", "groq"] });

    const noSourceOpenAi = new FakePort("openai", () => result("openai", "completed"));
    const unusedGroq = new FakePort("groq", () => result("groq", "completed"));
    const stopped = await new ResearchDiscoveryOrchestrator({ ports: { openai: noSourceOpenAi, groq: unusedGroq }, readSelectionEnvironment: () => environment }).discover(steinsGateDiscoveryRequest());
    expect(stopped).toMatchObject({ status: "no_source_discovered", attemptedProviders: ["openai"] });
    expect(unusedGroq.requests).toHaveLength(0);
  });

  it("explicit provider unavailable iken başka ücretli provider'a sessiz düşmez", async () => {
    const environment = readResearchDiscoverySelectionEnvironment({
      D7_RESEARCH_DISCOVERY_PROVIDER: "openai",
      D7_OPENAI_WEB_DISCOVERY_ENABLED: "1", OPENAI_API_KEY: "o", OPENAI_RESEARCH_MODEL: "gpt-5.4-mini",
      D7_GROQ_WEB_DISCOVERY_ENABLED: "1", GROQ_API_KEY: "g", GROQ_RESEARCH_MODEL: "groq/compound-mini",
    });
    const openai = new FakePort("openai", () => result("openai", "unavailable"));
    const groq = new FakePort("groq", () => result("groq", "completed"));
    const value = await new ResearchDiscoveryOrchestrator({ ports: { openai, groq }, readSelectionEnvironment: () => environment }).discover(steinsGateDiscoveryRequest());
    expect(value).toMatchObject({ status: "adapter_unavailable", attemptedProviders: ["openai"] });
    expect(groq.requests).toHaveLength(0);
  });

  it("üç provider'ın URL sinyali aynı ortak canonical/source-registry sonucuna gider", async () => {
    const envByProvider = {
      openai: readResearchDiscoverySelectionEnvironment({ D7_RESEARCH_DISCOVERY_PROVIDER: "openai", D7_OPENAI_WEB_DISCOVERY_ENABLED: "1", OPENAI_API_KEY: "o", OPENAI_RESEARCH_MODEL: "gpt-5.4-mini" }),
      groq: readResearchDiscoverySelectionEnvironment({ D7_RESEARCH_DISCOVERY_PROVIDER: "groq", D7_GROQ_WEB_DISCOVERY_ENABLED: "1", GROQ_API_KEY: "g", GROQ_RESEARCH_MODEL: "groq/compound-mini" }),
      openrouter: readResearchDiscoverySelectionEnvironment({ D7_RESEARCH_DISCOVERY_PROVIDER: "openrouter", D7_OPENROUTER_WEB_DISCOVERY_ENABLED: "1", OPENROUTER_API_KEY: "r", OPENROUTER_RESEARCH_MODEL: "openai/o4-mini" }),
    } as const;
    for (const providerId of ["openai", "groq", "openrouter"] as const) {
      const port = new FakePort(providerId, () => result(providerId, "completed", ["https://en.wikipedia.org/wiki/Steins%3BGate#Plot"]));
      const discovered = await new ResearchDiscoveryOrchestrator({ ports: { [providerId]: port }, readSelectionEnvironment: () => envByProvider[providerId] }).discover(steinsGateDiscoveryRequest());
      expect(discovered.sources[0]).toMatchObject({ canonicalUrl: "https://en.wikipedia.org/wiki/Steins%3BGate", sourceId: "wikipedia" });
      expect(discovered).not.toHaveProperty("claims");
      expect(discovered).not.toHaveProperty("ranking");
    }
  });
});
