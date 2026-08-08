import "server-only";

import { ASPECT_REGISTRY } from "../../../../domain/aspect-registry";
import type { SearchDiscoveryPort, SearchDiscoveryPortRequest, SearchDiscoveryPortResult } from "../../port";
import { emptyResearchDiscoveryTelemetry } from "../../types";
import { OpenAiDiscoveryError, OpenAiResponsesClient } from "./client";
import { decodeOpenAiWebSearchResponse } from "./codec";
import type { OpenAiWebDiscoveryEnvironment } from "./config";

export function buildOpenAiDiscoveryInput(input: SearchDiscoveryPortRequest): string {
  const aspect = ASPECT_REGISTRY[input.aspect.aspectId];
  const publicPayload = {
    candidate: {
      title: input.candidate.title,
      ...(input.candidate.releaseYear ? { releaseYear: input.candidate.releaseYear } : {}),
      mediaType: input.candidate.mediaType,
      scopeKind: input.candidate.versionScope.scopeKind,
    },
    aspect: {
      id: input.aspect.aspectId,
      label: aspect.labelEn,
      role: input.aspect.role,
      ...(input.aspect.minimumLevel ? { minimumLevel: input.aspect.minimumLevel } : {}),
    },
    queries: [...input.queries],
    allowedDomains: [...input.allowedDomains],
  };
  return [
    "Find allowlisted public pages about the exact work and aspect in this JSON.",
    "Use only web_search. Do not recommend, rank, add candidates, or decide aspect presence/level.",
    "Search only the supplied deterministic queries and allowed domains.",
    JSON.stringify(publicPayload),
  ].join("\n");
}

export class OpenAiWebSearchDiscoveryAdapter implements SearchDiscoveryPort {
  readonly adapterId = "openai_web_search" as const;

  constructor(
    private readonly environment: OpenAiWebDiscoveryEnvironment,
    private readonly client = new OpenAiResponsesClient(),
  ) {}

  async discover(input: SearchDiscoveryPortRequest): Promise<SearchDiscoveryPortResult> {
    const telemetry = emptyResearchDiscoveryTelemetry();
    if (!this.environment.valid || !this.environment.apiKey || !this.environment.model) {
      return { status: "unavailable", urls: [], telemetry, warnings: this.environment.warnings };
    }
    telemetry.requestCount = 1;
    try {
      const response = await this.client.request({
        apiKey: this.environment.apiKey,
        model: this.environment.model,
        input: buildOpenAiDiscoveryInput(input),
        allowedDomains: input.allowedDomains,
        requestId: input.requestId,
        signal: input.signal,
      });
      const decoded = decodeOpenAiWebSearchResponse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.body)) as unknown);
      telemetry.durationMs = response.durationMs;
      telemetry.httpStatusClass = response.statusClass;
      telemetry.rateLimits = response.rateLimitCount;
      telemetry.retryCount = response.retryCount;
      telemetry.responseBytes = response.bytesRead;
      telemetry.requestId = response.requestId;
      telemetry.webSearchCallCount = decoded.webSearchCallCount;
      telemetry.rawSourceUrlCount = decoded.rawSourceUrlCount;
      telemetry.malformedItemCount = decoded.malformedItemCount;
      if (!decoded.valid) return { status: "response_invalid", urls: [], telemetry, warnings: decoded.warnings };
      return { status: "completed", urls: decoded.urls.slice(0, 100), telemetry, warnings: decoded.warnings };
    } catch (error) {
      if (error instanceof OpenAiDiscoveryError) {
        telemetry.rateLimits += error.status === 429 ? 1 : 0;
        telemetry.timeouts += error.kind === "timeout" ? 1 : 0;
        return {
          status: error.kind === "timeout" || error.kind === "aborted" ? "budget_exhausted" : "unavailable",
          urls: [], telemetry, warnings: [`openai_web_discovery_${error.kind}`],
        };
      }
      return { status: "response_invalid", urls: [], telemetry, warnings: ["openai_web_discovery_response_invalid"] };
    }
  }
}
