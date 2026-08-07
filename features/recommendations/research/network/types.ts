import type { ResearchSourceId } from "../domain/source-registry";

export type ResearchIpFamily = 4 | 6;

export interface ResolvedResearchAddress {
  address: string;
  family: ResearchIpFamily;
}

export interface ResearchDnsResolver {
  resolve(hostname: string): Promise<readonly ResolvedResearchAddress[]>;
}

export interface ResearchInternalHeaders {
  userAgent: string;
  accept: string;
  acceptEncoding?: "gzip, deflate";
  apiUserAgent?: string;
}

export interface ResearchRedirectPolicy {
  mode: "manual";
  maxRedirects: number;
}

export interface SecureResearchHttpRequest {
  sourceId: ResearchSourceId;
  url: string;
  method: "GET";
  headers: ResearchInternalHeaders;
  timeoutMs: number;
  maxResponseBytes: number;
  acceptedContentTypes: readonly string[];
  redirectPolicy: ResearchRedirectPolicy;
  requestId: string;
  maxAttempts?: 1 | 2;
  signal?: AbortSignal;
}

export interface SecureResearchHttpResponse {
  finalUrl: string;
  status: number;
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
  bytesRead: number;
  contentType: string;
  durationMs: number;
  redirectChain: readonly string[];
  resolvedAddresses: readonly ResolvedResearchAddress[];
  retryCount: number;
  warnings: readonly string[];
}

export interface SecureResearchHttpClient {
  request(input: SecureResearchHttpRequest): Promise<SecureResearchHttpResponse>;
}

export type BoundedResearchNetworkErrorCode =
  | "ENOTFOUND"
  | "EAI_AGAIN"
  | "ETIMEDOUT"
  | "ECONNREFUSED"
  | "ECONNRESET"
  | "ENETUNREACH"
  | "EHOSTUNREACH"
  | "EPIPE"
  | "TLS_CERTIFICATE"
  | "TLS_PROTOCOL"
  | "UNKNOWN";

export type SecureResearchHttpErrorKind =
  | "invalid_request"
  | "security_rejected"
  | "dns_lookup_failed"
  | "dns_result_empty"
  | "dns_security_rejected"
  | "dns_timeout"
  | "timeout"
  | "aborted"
  | "connect_failed"
  | "tls_failed"
  | "http_failed"
  | "redirect_rejected"
  | "content_type_rejected"
  | "oversized_content"
  | "invalid_encoding";

export function boundedResearchNetworkErrorCode(error: unknown): BoundedResearchNetworkErrorCode {
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code.toUpperCase()
    : "";
  if (["ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "ENETUNREACH", "EHOSTUNREACH", "EPIPE"].includes(code)) {
    return code as BoundedResearchNetworkErrorCode;
  }
  if (/^(CERT_|ERR_TLS_CERT_|UNABLE_TO_VERIFY|DEPTH_ZERO_SELF_SIGNED|SELF_SIGNED_CERT)/.test(code)) return "TLS_CERTIFICATE";
  if (/^(ERR_TLS_|ERR_SSL_)/.test(code)) return "TLS_PROTOCOL";
  return "UNKNOWN";
}

export class SecureResearchHttpError extends Error {
  constructor(
    readonly kind: SecureResearchHttpErrorKind,
    readonly reason: string,
    readonly retryable = false,
    readonly internalCode?: BoundedResearchNetworkErrorCode,
  ) {
    super(`secure_research_http_${kind}:${reason}`);
    this.name = "SecureResearchHttpError";
  }
}

export interface ResearchTransportRequest {
  url: string;
  hostname: string;
  pinnedAddress: ResolvedResearchAddress;
  headers: Readonly<Record<string, string>>;
  timeoutMs: number;
  maxResponseBytes: number;
  acceptedContentTypes: readonly string[];
  signal?: AbortSignal;
}

export interface ResearchTransportResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: Uint8Array;
  bytesRead: number;
  contentType: string;
}

export interface ResearchHttpsTransport {
  request(input: ResearchTransportRequest): Promise<ResearchTransportResponse>;
}
