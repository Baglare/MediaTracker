import "server-only";
import { GROUNDED_EXTRACTION_RESPONSE_FORMAT } from "../../prompt/schema";
import { GROUNDED_EXTRACTION_SYSTEM_INSTRUCTIONS } from "../../prompt/instructions";
import type { GroundedExtractionModelInput } from "../../domain/types";
import { GROUNDED_EXTRACTION_PROVIDER_REGISTRY } from "../registry";
import { FixedExtractionJsonClient } from "../shared/fixed-json-client";
import { OPENROUTER_GROUNDED_EXTRACTION_ENDPOINT } from "./config";
export class OpenRouterGroundedExtractionClient {
  private readonly http: FixedExtractionJsonClient;
  constructor(fetchPort?: typeof fetch, sleep?: (ms: number) => Promise<void>, now?: () => number) { const p = GROUNDED_EXTRACTION_PROVIDER_REGISTRY.openrouter; this.http = new FixedExtractionJsonClient(OPENROUTER_GROUNDED_EXTRACTION_ENDPOINT, "x-request-id", p.timeoutMs, p.maxResponseBytes, fetchPort, sleep, now); }
  request(input: { apiKey: string; model: string; modelInput: GroundedExtractionModelInput; signal?: AbortSignal }) { return this.http.request({ apiKey: input.apiKey, body: { model: input.model, messages: [{ role: "system", content: GROUNDED_EXTRACTION_SYSTEM_INSTRUCTIONS }, { role: "user", content: JSON.stringify(input.modelInput) }], response_format: GROUNDED_EXTRACTION_RESPONSE_FORMAT, provider: { require_parameters: true, allow_fallbacks: false, data_collection: "deny" }, stream: false, temperature: 0, max_tokens: 2_000 }, signal: input.signal }); }
}

