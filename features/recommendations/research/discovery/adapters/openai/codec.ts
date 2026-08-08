import type { SearchDiscoveryUrl } from "../../port";

export interface DecodedOpenAiWebSearchResponse {
  valid: boolean;
  urls: readonly SearchDiscoveryUrl[];
  webSearchCallCount: number;
  rawSourceUrlCount: number;
  malformedItemCount: number;
  warnings: readonly string[];
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedUrl(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 4096 ? value : null;
}

function decodeSourceArray(value: unknown, actionId: string | undefined, rankStart: number): { urls: SearchDiscoveryUrl[]; malformed: number } {
  if (!Array.isArray(value)) return { urls: [], malformed: value === undefined ? 0 : 1 };
  const urls: SearchDiscoveryUrl[] = [];
  let malformed = 0;
  for (const source of value.slice(0, 100)) {
    if (!record(source) || source.type !== "url") { malformed += 1; continue; }
    const url = boundedUrl(source.url);
    if (!url) { malformed += 1; continue; }
    urls.push({ url, rank: rankStart + urls.length, ...(actionId ? { actionId } : {}) });
  }
  if (value.length > 100) malformed += value.length - 100;
  return { urls, malformed };
}

function decodeMessageCitations(item: Record<string, unknown>, rankStart: number): { urls: SearchDiscoveryUrl[]; malformed: number } {
  if (!Array.isArray(item.content)) return { urls: [], malformed: 0 };
  const urls: SearchDiscoveryUrl[] = [];
  let malformed = 0;
  for (const content of item.content.slice(0, 20)) {
    if (!record(content) || !Array.isArray(content.annotations)) continue;
    for (const annotation of content.annotations.slice(0, 100)) {
      if (!record(annotation) || annotation.type !== "url_citation") continue;
      const url = boundedUrl(annotation.url);
      if (!url) { malformed += 1; continue; }
      urls.push({ url, rank: rankStart + urls.length });
    }
  }
  return { urls, malformed };
}

export function decodeOpenAiWebSearchResponse(value: unknown): DecodedOpenAiWebSearchResponse {
  if (!record(value)) return { valid: false, urls: [], webSearchCallCount: 0, rawSourceUrlCount: 0, malformedItemCount: 1, warnings: ["openai_response_not_object"] };
  if (record(value.error)) return { valid: false, urls: [], webSearchCallCount: 0, rawSourceUrlCount: 0, malformedItemCount: 0, warnings: ["openai_response_error"] };
  if (value.status !== "completed" || !Array.isArray(value.output)) return { valid: false, urls: [], webSearchCallCount: 0, rawSourceUrlCount: 0, malformedItemCount: 1, warnings: ["openai_response_not_completed"] };
  const urls: SearchDiscoveryUrl[] = [];
  const warnings = new Set<string>();
  let webSearchCallCount = 0;
  let malformedItemCount = 0;
  for (const item of value.output.slice(0, 100)) {
    if (!record(item) || typeof item.type !== "string") { malformedItemCount += 1; continue; }
    if (item.type === "web_search_call") {
      if (item.status !== "completed" || !record(item.action)) { malformedItemCount += 1; warnings.add("web_search_call_malformed"); continue; }
      webSearchCallCount += 1;
      const actionId = typeof item.id === "string" && item.id.length <= 128 ? item.id : undefined;
      const actionType = item.action.type;
      if (actionType === "search") {
        if (item.action.queries !== undefined && (!Array.isArray(item.action.queries) || item.action.queries.some((query) => typeof query !== "string" || query.length > 1000))) malformedItemCount += 1;
        const decoded = decodeSourceArray(item.action.sources, actionId, urls.length);
        urls.push(...decoded.urls);
        malformedItemCount += decoded.malformed;
      } else if (actionType === "open_page" || actionType === "find_in_page") {
        const url = boundedUrl(item.action.url);
        if (url) urls.push({ url, rank: urls.length, ...(actionId ? { actionId } : {}) });
        else malformedItemCount += 1;
      } else {
        malformedItemCount += 1;
        warnings.add("web_search_action_unknown");
      }
      continue;
    }
    if (item.type === "message") {
      const decoded = decodeMessageCitations(item, urls.length);
      urls.push(...decoded.urls);
      malformedItemCount += decoded.malformed;
      continue;
    }
    warnings.add("openai_output_type_ignored");
  }
  if (value.output.length > 100) malformedItemCount += value.output.length - 100;
  return {
    valid: webSearchCallCount > 0,
    urls,
    webSearchCallCount,
    rawSourceUrlCount: urls.length,
    malformedItemCount,
    warnings: [...warnings],
  };
}
