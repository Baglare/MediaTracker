import "server-only";

import type { RecommendationCandidateIdentity } from "../../../providers/types";
import { validateResearchVersionScope } from "../../domain/version-scope";
import type { ResearchVersionScope } from "../../domain/types";
import { WIKIDATA_JSON_MAX_BYTES } from "../../network/response-limits";
import type { SecureResearchHttpClient } from "../../network/types";
import { SecureResearchHttpError } from "../../network/types";
import type { ResolvedWikimediaIdentity } from "../types";
import { decodeWikidataEntityResponse, decodeWikidataQueryResponse } from "./codec";
import { wikidataIdentityCandidates } from "./external-id-registry";
import { buildExactWikidataQueryUrl, buildWikidataEntityUrl } from "./query-builder";

export type WikidataIdentityResolution =
  | { status: "verified"; identity: ResolvedWikimediaIdentity; propertyId: string; resultCount: 1; warnings: readonly string[] }
  | { status: "identity_not_found" | "identity_ambiguous" | "identity_unverified" | "adapter_unavailable" | "security_rejected" | "budget_exhausted"; propertyId?: string; resultCount: number; warnings: readonly string[] };

const WDQS_JSON_TYPES = ["application/sparql-results+json", "application/json"] as const;
const ACTION_API_JSON_TYPES = ["application/json"] as const;

export async function resolveExactWikidataIdentity(input: {
  identity: RecommendationCandidateIdentity;
  versionScope: ResearchVersionScope;
  httpClient: SecureResearchHttpClient;
  userAgent: string;
  signal?: AbortSignal;
  now?: () => Date;
}): Promise<WikidataIdentityResolution> {
  if (!validateResearchVersionScope({ identity: input.identity, scope: input.versionScope }).ok) {
    return { status: "identity_unverified", resultCount: 0, warnings: ["version_scope_unresolved"] };
  }
  const candidates = wikidataIdentityCandidates({ identity: input.identity, versionScope: input.versionScope });
  if (candidates.length === 0) return { status: "identity_unverified", resultCount: 0, warnings: ["wikidata_mapping_unavailable"] };
  const warnings = new Set<string>();
  let lastProperty: string | undefined;
  for (const candidate of candidates) {
    lastProperty = candidate.propertyId;
    try {
      const query = await input.httpClient.request({
        sourceId: "wikidata", url: buildExactWikidataQueryUrl(candidate), method: "GET",
        headers: { userAgent: input.userAgent, apiUserAgent: input.userAgent, accept: "application/sparql-results+json, application/json", acceptEncoding: "gzip, deflate" },
        timeoutMs: 3_000, maxResponseBytes: WIKIDATA_JSON_MAX_BYTES, acceptedContentTypes: WDQS_JSON_TYPES,
        redirectPolicy: { mode: "manual", maxRedirects: 2 }, requestId: `wdqs-${candidate.registryKey}`, maxAttempts: 2, signal: input.signal,
      });
      if (query.status !== 200) return { status: "adapter_unavailable", propertyId: candidate.propertyId, resultCount: 0, warnings: [`wdqs_http_${query.status}`] };
      const decoded = decodeWikidataQueryResponse(query.body);
      decoded.warnings.forEach((warning) => warnings.add(warning));
      if (decoded.entityIds.length === 0) continue;
      if (decoded.entityIds.length > 1) return { status: "identity_ambiguous", propertyId: candidate.propertyId, resultCount: decoded.entityIds.length, warnings: [...warnings] };
      const entityId = decoded.entityIds[0];
      const entityResponse = await input.httpClient.request({
        sourceId: "wikidata", url: buildWikidataEntityUrl(entityId), method: "GET",
        headers: { userAgent: input.userAgent, apiUserAgent: input.userAgent, accept: "application/json", acceptEncoding: "gzip, deflate" },
        timeoutMs: 3_000, maxResponseBytes: WIKIDATA_JSON_MAX_BYTES, acceptedContentTypes: ACTION_API_JSON_TYPES,
        redirectPolicy: { mode: "manual", maxRedirects: 2 }, requestId: `wikidata-entity-${entityId}`, maxAttempts: 2, signal: input.signal,
      });
      if (entityResponse.status !== 200) return { status: "adapter_unavailable", propertyId: candidate.propertyId, resultCount: 1, warnings: [`wikidata_entity_http_${entityResponse.status}`] };
      const entity = decodeWikidataEntityResponse({ bytes: entityResponse.body, entityId, propertyId: candidate.propertyId });
      entity.warnings.forEach((warning) => warnings.add(warning));
      if (!entity.externalIds.includes(candidate.externalId)) {
        warnings.add("wikidata_external_id_mismatch");
        return { status: "identity_unverified", propertyId: candidate.propertyId, resultCount: 1, warnings: [...warnings] };
      }
      warnings.add("entity_media_type_inferred_from_property_scope");
      return {
        status: "verified", propertyId: candidate.propertyId, resultCount: 1, warnings: [...warnings],
        identity: {
          candidateCanonicalKey: input.identity.canonicalKey,
          versionScopeKey: input.versionScope.scopeKey,
          wikidataEntityId: entityId,
          matchedPropertyId: candidate.propertyId,
          matchedExternalId: candidate.externalId,
          verificationStatus: "verified",
          sitelinks: entity.sitelinks,
          otherSitelinkKeys: entity.otherSitelinkKeys,
          ...(entity.lastRevisionId ? { entityRevisionId: entity.lastRevisionId } : {}),
          ...(entity.modified ? { lastModified: entity.modified } : {}),
          resolvedAt: (input.now ?? (() => new Date()))().toISOString(),
          warnings: [...warnings],
        },
      };
    } catch (error) {
      if (input.signal?.aborted) return { status: "budget_exhausted", propertyId: candidate.propertyId, resultCount: 0, warnings: ["direct_source_budget_exhausted"] };
      if (error instanceof SecureResearchHttpError && ["security_rejected", "dns_security_rejected", "redirect_rejected"].includes(error.kind)) {
        return { status: "security_rejected", propertyId: candidate.propertyId, resultCount: 0, warnings: [error.reason] };
      }
      return { status: "adapter_unavailable", propertyId: candidate.propertyId, resultCount: 0, warnings: [error instanceof Error ? error.message : "wikidata_adapter_failure"] };
    }
  }
  return { status: "identity_not_found", ...(lastProperty ? { propertyId: lastProperty } : {}), resultCount: 0, warnings: [...warnings] };
}
