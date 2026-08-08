import "server-only";

import type { SearchDiscoveryPort, SearchDiscoveryPortRequest, SearchDiscoveryPortResult } from "../../port";
import { buildProviderNeutralDiscoveryInput } from "../../public-input";
import { emptyResearchDiscoveryTelemetry } from "../../types";
import { OpenAiDiscoveryError, OpenAiResponsesClient } from "./client";
import { decodeOpenAiWebSearchResponse } from "./codec";
import type { OpenAiWebDiscoveryEnvironment } from "./config";

export function buildOpenAiDiscoveryInput(input: SearchDiscoveryPortRequest): string {
  return buildProviderNeutralDiscoveryInput(input);
}

export class OpenAiWebSearchDiscoveryAdapter implements SearchDiscoveryPort {
  readonly providerId = "openai" as const;
  readonly adapterId = "openai_web_search" as const;

  constructor(
    private readonly environment: OpenAiWebDiscoveryEnvironment,
    private readonly client = new OpenAiResponsesClient(),
  ) {}

  async discover(input: SearchDiscoveryPortRequest): Promise<SearchDiscoveryPortResult> {
    const telemetry = emptyResearchDiscoveryTelemetry();
    telemetry.providerId = this.providerId;
    if (!this.environment.valid || !this.environment.apiKey || !this.environment.model) {
      return { providerId: this.providerId, status: "unavailable", rawUrlSignals: [], telemetry, warnings: this.environment.warnings };
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
      if (!decoded.valid) return { providerId: this.providerId, status: "response_invalid", rawUrlSignals: [], telemetry, warnings: decoded.warnings };
      return { providerId: this.providerId, status: "completed", rawUrlSignals: decoded.urls.slice(0, 100), telemetry, warnings: decoded.warnings };
    } catch (error) {
      if (error instanceof OpenAiDiscoveryError) {
        telemetry.rateLimits += error.status === 429 ? 1 : 0;
        telemetry.timeouts += error.kind === "timeout" ? 1 : 0;
        return {
          status: error.kind === "timeout" || error.kind === "aborted" ? "budget_exhausted" : "unavailable",
          providerId: this.providerId, rawUrlSignals: [], telemetry, warnings: [`openai_web_discovery_${error.kind}`],
        };
      }
      return { providerId: this.providerId, status: "response_invalid", rawUrlSignals: [], telemetry, warnings: ["openai_web_discovery_response_invalid"] };
    }
  }
}
