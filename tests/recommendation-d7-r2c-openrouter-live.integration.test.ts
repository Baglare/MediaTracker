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
    expect(["sources_discovered", "no_source_discovered"]).toContain(result.status);
    expect(result.attemptedProviders).toContain("openrouter");
    for (const source of result.sources) {
      expect(source.canonicalUrl.startsWith("https://")).toBe(true);
      expect(source.hostname === "wikipedia.org" || source.hostname.endsWith(".wikipedia.org")).toBe(true);
      expect(source.sourceId).toBe("wikipedia");
    }
    expect(result).not.toHaveProperty("claims");
  });
});
