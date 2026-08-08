import { getAspectResearchCapability } from "../domain/aspect-capability";
import { RESEARCH_SOURCE_REGISTRY, getResearchSource, type ResearchSourceId } from "../domain/source-registry";
import { validateResearchUrl } from "../security/url-policy";
import type { ResearchDiscoveryRequest } from "./types";

export const OPENAI_DISCOVERY_SOURCE_IDS = ["wikipedia"] as const satisfies readonly ResearchSourceId[];
export const OPENAI_DISCOVERY_ALLOWED_DOMAINS = ["wikipedia.org"] as const;

export interface ResearchDiscoverySourcePolicy {
  allowedSourceIds: readonly ResearchSourceId[];
  allowedDomains: readonly string[];
}

function sameSorted(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && [...left].sort().every((item, index) => item === [...right].sort()[index]);
}

export function hostnameMatchesDiscoveryDomain(hostname: string, allowedDomain: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const domain = allowedDomain.toLowerCase().replace(/\.$/, "");
  return host === domain || host.endsWith(`.${domain}`);
}

export function deriveResearchDiscoverySourcePolicy(request: ResearchDiscoveryRequest): ResearchDiscoverySourcePolicy | null {
  const capability = getAspectResearchCapability(request.aspectId);
  const roleAllowed = request.role === "must" ? capability.canResearchMust : request.role === "avoid" ? capability.canResearchAvoid : capability.canResearchPrefer;
  const wikipedia = RESEARCH_SOURCE_REGISTRY.wikipedia;
  if (!roleAllowed || capability.researchMode === "none" || capability.researchMode === "unsupported") return null;
  if (!capability.allowedSourceClasses.includes(wikipedia.sourceClass) || !wikipedia.enabled || !wikipedia.queryable) return null;
  return { allowedSourceIds: OPENAI_DISCOVERY_SOURCE_IDS, allowedDomains: OPENAI_DISCOVERY_ALLOWED_DOMAINS };
}

export function requestMatchesResearchDiscoverySourcePolicy(request: ResearchDiscoveryRequest, policy: ResearchDiscoverySourcePolicy): boolean {
  return sameSorted(request.allowedSourceIds, policy.allowedSourceIds) && sameSorted(request.allowedDomains, policy.allowedDomains);
}

export type DiscoveredUrlPolicyResult =
  | { ok: true; sourceId: ResearchSourceId; canonicalUrl: string; hostname: string }
  | { ok: false; reason: string; domainRejected: boolean };

export function resolveDiscoveredResearchUrl(input: {
  url: string;
  policy: ResearchDiscoverySourcePolicy;
}): DiscoveredUrlPolicyResult {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return { ok: false, reason: "url_invalid", domainRejected: false };
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!input.policy.allowedDomains.some((domain) => hostnameMatchesDiscoveryDomain(hostname, domain))) {
    return { ok: false, reason: "discovery_domain_not_allowlisted", domainRejected: true };
  }
  const hostMatchedSourceIds = input.policy.allowedSourceIds.filter((sourceId) => getResearchSource(sourceId)?.allowedHosts.includes(hostname));
  if (hostMatchedSourceIds.length === 0) return { ok: false, reason: "source_registry_host_not_allowlisted", domainRejected: true };
  for (const sourceId of hostMatchedSourceIds) {
    const result = validateResearchUrl({ url: input.url, sourceId });
    if (result.ok) return { ok: true, sourceId, canonicalUrl: result.canonicalUrl, hostname: result.normalizedHost };
  }
  return { ok: false, reason: "source_registry_url_rejected", domainRejected: false };
}
