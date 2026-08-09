import "server-only";
import { buildGroundedExtractionResponseFormat } from "../../prompt/schema";
import { GROUNDED_EXTRACTION_SYSTEM_INSTRUCTIONS } from "../../prompt/instructions";
import type { GroundedExtractionModelInput } from "../../domain/types";
import { GROUNDED_EXTRACTION_PROVIDER_REGISTRY } from "../registry";
import { FixedExtractionJsonClient } from "../shared/fixed-json-client";
import { GROQ_GROUNDED_EXTRACTION_ENDPOINT } from "./config";
export class GroqGroundedExtractionClient {
  private readonly http: FixedExtractionJsonClient;
  constructor(fetchPort?: typeof fetch, sleep?: (ms: number) => Promise<void>, now?: () => number) { const p = GROUNDED_EXTRACTION_PROVIDER_REGISTRY.groq; this.http = new FixedExtractionJsonClient(GROQ_GROUNDED_EXTRACTION_ENDPOINT, "x-request-id", p.timeoutMs, p.maxResponseBytes, fetchPort, sleep, now); }
  request(input: { apiKey: string; model: string; modelInput: GroundedExtractionModelInput; signal?: AbortSignal }) { return this.http.request({ apiKey: input.apiKey, body: { model: input.model, messages: [{ role: "system", content: GROUNDED_EXTRACTION_SYSTEM_INSTRUCTIONS }, { role: "user", content: JSON.stringify(input.modelInput) }], response_format: buildGroundedExtractionResponseFormat(input.modelInput), stream: false, temperature: 0, max_completion_tokens: 2_000, reasoning_effort: "low", include_reasoning: false }, signal: input.signal }); }
}
