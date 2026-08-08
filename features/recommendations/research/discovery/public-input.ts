import { ASPECT_REGISTRY } from "../../domain/aspect-registry";
import type { SearchDiscoveryPortRequest } from "./port";

export function buildProviderNeutralDiscoveryInput(input: SearchDiscoveryPortRequest): string {
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
    "Use only web search. Do not recommend, rank, add candidates, or decide aspect presence/level.",
    "Search only the supplied deterministic queries and allowed domains.",
    JSON.stringify(publicPayload),
  ].join("\n");
}
