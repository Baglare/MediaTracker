import "server-only";

import type { SearchDiscoveryPort, SearchDiscoveryPortRequest, SearchDiscoveryPortResult } from "../../port";
import { buildProviderNeutralDiscoveryInput } from "../../public-input";
import { emptyResearchDiscoveryTelemetry } from "../../types";
import { DiscoveryHttpError } from "../shared/fixed-json-client";
import { GroqCompoundDiscoveryClient } from "./client";
import { decodeGroqWebSearchResponse } from "./codec";
import type { GroqWebDiscoveryEnvironment } from "./config";

export class GroqWebSearchDiscoveryAdapter implements SearchDiscoveryPort {
  readonly providerId = "groq" as const;
  readonly adapterId = "groq_compound_web_search" as const;

  constructor(private readonly environment: GroqWebDiscoveryEnvironment, private readonly client = new GroqCompoundDiscoveryClient()) {}

  async discover(input: SearchDiscoveryPortRequest): Promise<SearchDiscoveryPortResult> {
    const telemetry = emptyResearchDiscoveryTelemetry();
    telemetry.providerId = this.providerId;
    if (!this.environment.valid || !this.environment.apiKey || !this.environment.model || input.allowedDomains.length === 0) {
      return { providerId: this.providerId, status: "unavailable", rawUrlSignals: [], telemetry, warnings: this.environment.warnings };
    }
    telemetry.requestCount = 1;
    try {
      const response = await this.client.request({
        apiKey: this.environment.apiKey,
        model: this.environment.model,
        instruction: buildProviderNeutralDiscoveryInput(input),
        allowedDomains: input.allowedDomains,
        signal: input.signal,
      });
      const decoded = decodeGroqWebSearchResponse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.body)) as unknown);
      Object.assign(telemetry, {
        durationMs: response.durationMs,
        httpStatusClass: response.statusClass,
        rateLimits: response.rateLimitCount,
        retryCount: response.retryCount,
        responseBytes: response.bytesRead,
        requestId: response.requestId,
        webSearchCallCount: decoded.webSearchCallCount,
        rawSourceUrlCount: decoded.urls.length,
        malformedItemCount: decoded.malformedItemCount,
      });
      return decoded.valid
        ? { providerId: this.providerId, status: "completed", rawUrlSignals: decoded.urls, telemetry, warnings: decoded.warnings }
        : { providerId: this.providerId, status: "response_invalid", rawUrlSignals: [], telemetry, warnings: decoded.warnings };
    } catch (error) {
      if (error instanceof DiscoveryHttpError) {
        telemetry.rateLimits += error.status === 429 ? 1 : 0;
        telemetry.timeouts += error.kind === "timeout" ? 1 : 0;
        return {
          providerId: this.providerId,
          status: error.kind === "timeout" || error.kind === "aborted" ? "budget_exhausted" : "unavailable",
          rawUrlSignals: [], telemetry, warnings: [`groq_web_discovery_${error.kind}`],
        };
      }
      return { providerId: this.providerId, status: "response_invalid", rawUrlSignals: [], telemetry, warnings: ["groq_web_discovery_response_invalid"] };
    }
  }
}
