import type { ResearchAcquisitionTelemetry } from "./types";

export function emptyResearchAcquisitionTelemetry(): ResearchAcquisitionTelemetry {
  return {
    directInputCount: 0, discoveredInputCount: 0, acceptedUrlCount: 0, rejectedUrlCount: 0,
    registryRejectCount: 0, qidMatchCount: 0, qidMismatchCount: 0, missingPageCount: 0,
    disambiguationCount: 0, revisionResultCount: 0, networkAcquisitionCount: 0,
    documentBytes: 0, normalizedCharacters: 0, segmentCount: 0, lexicalPassageCount: 0,
    coveragePassageCount: 0, injectionFlagCount: 0, packetCharacters: 0,
    acquisitionDurationMs: 0, cacheHitCount: 0, coalescedCount: 0,
  };
}

