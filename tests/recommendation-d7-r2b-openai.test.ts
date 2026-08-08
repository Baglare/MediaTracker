import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { OpenAiWebSearchDiscoveryAdapter, buildOpenAiDiscoveryInput } from "@/features/recommendations/research/discovery/adapters/openai/adapter";
import {
  OPENAI_RESPONSES_ENDPOINT,
  OpenAiDiscoveryError,
  OpenAiResponsesClient,
} from "@/features/recommendations/research/discovery/adapters/openai/client";
import { decodeOpenAiWebSearchResponse } from "@/features/recommendations/research/discovery/adapters/openai/codec";
import { readOpenAiWebDiscoveryEnvironment } from "@/features/recommendations/research/discovery/adapters/openai/config";
import type { SearchDiscoveryPortRequest } from "@/features/recommendations/research/discovery/port";
import { buildResearchDiscoveryQueries } from "@/features/recommendations/research/discovery/query-builder";
import { steinsGateDiscoveryRequest } from "@/features/recommendations/research/testing/discovery-fixtures";

const request = steinsGateDiscoveryRequest();
const portRequest = (): SearchDiscoveryPortRequest => ({
  queries: buildResearchDiscoveryQueries(request),
  allowedDomains: request.allowedDomains,
  maxSources: request.maxSources,
  requestId: request.requestId,
  candidate: { title: request.titleSnapshot, releaseYear: request.releaseYear, mediaType: request.mediaType, versionScope: request.versionScope },
  aspect: { aspectId: request.aspectId, role: request.role, minimumLevel: request.minimumLevel },
});
const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", ...headers },
});
const completed = (sources: unknown[] = [{ type: "url", url: "https://en.wikipedia.org/wiki/Steins%3BGate" }]) => ({
  status: "completed",
  output: [{ id: "ws_1", type: "web_search_call", status: "completed", action: { type: "search", queries: ["q"], sources } }],
});

describe("D7-R2B OpenAI config/request", () => {
  it("feature/key/model fail-closed; OPENAI_MODEL explicit fallback olabilir", () => {
    expect(readOpenAiWebDiscoveryEnvironment({})).toMatchObject({ valid: false, enabled: false });
    expect(readOpenAiWebDiscoveryEnvironment({ D7_OPENAI_WEB_DISCOVERY_ENABLED: "1", OPENAI_API_KEY: "sk-test", OPENAI_MODEL: "gpt-5.4-mini" })).toMatchObject({ valid: true, model: "gpt-5.4-mini", explicitResearchModel: false });
    expect(readOpenAiWebDiscoveryEnvironment({ D7_OPENAI_WEB_DISCOVERY_ENABLED: "1", OPENAI_API_KEY: "sk-test", OPENAI_RESEARCH_MODEL: "gpt-5.4-mini" })).toMatchObject({ valid: true, model: "gpt-5.4-mini", explicitResearchModel: true });
    expect(readOpenAiWebDiscoveryEnvironment({ D7_OPENAI_WEB_DISCOVERY_ENABLED: "1", OPENAI_API_KEY: "sk-test", OPENAI_RESEARCH_MODEL: "bad model" })).toMatchObject({ valid: false, model: null });
  });

  it("exact /v1/responses, stable web_search, allowlist ve store=false gönderir", async () => {
    const calls: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const client = new OpenAiResponsesClient(async (input, init) => { calls.push({ input, init }); return jsonResponse(completed(), 200, { "x-request-id": "req_test" }); });
    await client.request({ apiKey: "secret-key", model: "gpt-5.4-mini", input: "public", allowedDomains: ["wikipedia.org"], requestId: "local-request" });
    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe(OPENAI_RESPONSES_ENDPOINT);
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-key");
    const body = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ model: "gpt-5.4-mini", store: false, tool_choice: "required", include: ["web_search_call.action.sources"] });
    expect(body.tools).toEqual([{ type: "web_search", filters: { allowed_domains: ["wikipedia.org"] }, search_context_size: "low" }]);
    expect(JSON.stringify(body)).not.toContain("web_search_preview");
  });

  it("empty/invalid allowed_domains ile upstream call açmaz", async () => {
    let count = 0;
    const client = new OpenAiResponsesClient(async () => { count += 1; return jsonResponse(completed()); });
    await expect(client.request({ apiKey: "k", model: "m", input: "i", allowedDomains: [], requestId: "r" })).rejects.toMatchObject({ kind: "invalid_request" });
    await expect(client.request({ apiKey: "k", model: "m", input: "i", allowedDomains: ["https://wikipedia.org"], requestId: "r" })).rejects.toMatchObject({ kind: "invalid_request" });
    expect(count).toBe(0);
  });

  it("discovery instruction yalnız public candidate/aspect taşır", () => {
    const body = buildOpenAiDiscoveryInput(portRequest());
    expect(body).toContain("Steins;Gate");
    expect(body).toContain("romance");
    for (const forbidden of ["ownerId", "userId", "rating", "favorite", "progress", "note", "feedback", "personal library", "conversation"]) expect(body).not.toContain(forbidden);
  });
});

