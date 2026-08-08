import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { OpenRouterWebSearchDiscoveryAdapter } from "@/features/recommendations/research/discovery/adapters/openrouter/adapter";
import { OPENROUTER_RESPONSES_ENDPOINT, OpenRouterWebSearchDiscoveryClient } from "@/features/recommendations/research/discovery/adapters/openrouter/client";
import { decodeOpenRouterWebSearchResponse } from "@/features/recommendations/research/discovery/adapters/openrouter/codec";
import { readOpenRouterWebDiscoveryEnvironment } from "@/features/recommendations/research/discovery/adapters/openrouter/config";
import type { SearchDiscoveryPortRequest } from "@/features/recommendations/research/discovery/port";
import { buildResearchDiscoveryQueries } from "@/features/recommendations/research/discovery/query-builder";
import { steinsGateDiscoveryRequest } from "@/features/recommendations/research/testing/discovery-fixtures";

const request = steinsGateDiscoveryRequest();
const portRequest = (): SearchDiscoveryPortRequest => ({
  queries: buildResearchDiscoveryQueries(request), allowedDomains: request.allowedDomains, maxSources: request.maxSources,
  requestId: request.requestId,
  candidate: { title: request.titleSnapshot, releaseYear: request.releaseYear, mediaType: request.mediaType, versionScope: request.versionScope },
  aspect: { aspectId: request.aspectId, role: request.role, minimumLevel: request.minimumLevel },
});
const responseBody = (urls = ["https://en.wikipedia.org/wiki/Steins%3BGate"]) => ({
  status: "completed",
  output: [{ type: "message", content: [{ type: "output_text", text: "ignored synthesized answer", annotations: urls.map((url) => ({ type: "url_citation", url, content: "ignored highlight" })) }] }],
  usage: { server_tool_use: { web_search_requests: 1 } },
});
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("D7-R2C OpenRouter contract", () => {
  it("beta adapter yalnız code-controlled model allowlist'i ile açılır", () => {
    expect(readOpenRouterWebDiscoveryEnvironment({ D7_OPENROUTER_WEB_DISCOVERY_ENABLED: "1", OPENROUTER_API_KEY: "k", OPENROUTER_RESEARCH_MODEL: "openai/o4-mini" })).toMatchObject({ valid: true });
    expect(readOpenRouterWebDiscoveryEnvironment({ D7_OPENROUTER_WEB_DISCOVERY_ENABLED: "1", OPENROUTER_API_KEY: "k", OPENROUTER_RESEARCH_MODEL: "openrouter/auto" })).toMatchObject({ valid: false, model: null });
  });

  it("Responses beta server tool'u, forced Exa ve hard allowed_domains kullanır", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const client = new OpenRouterWebSearchDiscoveryClient(async (input, init) => { calls.push({ input, init }); return jsonResponse(responseBody()); });
    await client.request({ apiKey: "secret", model: "openai/o4-mini", instruction: "public", allowedDomains: ["wikipedia.org"], maxSources: 5 });
    expect(calls[0].input).toBe(OPENROUTER_RESPONSES_ENDPOINT);
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body).toMatchObject({ model: "openai/o4-mini", store: false });
    expect(body.tools).toEqual([{ type: "openrouter:web_search", parameters: { engine: "exa", max_results: 5, max_total_results: 5, max_uses: 1, search_context_size: "low", allowed_domains: ["wikipedia.org"] } }]);
    const wire = JSON.stringify(body);
    expect(wire).not.toContain('"plugins"');
    expect(wire).not.toContain(":online");
    expect(wire).not.toContain('"engine":"auto"');
    expect(wire).not.toContain('"engine":"native"');
  });

  it("empty domains postfilter-only/unrestricted request açmaz", async () => {
    let count = 0;
    const client = new OpenRouterWebSearchDiscoveryClient(async () => { count += 1; return jsonResponse(responseBody()); });
    await expect(client.request({ apiKey: "k", model: "openai/o4-mini", instruction: "public", allowedDomains: [], maxSources: 5 })).rejects.toThrow(/no_allowed_domains/);
    expect(count).toBe(0);
  });

  it("yalnız URL citations decode eder; output text/highlight evidence değildir", () => {
    const decoded = decodeOpenRouterWebSearchResponse(responseBody(["https://en.wikipedia.org/wiki/One", "https://tr.wikipedia.org/wiki/Two"]));
    expect(decoded).toMatchObject({ valid: true, webSearchCallCount: 1 });
    expect(decoded.urls).toHaveLength(2);
    expect(JSON.stringify(decoded)).not.toContain("synthesized answer");
    expect(JSON.stringify(decoded)).not.toContain("highlight");
  });

  it("malformed annotation recovery ve privacy snapshot uygular", async () => {
    const decoded = decodeOpenRouterWebSearchResponse({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", annotations: [{ type: "url_citation", url: 4 }, { type: "url_citation", url: "https://en.wikipedia.org/wiki/Valid" }] }] }],
      usage: { server_tool_use: { web_search_requests: 1 } },
    });
    expect(decoded).toMatchObject({ valid: true, malformedItemCount: 1 });
    let sent = "";
    const adapter = new OpenRouterWebSearchDiscoveryAdapter(
      readOpenRouterWebDiscoveryEnvironment({ D7_OPENROUTER_WEB_DISCOVERY_ENABLED: "1", OPENROUTER_API_KEY: "k", OPENROUTER_RESEARCH_MODEL: "openai/o4-mini" }),
      new OpenRouterWebSearchDiscoveryClient(async (_input, init) => { sent = String(init?.body); return jsonResponse(responseBody()); }),
    );
    await adapter.discover(portRequest());
    expect(sent).toContain("Steins;Gate");
    for (const forbidden of ["ownerId", "userId", "rating", "favorite", "progress", "note", "feedback", "conversation"]) expect(sent).not.toContain(forbidden);
  });

  it("search call yoksa source uydurmaz", () => {
    expect(decodeOpenRouterWebSearchResponse({ status: "completed", output: [], usage: { server_tool_use: { web_search_requests: 0 } } })).toMatchObject({ valid: false, urls: [] });
  });
});
