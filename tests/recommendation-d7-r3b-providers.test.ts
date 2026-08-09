import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { buildGroundedEvidenceUnits } from "@/features/recommendations/research/extraction/domain/evidence-units";
import { buildMinimizedGroundedModelInput } from "@/features/recommendations/research/extraction/prompt/input-builder";
import { GroqGroundedExtractionAdapter } from "@/features/recommendations/research/extraction/providers/groq/adapter";
import { GroqGroundedExtractionClient } from "@/features/recommendations/research/extraction/providers/groq/client";
import { OpenAiGroundedExtractionClient } from "@/features/recommendations/research/extraction/providers/openai/client";
import { OpenRouterGroundedExtractionClient } from "@/features/recommendations/research/extraction/providers/openrouter/client";
import { GROUNDED_EXTRACTION_PROVIDER_REGISTRY, getGroundedExtractionProviderEntry } from "@/features/recommendations/research/extraction/providers/registry";
import { FixedExtractionJsonClient } from "@/features/recommendations/research/extraction/providers/shared/fixed-json-client";
import { readGroundedExtractionSelectionEnvironment, selectGroundedExtractionProviders } from "@/features/recommendations/research/extraction/providers/selection";
import { createGroundedExtractionRequest } from "@/features/recommendations/research/testing/extraction-fixtures";

async function modelInput() {
  const request = await createGroundedExtractionRequest();
  const units = await buildGroundedEvidenceUnits({ packet: request.packet, maxUnits: request.maxEvidenceUnits });
  return buildMinimizedGroundedModelInput({ request, units: units.eligibleUnits });
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

describe("D7-R3B provider registry and selection", () => {
  it("provider capabilities are explicit and disabled by default", () => {
    expect(Object.values(GROUNDED_EXTRACTION_PROVIDER_REGISTRY).every((entry) => !entry.enabledByDefault && entry.supportsStrictJsonSchema && entry.supportsNoTools && entry.persistencePolicy === "response_ephemeral_only")).toBe(true);
    expect(GROUNDED_EXTRACTION_PROVIDER_REGISTRY.groq.allowedModels).toEqual(["openai/gpt-oss-20b", "openai/gpt-oss-120b"]);
    expect(GROUNDED_EXTRACTION_PROVIDER_REGISTRY.openrouter.responseContractStatus).toBe("partial");
    expect(getGroundedExtractionProviderEntry("unknown")).toBeNull();
  });

  it("explicit provider never silently falls back", () => {
    const environment = readGroundedExtractionSelectionEnvironment({ D7_RESEARCH_EXTRACTION_PROVIDER: "groq", D7_OPENAI_GROUNDED_EXTRACTION_ENABLED: "1", OPENAI_API_KEY: "secret", OPENAI_RESEARCH_EXTRACTION_MODEL: "gpt-5.4-mini" });
    expect(selectGroundedExtractionProviders(environment)).toEqual(["groq"]);
    expect(environment.providers.groq.valid).toBe(false);
  });

  it("auto selects at most one enabled provider in deterministic order", () => {
    const environment = readGroundedExtractionSelectionEnvironment({ D7_RESEARCH_EXTRACTION_PROVIDER: "auto", D7_GROQ_GROUNDED_EXTRACTION_ENABLED: "1", GROQ_API_KEY: "g", GROQ_RESEARCH_EXTRACTION_MODEL: "openai/gpt-oss-20b", D7_OPENAI_GROUNDED_EXTRACTION_ENABLED: "1", OPENAI_API_KEY: "o", OPENAI_RESEARCH_EXTRACTION_MODEL: "gpt-5.4-mini" });
    expect(selectGroundedExtractionProviders(environment)).toEqual(["groq"]);
  });

  it.each([
    [{ D7_RESEARCH_EXTRACTION_PROVIDER: "groq", D7_GROQ_GROUNDED_EXTRACTION_ENABLED: "1", GROQ_RESEARCH_EXTRACTION_MODEL: "openai/gpt-oss-20b" }, "groq_grounded_extraction_key_missing"],
    [{ D7_RESEARCH_EXTRACTION_PROVIDER: "groq", D7_GROQ_GROUNDED_EXTRACTION_ENABLED: "1", GROQ_API_KEY: "g" }, "groq_grounded_extraction_model_missing"],
    [{ D7_RESEARCH_EXTRACTION_PROVIDER: "groq", D7_GROQ_GROUNDED_EXTRACTION_ENABLED: "1", GROQ_API_KEY: "g", GROQ_RESEARCH_EXTRACTION_MODEL: "groq/compound-mini" }, "groq_grounded_extraction_model_unsupported"],
  ])("missing/unsupported config stays invalid", (env, warning) => {
    expect(readGroundedExtractionSelectionEnvironment(env).providers.groq).toMatchObject({ valid: false, warnings: expect.arrayContaining([warning]) });
  });
});

describe("D7-R3B provider request privacy and structured-output contracts", () => {
  it.each([
    ["groq", "https://api.groq.com/openai/v1/chat/completions", (fetchPort: typeof fetch) => new GroqGroundedExtractionClient(fetchPort), "openai/gpt-oss-20b"],
    ["openai", "https://api.openai.com/v1/responses", (fetchPort: typeof fetch) => new OpenAiGroundedExtractionClient(fetchPort), "gpt-5.4-mini"],
    ["openrouter", "https://openrouter.ai/api/v1/chat/completions", (fetchPort: typeof fetch) => new OpenRouterGroundedExtractionClient(fetchPort), "openai/gpt-5.4-mini"],
  ] as const)("%s uses fixed endpoint, strict schema, no tools, and minimized public input", async (_provider, endpoint, factory, model) => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchPort = vi.fn(async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init ?? {} }); return jsonResponse({ ok: true }); }) as unknown as typeof fetch;
    await factory(fetchPort).request({ apiKey: "server-secret", model, modelInput: await modelInput() });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(endpoint);
    expect(calls[0].init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" });
    const body = JSON.parse(String(calls[0].init.body));
    const serialized = JSON.stringify(body);
    expect(serialized).toContain("json_schema");
    expect(body).not.toHaveProperty("tools");
    expect(serialized).not.toContain("web_search");
    expect(serialized).not.toContain("Private fixture title");
    expect(serialized).not.toContain("wikipedia.org");
    expect(serialized).not.toContain("Q123");
    expect(serialized).not.toContain("ownerId");
    expect(serialized).not.toContain("minimumLevel");
    expect(serialized).not.toContain('"role":"must"');
  });

  it("OpenAI uses store:false and Responses text.format", async () => {
    let body: Record<string, unknown> = {};
    const fetchPort = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => { body = JSON.parse(String(init?.body)); return jsonResponse({}); }) as unknown as typeof fetch;
    await new OpenAiGroundedExtractionClient(fetchPort).request({ apiKey: "k", model: "gpt-5.4-mini", modelInput: await modelInput() });
    expect(body).toMatchObject({ store: false, text: { format: { type: "json_schema", strict: true } } });
  });

  it("OpenRouter disables endpoint fallback/data collection and sends no plugins", async () => {
    let body: Record<string, unknown> = {};
    const fetchPort = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => { body = JSON.parse(String(init?.body)); return jsonResponse({}); }) as unknown as typeof fetch;
    await new OpenRouterGroundedExtractionClient(fetchPort).request({ apiKey: "k", model: "openai/gpt-5.4-mini", modelInput: await modelInput() });
    expect(body.provider).toEqual({ require_parameters: true, allow_fallbacks: false, data_collection: "deny" });
    expect(body).not.toHaveProperty("plugins");
    expect(body).not.toHaveProperty("tools");
  });
});

