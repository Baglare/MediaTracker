import "server-only";
import { decodeGroundedExtractionModelOutput } from "../../domain/model-output";
import type { GroundedExtractionProviderPort } from "../port";
import { ExtractionHttpError } from "../shared/fixed-json-client";
import { decodeGroqGroundedExtractionEnvelope } from "./codec";
import { GroqGroundedExtractionClient } from "./client";
export class GroqGroundedExtractionAdapter implements GroundedExtractionProviderPort {
  readonly providerId = "groq" as const;
  constructor(private readonly client = new GroqGroundedExtractionClient()) {}
  async extract(input: Parameters<GroundedExtractionProviderPort["extract"]>[0]) {
    try { const response = await this.client.request(input); const envelope = decodeGroqGroundedExtractionEnvelope(response.body); const telemetry = { durationMs: response.durationMs, retryCount: response.retryCount, rateLimitCount: response.rateLimitCount, responseBytes: response.bytesRead, ...(response.requestId ? { requestId: response.requestId } : {}) };
      if (envelope.status === "refusal") return { status: "refusal" as const, providerId: this.providerId, modelId: envelope.model ?? input.model, telemetry, warnings: envelope.warnings };
      if (envelope.status !== "content") return { status: "output_invalid" as const, providerId: this.providerId, modelId: envelope.model ?? input.model, telemetry, warnings: envelope.warnings };
      let raw: unknown; try { raw = JSON.parse(envelope.content); } catch { return { status: "output_invalid" as const, providerId: this.providerId, modelId: envelope.model, telemetry, warnings: ["extraction_output_invalid_json"] }; }
      const decoded = decodeGroundedExtractionModelOutput(raw, input.maxAssessments); return decoded.ok ? { status: "success" as const, providerId: this.providerId, modelId: envelope.model, output: decoded.value, telemetry, warnings: [] } : { status: "output_invalid" as const, providerId: this.providerId, modelId: envelope.model, telemetry, warnings: decoded.issues.map((item) => item.code) };
    } catch (error) { const kind = error instanceof ExtractionHttpError ? error.kind : "network"; return { status: kind === "aborted" || kind === "timeout" ? "budget_exhausted" as const : "provider_unavailable" as const, providerId: this.providerId, modelId: input.model, telemetry: { durationMs: 0, retryCount: 0, rateLimitCount: error instanceof ExtractionHttpError && error.status === 429 ? 1 : 0, responseBytes: 0 }, warnings: [`groq_extraction_${kind}`] }; }
  }
}

