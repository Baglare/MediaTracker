import "server-only";

import { FixedJsonDiscoveryClient, type FixedJsonDiscoveryResponse } from "../shared/fixed-json-client";
import type { OpenRouterResearchModel } from "./config";

export const OPENROUTER_RESPONSES_ENDPOINT = "https://openrouter.ai/api/v1/responses" as const;

export class OpenRouterWebSearchDiscoveryClient {
  private readonly http: FixedJsonDiscoveryClient;

  constructor(fetchPort?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>, sleep?: (ms: number) => Promise<void>) {
    this.http = new FixedJsonDiscoveryClient(OPENROUTER_RESPONSES_ENDPOINT, "x-request-id", fetchPort, sleep);
  }

  request(input: {
    apiKey: string;
    model: OpenRouterResearchModel;
    instruction: string;
    allowedDomains: readonly string[];
    maxSources: number;
    signal?: AbortSignal;
  }): Promise<FixedJsonDiscoveryResponse> {
    if (input.allowedDomains.length === 0) return Promise.reject(new Error("openrouter_no_allowed_domains"));
    return this.http.request({
      apiKey: input.apiKey,
      body: {
        model: input.model,
        store: false,
        input: input.instruction,
        tools: [{
          type: "openrouter:web_search",
          parameters: {
            engine: "exa",
            max_results: input.maxSources,
            max_total_results: input.maxSources,
            max_uses: 1,
            search_context_size: "low",
            allowed_domains: [...input.allowedDomains],
          },
        }],
      },
      signal: input.signal,
    });
  }
}