describe("D7-R2B OpenAI response decoder", () => {
  it("search/open_page/find_in_page ve secondary url_citation URL'lerini çıkarır", () => {
    const decoded = decodeOpenAiWebSearchResponse({
      status: "completed",
      output: [
        ...completed().output,
        { id: "ws_2", type: "web_search_call", status: "completed", action: { type: "open_page", url: "https://tr.wikipedia.org/wiki/Test" } },
        { id: "ws_3", type: "web_search_call", status: "completed", action: { type: "find_in_page", url: "https://en.wikipedia.org/wiki/Test", pattern: "x" } },
        { type: "message", content: [{ type: "output_text", text: "ignored", annotations: [{ type: "url_citation", url: "https://en.wikipedia.org/wiki/Citation", title: "ignored" }] }] },
      ],
    });
    expect(decoded).toMatchObject({ valid: true, webSearchCallCount: 3, rawSourceUrlCount: 4 });
    expect(decoded.urls.map((item) => item.url)).toEqual(expect.arrayContaining([
      "https://en.wikipedia.org/wiki/Steins%3BGate", "https://tr.wikipedia.org/wiki/Test", "https://en.wikipedia.org/wiki/Test", "https://en.wikipedia.org/wiki/Citation",
    ]));
  });

  it("malformed tek source'u atlar; unknown output'u warning ile ignore eder", () => {
    const decoded = decodeOpenAiWebSearchResponse({
      status: "completed",
      output: [
        { type: "future_item" },
        { type: "web_search_call", status: "completed", action: { type: "search", sources: [{ type: "url", url: 7 }, { type: "url", url: "https://en.wikipedia.org/wiki/Valid" }] } },
      ],
    });
    expect(decoded.valid).toBe(true);
    expect(decoded.urls).toHaveLength(1);
    expect(decoded.malformedItemCount).toBeGreaterThan(0);
    expect(decoded.warnings).toContain("openai_output_type_ignored");
  });

  it.each([
    [null],
    [{ status: "failed", output: [] }],
    [{ status: "completed", output: [{ type: "message", content: [] }] }],
    [{ status: "completed", output: [{ type: "web_search_call", status: "failed", action: {} }] }],
    [{ status: "completed", error: { code: "x" }, output: [] }],
  ])("bütün response malformed/failed ise invalid döner", (value) => {
    expect(decodeOpenAiWebSearchResponse(value).valid).toBe(false);
  });
});

describe("D7-R2B OpenAI errors and bounds", () => {
  it("429 ve 5xx en fazla bir retry; 400/401 retry yok", async () => {
    for (const status of [429, 503]) {
      let count = 0;
      const client = new OpenAiResponsesClient(async () => { count += 1; return count === 1 ? jsonResponse({}, status, { "retry-after": "9" }) : jsonResponse(completed()); }, async () => undefined);
      await expect(client.request({ apiKey: "k", model: "m", input: "i", allowedDomains: ["wikipedia.org"], requestId: "r" })).resolves.toMatchObject({ retryCount: 1 });
      expect(count).toBe(2);
    }
    for (const status of [400, 401, 403]) {
      let count = 0;
      const client = new OpenAiResponsesClient(async () => { count += 1; return jsonResponse({}, status); });
      await expect(client.request({ apiKey: "k", model: "m", input: "i", allowedDomains: ["wikipedia.org"], requestId: "r" })).rejects.toMatchObject({ kind: "http", status });
      expect(count).toBe(1);
    }
  });

  it("transient network bir kez retry olur", async () => {
    let count = 0;
    const client = new OpenAiResponsesClient(async () => { count += 1; if (count === 1) throw new TypeError("secret network detail"); return jsonResponse(completed()); });
    await expect(client.request({ apiKey: "k", model: "m", input: "i", allowedDomains: ["wikipedia.org"], requestId: "r" })).resolves.toMatchObject({ retryCount: 1 });
  });

  it("malformed JSON, wrong content type ve oversized response controlled error üretir", async () => {
    const malformedAdapter = new OpenAiWebSearchDiscoveryAdapter(
      readOpenAiWebDiscoveryEnvironment({ D7_OPENAI_WEB_DISCOVERY_ENABLED: "1", OPENAI_API_KEY: "k", OPENAI_RESEARCH_MODEL: "m" }),
      new OpenAiResponsesClient(async () => new Response("{", { headers: { "content-type": "application/json" } })),
    );
    await expect(malformedAdapter.discover(portRequest())).resolves.toMatchObject({ status: "response_invalid" });
    const wrongType = new OpenAiResponsesClient(async () => new Response("x", { headers: { "content-type": "text/html" } }));
    await expect(wrongType.request({ apiKey: "k", model: "m", input: "i", allowedDomains: ["wikipedia.org"], requestId: "r" })).rejects.toMatchObject({ kind: "response_invalid" });
    const oversized = new OpenAiResponsesClient(async () => new Response("x".repeat(300_000), { headers: { "content-type": "application/json" } }));
    await expect(oversized.request({ apiKey: "k", model: "m", input: "i", allowedDomains: ["wikipedia.org"], requestId: "r" })).rejects.toMatchObject({ kind: "oversized_response" });
  });

  it("pre-aborted parent signal'i network detail sızdırmadan aborted sınıflandırır", async () => {
    const parent = new AbortController();
    parent.abort();
    const client = new OpenAiResponsesClient(async (_input, init) => { if (init?.signal?.aborted) throw new DOMException("secret", "AbortError"); return jsonResponse(completed()); });
    await expect(client.request({ apiKey: "k", model: "m", input: "i", allowedDomains: ["wikipedia.org"], requestId: "r", signal: parent.signal })).rejects.toBeInstanceOf(OpenAiDiscoveryError);
    await expect(client.request({ apiKey: "k", model: "m", input: "i", allowedDomains: ["wikipedia.org"], requestId: "r", signal: parent.signal })).rejects.toMatchObject({ kind: "aborted" });
  });

  it("bounded 5s timeout fetch'i abort eder", async () => {
    vi.useFakeTimers();
    try {
      const client = new OpenAiResponsesClient(async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      }));
      const pending = client.request({ apiKey: "k", model: "m", input: "i", allowedDomains: ["wikipedia.org"], requestId: "r" });
      const assertion = expect(pending).rejects.toMatchObject({ kind: "timeout" });
      await vi.advanceTimersByTimeAsync(5_001);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
