import { ASPECT_REGISTRY } from "../../domain/aspect-registry";
import type { ResearchDiscoveryRequest } from "./types";

export const DISCOVERY_MAX_QUERIES = 2;
export const DISCOVERY_MAX_QUERY_LENGTH = 320;

function boundedToken(value: string, field: string): string {
  if (value.length > 180 || /[\u0000-\u001F\u007F]/.test(value)) throw new Error(`research_discovery_${field}_invalid`);
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalized) throw new Error(`research_discovery_${field}_invalid`);
  return normalized;
}

function quoted(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

function cap(query: string): string {
  if (query.length > DISCOVERY_MAX_QUERY_LENGTH) throw new Error("research_discovery_query_too_long");
  return query;
}

export function buildResearchDiscoveryQueries(request: ResearchDiscoveryRequest): readonly string[] {
  const title = quoted(boundedToken(request.titleSnapshot, "title"));
  const aspect = ASPECT_REGISTRY[request.aspectId];
  const label = boundedToken(aspect.labelEn, "aspect_label");
  const synonyms = aspect.aliasesEn.slice(0, 2).map((alias) => boundedToken(alias, "aspect_alias"));
  const identity = [title, request.releaseYear ? String(request.releaseYear) : null, request.mediaType].filter(Boolean).join(" ");
  const strength = request.minimumLevel === "primary" ? "main plot" : request.minimumLevel === "significant" ? "significant story" : "plot story";
  const first = cap([identity, label, ...synonyms, strength].join(" "));
  const secondQualifier = aspect.group === "relationship" || request.aspectId === "romance" ? "relationship story" : "theme narrative";
  const second = cap([identity, label, secondQualifier].join(" "));
  return [...new Set([first, second])].slice(0, DISCOVERY_MAX_QUERIES);
}
