import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GroqWebSearchDiscoveryAdapter } from "@/features/recommendations/research/discovery/adapters/groq/adapter";
import { GROQ_CHAT_COMPLETIONS_ENDPOINT, GROQ_COMPOUND_DISCOVERY_TIMEOUT_MS, GroqCompoundDiscoveryClient } from "@/features/recommendations/research/discovery/adapters/groq/client";
import { decodeGroqWebSearchResponse } from "@/features/recommendations/research/discovery/adapters/groq/codec";
import { readGroqWebDiscoveryEnvironment } from "@/features/recommendations/research/discovery/adapters/groq/config";
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
  choices: [{ message: { content: "ignored synthesized answer", executed_tools: [{ search_results: { results: urls.map((url) => ({ title: "ignored", url, content: "ignored", score: 0.9 })) } }] } }],
});
const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("D7-R2C Groq contract", () => {
  it("yalnız exact Compound model allowlist'ini kabul eder", () => {
    expect(readGroqWebDiscoveryEnvironment({ D7_GROQ_WEB_DISCOVERY_ENABLED: "1", GROQ_API_KEY: "k", GROQ_RESEARCH_MODEL: "groq/compound-mini" })).toMatchObject({ valid: true });
    expect(readGroqWebDiscoveryEnvironment({ D7_GROQ_WEB_DISCOVERY_ENABLED: "1", GROQ_API_KEY: "k", GROQ_RESEARCH_MODEL: "llama-3.3-70b-versatile" })).toMatchObject({ valid: false, model: null });
  });

  it("exact endpoint, include_domains ve yalnız web_search tool'u gönderir", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const client = new GroqCompoundDiscoveryClient(async (input, init) => { calls.push({ input, init }); return jsonResponse(responseBody()); });
    await client.request({ apiKey: "secret", model: "groq/compound-mini", instruction: "public", allowedDomains: ["wikipedia.org"] });
    expect(calls[0].input).toBe(GROQ_CHAT_COMPLETIONS_ENDPOINT);
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body).toMatchObject({ model: "groq/compound-mini", search_settings: { include_domains: ["wikipedia.org", "*.wikipedia.org"] }, compound_custom: { tools: { enabled_tools: ["web_search"] } } });
    expect(JSON.stringify(body)).not.toContain("visit_website");
    expect(JSON.stringify(body)).not.toContain("code_interpreter");
  });

  it("empty domains unrestricted request açmaz", async () => {
    let count = 0;
    const client = new GroqCompoundDiscoveryClient(async () => { count += 1; return jsonResponse(responseBody()); });
    await expect(client.request({ apiKey: "k", model: "groq/compound", instruction: "public", allowedDomains: [] })).rejects.toThrow(/no_allowed_domains/);
    expect(count).toBe(0);
  });

  it("Compound latency için global 8s tavanın altında bounded timeout uygular", () => {
    expect(GROQ_COMPOUND_DISCOVERY_TIMEOUT_MS).toBe(7_500);
    expect(GROQ_COMPOUND_DISCOVERY_TIMEOUT_MS).toBeLessThan(8_000);
  });

  it("search result URL'lerini decode eder; assistant content/snippet'i tüketmez", () => {
    const decoded = decodeGroqWebSearchResponse(responseBody(["https://en.wikipedia.org/wiki/One", "https://tr.wikipedia.org/wiki/Two"]));
    expect(decoded).toMatchObject({ valid: true, webSearchCallCount: 1 });
    expect(decoded.urls.map((item) => item.url)).toHaveLength(2);
    expect(JSON.stringify(decoded)).not.toContain("synthesized answer");
    expect(JSON.stringify(decoded)).not.toContain("ignored");
  });

  it("malformed item recovery ve privacy snapshot uygular", async () => {
    const decoded = decodeGroqWebSearchResponse({ choices: [{ message: { executed_tools: [{ search_results: { results: [{ url: 7 }, { url: "https://en.wikipedia.org/wiki/Valid" }] } }] } }] });
    expect(decoded).toMatchObject({ valid: true, malformedItemCount: 1 });
    let sent = "";
    const adapter = new GroqWebSearchDiscoveryAdapter(
      readGroqWebDiscoveryEnvironment({ D7_GROQ_WEB_DISCOVERY_ENABLED: "1", GROQ_API_KEY: "k", GROQ_RESEARCH_MODEL: "groq/compound-mini" }),
      new GroqCompoundDiscoveryClient(async (_input, init) => { sent = String(init?.body); return jsonResponse(responseBody()); }),
    );
    await adapter.discover(portRequest());
    expect(sent).toContain("Steins;Gate");
    for (const forbidden of ["ownerId", "userId", "rating", "favorite", "progress", "note", "feedback", "conversation"]) expect(sent).not.toContain(forbidden);
  });

  it("429/5xx bir retry, permanent 4xx retry yok ve oversized fail-soft", async () => {
    for (const status of [429, 503]) {
      let count = 0;
      const client = new GroqCompoundDiscoveryClient(async () => { count += 1; return count === 1 ? jsonResponse({}, status) : jsonResponse(responseBody()); }, async () => undefined);
      await expect(client.request({ apiKey: "k", model: "groq/compound", instruction: "public", allowedDomains: ["wikipedia.org"] })).resolves.toMatchObject({ retryCount: 1 });
      expect(count).toBe(2);
    }
    let permanentCount = 0;
    const permanent = new GroqCompoundDiscoveryClient(async () => { permanentCount += 1; return jsonResponse({}, 401); });
    await expect(permanent.request({ apiKey: "k", model: "groq/compound", instruction: "public", allowedDomains: ["wikipedia.org"] })).rejects.toMatchObject({ status: 401 });
    expect(permanentCount).toBe(1);
    const oversized = new GroqCompoundDiscoveryClient(async () => new Response("x".repeat(300_000), { headers: { "content-type": "application/json" } }));
    await expect(oversized.request({ apiKey: "k", model: "groq/compound", instruction: "public", allowedDomains: ["wikipedia.org"] })).rejects.toMatchObject({ kind: "oversized_response" });
  });
});