describe("D7-R3B provider decoder and bounded HTTP behavior", () => {
  it("accepts exact JSON only; markdown fences are not repaired", async () => {
    const request = await createGroundedExtractionRequest();
    const units = await buildGroundedEvidenceUnits({ packet: request.packet, maxUnits: 64 });
    const output = { version: 1, assessments: [{ passageId: units.eligibleUnits[0].passageId, finding: "supports_presence", level: "significant", confidence: "medium", evidenceUnitIds: [units.eligibleUnits[0].unitId], basis: "affects_plot" }] };
    const client = { request: vi.fn(async () => ({ body: { model: "openai/gpt-oss-20b", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }] }, status: 200, bytesRead: 100, durationMs: 1, retryCount: 0, rateLimitCount: 0 })) };
    expect((await new GroqGroundedExtractionAdapter(client as never).extract({ modelInput: await modelInput(), apiKey: "k", model: "openai/gpt-oss-20b", maxAssessments: 8 })).status).toBe("success");
    client.request.mockResolvedValueOnce({ body: { model: "openai/gpt-oss-20b", choices: [{ finish_reason: "stop", message: { content: `\`\`\`json\n${JSON.stringify(output)}\n\`\`\`` } }] }, status: 200, bytesRead: 100, durationMs: 1, retryCount: 0, rateLimitCount: 0 });
    expect((await new GroqGroundedExtractionAdapter(client as never).extract({ modelInput: await modelInput(), apiKey: "k", model: "openai/gpt-oss-20b", maxAssessments: 8 })).status).toBe("output_invalid");
  });

  it("429 is retried once with bounded Retry-After; permanent 4xx is not", async () => {
    const responses = [jsonResponse({}, 429, { "retry-after": "999" }), jsonResponse({ ok: true })];
    const fetchPort = vi.fn(async () => responses.shift()!) as unknown as typeof fetch;
    const client = new FixedExtractionJsonClient("https://fixed.example/v1", "x-request-id", 6_000, 1024, fetchPort, async () => undefined);
    await expect(client.request({ apiKey: "k", body: {} })).resolves.toMatchObject({ retryCount: 1, rateLimitCount: 1 });
    expect(fetchPort).toHaveBeenCalledTimes(2);
    const badFetch = vi.fn(async () => jsonResponse({}, 401)) as unknown as typeof fetch;
    await expect(new FixedExtractionJsonClient("https://fixed.example/v1", "x-request-id", 6_000, 1024, badFetch).request({ apiKey: "k", body: {} })).rejects.toMatchObject({ kind: "http", status: 401 });
    expect(badFetch).toHaveBeenCalledTimes(1);
  });

  it("oversized and parent-aborted responses fail closed", async () => {
    const largeFetch = vi.fn(async () => jsonResponse({ value: "x".repeat(200) })) as unknown as typeof fetch;
    await expect(new FixedExtractionJsonClient("https://fixed.example/v1", "x-request-id", 6_000, 32, largeFetch).request({ apiKey: "k", body: {} })).rejects.toMatchObject({ kind: "oversized_response" });
    const controller = new AbortController(); controller.abort();
    const abortedFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => { if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError"); return jsonResponse({}); }) as unknown as typeof fetch;
    await expect(new FixedExtractionJsonClient("https://fixed.example/v1", "x-request-id", 6_000, 1024, abortedFetch).request({ apiKey: "k", body: {}, signal: controller.signal })).rejects.toMatchObject({ kind: "aborted" });
  });
});
