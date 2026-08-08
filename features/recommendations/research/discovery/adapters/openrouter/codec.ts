import type { SearchDiscoveryUrl } from "../../port";

export interface DecodedOpenRouterWebSearchResponse {
  valid: boolean;
  urls: readonly SearchDiscoveryUrl[];
  webSearchCallCount: number;
  malformedItemCount: number;
  warnings: readonly string[];
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function decodeOpenRouterWebSearchResponse(value: unknown): DecodedOpenRouterWebSearchResponse {
  if (!record(value) || value.status !== "completed" || !Array.isArray(value.output) || record(value.error)) {
    return { valid: false, urls: [], webSearchCallCount: 0, malformedItemCount: 1, warnings: ["openrouter_response_invalid"] };
  }
  const urls: SearchDiscoveryUrl[] = [];
  let malformedItemCount = 0;
  for (const item of value.output.slice(0, 100)) {
    if (!record(item) || item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content.slice(0, 20)) {
      if (!record(content) || content.type !== "output_text" || !Array.isArray(content.annotations)) continue;
      for (const annotation of content.annotations.slice(0, 100)) {
        if (!record(annotation) || annotation.type !== "url_citation") continue;
        if (typeof annotation.url !== "string" || annotation.url.length === 0 || annotation.url.length > 4096) {
          malformedItemCount += 1;
          continue;
        }
        urls.push({ url: annotation.url, rank: urls.length });
      }
    }
  }
  const usage = record(value.usage) && record(value.usage.server_tool_use) ? value.usage.server_tool_use : null;
  const count = usage && Number.isInteger(usage.web_search_requests) && Number(usage.web_search_requests) >= 0
    ? Math.min(Number(usage.web_search_requests), 10)
    : 0;
  return {
    valid: count > 0,
    urls,
    webSearchCallCount: count,
    malformedItemCount,
    warnings: count > 0 ? [] : ["openrouter_web_search_not_executed"],
  };
}
