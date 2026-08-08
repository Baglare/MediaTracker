import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readOpenRouterWebDiscoveryEnvironment } from "@/features/recommendations/research/discovery/adapters/openrouter/config";
import { discoverResearchSources } from "@/features/recommendations/research/discovery/orchestrator";
import { steinsGateDiscoveryRequest } from "@/features/recommendations/research/testing/discovery-fixtures";

const environment = readOpenRouterWebDiscoveryEnvironment();
const selection = process.env.D7_RESEARCH_DISCOVERY_PROVIDER;
const liveEnabled = environment.valid && environment.liveSmokeEnabled && (selection === "openrouter" || selection === "auto");

describe.skipIf(!liveEnabled)("D7-R2C conditional OpenRouter web discovery live", () => {
  it("forced Exa hard allowlist ile yalnız Wikipedia URL keşfeder", async () => {
    const result = await discoverResearchSources(steinsGateDiscoveryRequest({ requestId: `d7-r2c-openrouter-live-${Date.now()}` }));
    expect(result.status).toBe("sources_discovered");
    expect(result.attemptedProviders).toContain("openrouter");
    expect(result.telemetry.webSearchCallCount).toBeGreaterThan(0);
    expect(result.sources.length).toBeGreaterThan(0);
    for (const source of result.sources) {
      const sourceUrl = new URL(source.canonicalUrl);
      expect(source.canonicalUrl.startsWith("https://")).toBe(true);
      expect(sourceUrl.username).toBe("");
      expect(sourceUrl.password).toBe("");
      expect(source.hostname === "wikipedia.org" || source.hostname.endsWith(".wikipedia.org")).toBe(true);
      expect(source.sourceId).toBe("wikipedia");
    }
    expect(result).not.toHaveProperty("claims");
    expect(result).not.toHaveProperty("decision");
  }, 15_000);
});
