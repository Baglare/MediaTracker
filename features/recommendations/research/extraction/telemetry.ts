import type { GroundedExtractionTelemetry } from "./domain/types";
export function emptyGroundedExtractionTelemetry(): GroundedExtractionTelemetry { return { attemptedProviders: [], requestCount: 0, retryCount: 0, rateLimitCount: 0, timeoutCount: 0, responseBytes: 0, durationMs: 0, evidenceUnitCount: 0, assessmentCount: 0, claimCount: 0, coalescedCount: 0 }; }

