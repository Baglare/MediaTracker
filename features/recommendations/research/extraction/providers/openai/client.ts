import "server-only";
import { GROUNDED_EXTRACTION_JSON_SCHEMA } from "../../prompt/schema";
import { GROUNDED_EXTRACTION_SYSTEM_INSTRUCTIONS } from "../../prompt/instructions";
import type { GroundedExtractionModelInput } from "../../domain/types";
import { GROUNDED_EXTRACTION_PROVIDER_REGISTRY } from "../registry";
import { FixedExtractionJsonClient } from "../shared/fixed-json-client";
import { OPENAI_GROUNDED_EXTRACTION_ENDPOINT } from "./config";
export class OpenAiGroundedExtractionClient {
  private readonly http: FixedExtractionJsonClient;
  constructor(fetchPort?: typeof fetch, sleep?: (ms: number) => Promise<void>, now?: () => number) { const p = GROUNDED_EXTRACTION_PROVIDER_REGISTRY.openai; this.http = new FixedExtractionJsonClient(OPENAI_GROUNDED_EXTRACTION_ENDPOINT, "x-request-id", p.timeoutMs, p.maxResponseBytes, fetchPort, sleep, now); }
  request(input: { apiKey: string; model: string; modelInput: GroundedExtractionModelInput; signal?: AbortSignal }) { return this.http.request({ apiKey: input.apiKey, body: { model: input.model, store: false, instructions: GROUNDED_EXTRACTION_SYSTEM_INSTRUCTIONS, input: JSON.stringify(input.modelInput), text: { format: { type: "json_schema", name: "grounded_aspect_observations", strict: true, schema: GROUNDED_EXTRACTION_JSON_SCHEMA } }, max_output_tokens: 2_000 }, signal: input.signal }); }
}

