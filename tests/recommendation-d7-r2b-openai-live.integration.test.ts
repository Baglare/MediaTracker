import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { discoverResearchSources } from "@/features/recommendations/research/discovery/orchestrator";
import { readOpenAiWebDiscoveryEnvironment } from "@/features/recommendations/research/discovery/adapters/openai/config";
import { steinsGateDiscoveryRequest } from "@/features/recommendations/research/testing/discovery-fixtures";

const environment = readOpenAiWebDiscoveryEnvironment();
const selection = process.env.D7_RESEARCH_DISCOVERY_PROVIDER;
const liveEnabled = environment.valid && environment.liveSmokeEnabled && environment.explicitResearchModel
  && (selection === "openai" || selection === "auto");

describe.skipIf(!liveEnabled)("D7-R2B conditional OpenAI web discovery live", () => {
  it("Steins;Gate romance için yalnız allowlisted Wikipedia source URL keşfeder", async () => {
    const result = await discoverResearchSources(steinsGateDiscoveryRequest({ requestId: `d7-r2b-live-${Date.now()}` }));
    expect(result.status).toBe("sources_discovered");
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
