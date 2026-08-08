import "server-only";

import { FixedJsonDiscoveryClient, type FixedJsonDiscoveryResponse } from "../shared/fixed-json-client";
import type { GroqResearchModel } from "./config";

export const GROQ_CHAT_COMPLETIONS_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions" as const;
export const GROQ_COMPOUND_DISCOVERY_TIMEOUT_MS = 7_500;

export class GroqCompoundDiscoveryClient {
  private readonly http: FixedJsonDiscoveryClient;

  constructor(fetchPort?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>, sleep?: (ms: number) => Promise<void>) {
    this.http = new FixedJsonDiscoveryClient(GROQ_CHAT_COMPLETIONS_ENDPOINT, "x-request-id", fetchPort, sleep);
  }

  request(input: {
    apiKey: string;
    model: GroqResearchModel;
    instruction: string;
    allowedDomains: readonly string[];
    signal?: AbortSignal;
  }): Promise<FixedJsonDiscoveryResponse> {
    if (input.allowedDomains.length === 0) return Promise.reject(new Error("groq_no_allowed_domains"));
    const includeDomains = input.allowedDomains.flatMap((domain) => [domain, `*.${domain}`]);
    return this.http.request({
      apiKey: input.apiKey,
      body: {
        model: input.model,
        messages: [{ role: "user", content: input.instruction }],
        compound_custom: { tools: { enabled_tools: ["web_search"] } },
        search_settings: { include_domains: includeDomains },
      },
      signal: input.signal,
      timeoutMs: GROQ_COMPOUND_DISCOVERY_TIMEOUT_MS,
    });
  }
}
