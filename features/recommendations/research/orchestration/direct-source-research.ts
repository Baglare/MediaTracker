import "server-only";

import { fetchWikipediaDirectDocument } from "../adapters/wikipedia/document-adapter";
import { resolveWikipediaPage, selectVerifiedWikipediaSitelink } from "../adapters/wikipedia/page-resolver";
import { resolveExactWikidataIdentity } from "../adapters/wikidata/identity-resolver";
import { wikidataIdentityCandidates } from "../adapters/wikidata/external-id-registry";
import type { DirectSourceResearchInput, DirectSourceResearchResult, DirectSourceResearchTelemetry, ResolvedWikimediaIdentity } from "../adapters/types";
import { validateResearchVersionScope } from "../domain/version-scope";
import { readWikimediaResearchEnvironment } from "../network/environment";
import { emptyResearchNetworkTelemetry } from "../network/telemetry";
import { SecureResearchHttpError } from "../network/types";
import {
  WIKIMEDIA_IDENTITY_CACHE_TTL_MS,
  WIKIPEDIA_PAGE_METADATA_CACHE_TTL_MS,
  wikimediaIdentityCache,
  wikimediaIdentityCacheKey,
  wikipediaPageMetadataCache,
  wikipediaPageMetadataCacheKey,
} from "./direct-source-cache";

export const DIRECT_SOURCE_OPERATION_TIMEOUT_MS = 8_000;

function networkTelemetry(client: DirectSourceResearchInput["httpClient"]) {
  const snapshot = (client as { snapshotTelemetry?: () => ReturnType<typeof emptyResearchNetworkTelemetry> }).snapshotTelemetry;
  return typeof snapshot === "function" ? snapshot.call(client) : emptyResearchNetworkTelemetry();
}

function initialTelemetry(client: DirectSourceResearchInput["httpClient"]): DirectSourceResearchTelemetry {
  return {
    network: networkTelemetry(client), identityResultCount: 0, entityVerificationPassed: false,
    wikipediaSitelinkAvailable: false, revisionFetched: false, documentReady: false,
    identityCacheHit: false, pageCacheHit: false, coalesced: false,
  };
}

