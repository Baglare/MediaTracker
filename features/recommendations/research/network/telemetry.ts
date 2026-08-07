import type { BoundedResearchNetworkErrorCode } from "./types";

export interface ResearchNetworkTelemetry {
  dnsLookupCount: number;
  dnsDurationMs: number;
  dnsLookupFailures: number;
  dnsLastErrorCode?: BoundedResearchNetworkErrorCode;
  privateAddressRejects: number;
  redirectRejects: number;
  requestCount: number;
  retries: number;
  rateLimits: number;
  timeouts: number;
  bytesRead: number;
  oversizedRejects: number;
  contentTypeRejects: number;
  coalescedRequests: number;
  connectFailures: number;
  tlsFailures: number;
  httpFailures: number;
}

export function emptyResearchNetworkTelemetry(): ResearchNetworkTelemetry {
  return {
    dnsLookupCount: 0,
    dnsDurationMs: 0,
    dnsLookupFailures: 0,
    privateAddressRejects: 0,
    redirectRejects: 0,
    requestCount: 0,
    retries: 0,
    rateLimits: 0,
    timeouts: 0,
    bytesRead: 0,
    oversizedRejects: 0,
    contentTypeRejects: 0,
    coalescedRequests: 0,
    connectFailures: 0,
    tlsFailures: 0,
    httpFailures: 0,
  };
}
