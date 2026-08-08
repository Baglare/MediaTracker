import type { SearchDiscoveryUrl } from "../../port";

export interface DecodedGroqWebSearchResponse {
  valid: boolean;
  urls: readonly SearchDiscoveryUrl[];
  webSearchCallCount: number;
  malformedItemCount: number;
  warnings: readonly string[];
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function decodeGroqWebSearchResponse(value: unknown): DecodedGroqWebSearchResponse {
  if (!record(value) || !Array.isArray(value.choices)) {
    return { valid: false, urls: [], webSearchCallCount: 0, malformedItemCount: 1, warnings: ["groq_response_invalid"] };
  }
  const urls: SearchDiscoveryUrl[] = [];
  let webSearchCallCount = 0;
  let malformedItemCount = 0;
  for (const choice of value.choices.slice(0, 10)) {
    if (!record(choice) || !record(choice.message)) { malformedItemCount += 1; continue; }
    const tools = choice.message.executed_tools;
    if (!Array.isArray(tools)) continue;
    for (const tool of tools.slice(0, 10)) {
      if (!record(tool) || !record(tool.search_results) || !Array.isArray(tool.search_results.results)) {
        malformedItemCount += 1;
        continue;
      }
      webSearchCallCount += 1;
      for (const result of tool.search_results.results.slice(0, 100)) {
        if (!record(result) || typeof result.url !== "string" || result.url.length === 0 || result.url.length > 4096) {
          malformedItemCount += 1;
          continue;
        }
        urls.push({ url: result.url, rank: urls.length });
      }
      if (tool.search_results.results.length > 100) malformedItemCount += tool.search_results.results.length - 100;
    }
  }
  return {
    valid: webSearchCallCount > 0,
    urls,
    webSearchCallCount,
    malformedItemCount,
    warnings: webSearchCallCount > 0 ? [] : ["groq_web_search_not_executed"],
  };
}