export async function researchDirectWikimediaSource(input: DirectSourceResearchInput): Promise<DirectSourceResearchResult> {
  const environment = readWikimediaResearchEnvironment(input.environment);
  const telemetry = initialTelemetry(input.httpClient);
  if (!environment.valid || !environment.userAgent) {
    return { status: "adapter_unavailable", documents: [], citations: [], telemetry, warnings: environment.warnings };
  }
  if (!validateResearchVersionScope({ identity: input.identity, scope: input.versionScope }).ok) {
    return { status: "identity_unverified", documents: [], citations: [], telemetry, warnings: ["version_scope_unresolved"] };
  }
  const candidates = wikidataIdentityCandidates({ identity: input.identity, versionScope: input.versionScope });
  if (candidates.length === 0) return { status: "identity_unverified", documents: [], citations: [], telemetry, warnings: ["wikidata_mapping_unavailable"] };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DIRECT_SOURCE_OPERATION_TIMEOUT_MS);
  let wikimediaIdentity: ResolvedWikimediaIdentity | undefined;
  const warnings = new Set<string>();
  try {
    const identityKey = wikimediaIdentityCacheKey(input.versionScope.scopeKey, candidates.map((candidate) => `${candidate.propertyId}:${candidate.externalId}`).join("|"));
    const cachedIdentity = await wikimediaIdentityCache.getOrLoad(identityKey, async () => {
      const resolution = await resolveExactWikidataIdentity({
        identity: input.identity, versionScope: input.versionScope, httpClient: input.httpClient,
        userAgent: environment.userAgent as string, signal: controller.signal, now: input.now,
      });
      telemetry.identityResultCount = resolution.resultCount;
      if (resolution.propertyId) telemetry.propertyId = resolution.propertyId;
      resolution.warnings.forEach((warning) => warnings.add(warning));
      if (resolution.status !== "verified") throw Object.assign(new Error(resolution.status), { resolution });
      telemetry.entityVerificationPassed = true;
      return resolution.identity;
    }, WIKIMEDIA_IDENTITY_CACHE_TTL_MS);
    wikimediaIdentity = cachedIdentity.value;
    telemetry.identityCacheHit = cachedIdentity.source === "cache";
    telemetry.coalesced ||= cachedIdentity.source === "coalesced";
    telemetry.propertyId = wikimediaIdentity.matchedPropertyId;
    telemetry.identityResultCount = 1;
    telemetry.entityVerificationPassed = true;
    wikimediaIdentity.warnings.forEach((warning) => warnings.add(warning));

    const sitelink = selectVerifiedWikipediaSitelink({ identity: wikimediaIdentity, policy: input.languagePolicy });
    telemetry.wikipediaSitelinkAvailable = Boolean(sitelink);
    if (!sitelink) return { status: "wikidata_only", wikimediaIdentity, documents: [], citations: [], telemetry: { ...telemetry, network: networkTelemetry(input.httpClient) }, warnings: [...warnings, "wikipedia_sitelink_unavailable"] };
    const pageKey = wikipediaPageMetadataCacheKey(wikimediaIdentity, sitelink.project);
    const cachedPage = await wikipediaPageMetadataCache.getOrLoad(pageKey, async () => {
      const resolved = await resolveWikipediaPage({
        identity: wikimediaIdentity as ResolvedWikimediaIdentity, httpClient: input.httpClient,
        userAgent: environment.userAgent as string, languagePolicy: input.languagePolicy, signal: controller.signal,
      });
      if (resolved.status !== "resolved") throw Object.assign(new Error(`wikipedia_${resolved.status}`), { pageResolution: resolved });
      return resolved.page;
    }, WIKIPEDIA_PAGE_METADATA_CACHE_TTL_MS);
    telemetry.pageCacheHit = cachedPage.source === "cache";
    telemetry.coalesced ||= cachedPage.source === "coalesced";
    telemetry.revisionFetched = true;
    cachedPage.value.warnings.forEach((warning) => warnings.add(warning));

    const direct = await fetchWikipediaDirectDocument({
      page: cachedPage.value, httpClient: input.httpClient, userAgent: environment.userAgent,
      now: input.now, signal: controller.signal,
    });
    if (direct.document.securityFlags.length > 0) {
      direct.document.securityFlags.forEach((flag) => warnings.add(flag));
      return { status: "security_rejected", wikimediaIdentity, documents: [], citations: [], telemetry: { ...telemetry, network: networkTelemetry(input.httpClient) }, warnings: [...warnings] };
    }
    telemetry.documentReady = true;
    return {
      status: "document_ready", wikimediaIdentity, documents: [direct.document], citations: [direct.citation],
      telemetry: { ...telemetry, network: networkTelemetry(input.httpClient) }, warnings: [...warnings],
    };
  } catch (error) {
    const tagged = error as { resolution?: { status?: DirectSourceResearchResult["status"]; warnings?: readonly string[] }; pageResolution?: { status?: string; warnings?: readonly string[] } };
    tagged.resolution?.warnings?.forEach((warning) => warnings.add(warning));
    tagged.pageResolution?.warnings?.forEach((warning) => warnings.add(warning));
    const securityFailure = error instanceof SecureResearchHttpError
      ? ["security_rejected", "dns_security_rejected", "redirect_rejected", "content_type_rejected", "oversized_content", "invalid_encoding"].includes(error.kind)
      : error instanceof Error && /revision_changed|identity_mismatch|control_character|oversized|document_invalid|citation_invalid/.test(error.message);
    const status = controller.signal.aborted ? "budget_exhausted"
      : tagged.resolution?.status ?? (securityFailure ? "security_rejected" : tagged.pageResolution ? (tagged.pageResolution.status === "security_rejected" ? "security_rejected" : "wikipedia_unavailable") : "adapter_unavailable");
    return {
      status, ...(wikimediaIdentity ? { wikimediaIdentity } : {}), documents: [], citations: [],
      telemetry: { ...telemetry, network: networkTelemetry(input.httpClient) },
      warnings: [...warnings, error instanceof Error ? error.message : "direct_source_adapter_failure"],
    };
  } finally {
    clearTimeout(timeout);
  }
}
