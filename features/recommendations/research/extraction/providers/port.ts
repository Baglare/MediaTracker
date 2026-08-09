import type { GroundedExtractionModelInput, GroundedExtractionModelOutput, GroundedExtractionProviderId } from "../domain/types";

export interface GroundedExtractionAdapterTelemetry { durationMs: number; retryCount: number; rateLimitCount: number; responseBytes: number; requestId?: string }
export type GroundedExtractionAdapterResult =
  | { status: "success"; providerId: GroundedExtractionProviderId; modelId: string; output: GroundedExtractionModelOutput; telemetry: GroundedExtractionAdapterTelemetry; warnings: readonly string[] }
  | { status: "refusal" | "provider_unavailable" | "budget_exhausted" | "output_invalid"; providerId: GroundedExtractionProviderId; modelId: string; telemetry: GroundedExtractionAdapterTelemetry; warnings: readonly string[] };
export interface GroundedExtractionProviderPort { providerId: GroundedExtractionProviderId; extract(input: { modelInput: GroundedExtractionModelInput; apiKey: string; model: string; maxAssessments: number; signal?: AbortSignal }): Promise<GroundedExtractionAdapterResult> }

