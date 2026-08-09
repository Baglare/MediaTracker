import "server-only";

import type { SecureResearchHttpClient } from "../network/types";
import { SecureResearchHttpClientImpl } from "../network/secure-http-client";
import { readWikimediaResearchEnvironment } from "../network/environment";
import { buildGroundedResearchPacket } from "../passages/packet-builder";
import type { ResearchPacketDocumentInput } from "../passages/types";
import { decodeResearchSourceAcquisitionRequest } from "./codec";
import { acquireDiscoveredWikipediaSource } from "./wikipedia-acquirer";
import { parseDiscoveredWikipediaArticleUrl } from "./wikipedia-url";
import { researchDocumentRevisionKey, resolveDirectResearchDocument, validateResolvedWikimediaScope } from "./source-resolver";
import { emptyResearchAcquisitionTelemetry } from "./telemetry";
import {
  RESEARCH_ACQUISITION_MAX_NETWORK_OPERATIONS,
  RESEARCH_ACQUISITION_OPERATION_TIMEOUT_MS,
  type AcquiredResearchSource,
  type RejectedResearchSource,
  type ResearchAcquisitionResult,
  type ResearchSourceAcquisitionRequest,
} from "./types";

export interface ResearchAcquisitionDependencies {
  httpClient?: SecureResearchHttpClient;
  environment?: NodeJS.ProcessEnv;
  now?: () => Date;
  monotonicNow?: () => number;
}

const pending = new Map<string, Promise<ResearchAcquisitionResult>>();

function failure(
  status: ResearchAcquisitionResult["status"],
  warnings: readonly string[],
  telemetry = emptyResearchAcquisitionTelemetry(),
  rejectedSources: readonly RejectedResearchSource[] = [],
): ResearchAcquisitionResult {
  return { status, acquiredSources: [], rejectedSources, telemetry, warnings };
}

function requestKey(request: ResearchSourceAcquisitionRequest): string {
  return JSON.stringify([
    request.versionScope.scopeKey, request.aspectId, request.role, request.minimumLevel ?? "",
    request.maxDocuments, request.maxPassages, request.maxPacketCharacters,
    ...request.directDocuments.map((item) => item.document.documentId),
    ...request.discoveredSources.map((item) => item.canonicalUrl),
    request.acquisitionPolicyVersion,
  ]);
}

function invalidRequestStatus(codes: readonly string[]): ResearchAcquisitionResult["status"] {
  if (codes.some((code) => /scope/.test(code))) return "version_scope_unresolved";
  if (codes.some((code) => /wikimedia_scope_mismatch/.test(code))) return "source_identity_mismatch";
  if (codes.some((code) => /direct_(?:payload|citation|relation)/.test(code))) return "security_rejected";
  return "source_policy_blocked";
}

async function executeResearchSourceAcquisition(request: ResearchSourceAcquisitionRequest, dependencies: ResearchAcquisitionDependencies): Promise<ResearchAcquisitionResult> {
  const telemetry = emptyResearchAcquisitionTelemetry();
  telemetry.directInputCount = request.directDocuments.length;
  telemetry.discoveredInputCount = request.discoveredSources.length;
  const warnings = new Set<string>();
  const rejectedSources: RejectedResearchSource[] = [];
  const documents: ResearchPacketDocumentInput[] = [];
  const acquiredSources: AcquiredResearchSource[] = [];
  const revisionKeys = new Set<string>();
  const canonicalDirectUrls = new Set<string>();
  const now = dependencies.now ?? (() => new Date());
  const monotonicNow = dependencies.monotonicNow ?? Date.now;
  const startedAt = monotonicNow();

  if (!validateResolvedWikimediaScope({
    identity: request.wikimediaIdentity,
    candidateCanonicalKey: request.candidateIdentity.canonicalKey,
    versionScopeKey: request.versionScope.scopeKey,
  })) return failure("version_scope_unresolved", ["wikimedia_identity_scope_unresolved"], telemetry);

  for (const envelope of request.directDocuments) {
    if (documents.length >= request.maxDocuments) break;
    const resolved = resolveDirectResearchDocument({ value: envelope, wikimediaIdentity: request.wikimediaIdentity });
    if (!resolved.ok) {
      rejectedSources.push({ sourceId: envelope.document.sourceId, canonicalUrl: envelope.document.canonicalUrl, reason: resolved.reason });
      warnings.add(resolved.reason);
      continue;
    }
    if (envelope.document.securityFlags.some((flag) => ["script_or_html_detected", "oversized_content", "source_identity_mismatch"].includes(flag))) {
      rejectedSources.push({ sourceId: envelope.document.sourceId, canonicalUrl: envelope.document.canonicalUrl, reason: "direct_document_security_rejected" });
      warnings.add("direct_document_security_rejected");
      continue;
    }
    const revisionKey = researchDocumentRevisionKey({ sourceId: envelope.document.sourceId, pageId: resolved.pageId, revisionId: resolved.revisionId });
    if (revisionKeys.has(revisionKey)) continue;
    revisionKeys.add(revisionKey);
    canonicalDirectUrls.add(envelope.document.canonicalUrl);
    documents.push({
      documentId: envelope.document.documentId, sourceId: "wikipedia", canonicalUrl: envelope.document.canonicalUrl,
      language: resolved.language, wikidataEntityId: resolved.wikidataEntityId, pageId: resolved.pageId,
      revisionId: resolved.revisionId, title: envelope.document.title, text: envelope.document.boundedText,
      citation: envelope.citation,
    });
    acquiredSources.push({
      sourceId: "wikipedia", canonicalUrl: envelope.document.canonicalUrl, language: resolved.language,
      wikidataEntityId: resolved.wikidataEntityId, pageId: resolved.pageId, revisionId: resolved.revisionId,
      documentId: envelope.document.documentId, contentHash: envelope.document.contentHash, acquisitionKind: "direct",
    });
    telemetry.qidMatchCount += 1;
    telemetry.revisionResultCount += 1;
  }

  const discoveredTargets = request.discoveredSources.map((source) => ({ source, parsed: parseDiscoveredWikipediaArticleUrl(source) }));
  for (const item of discoveredTargets) {
    if (!item.parsed.ok) {
      telemetry.rejectedUrlCount += 1;
      telemetry.registryRejectCount += 1;
      rejectedSources.push({ sourceId: item.source.sourceId, reason: item.parsed.reason });
    } else telemetry.acceptedUrlCount += 1;
  }
  const eligibleDiscovered = discoveredTargets.filter((item): item is typeof item & { parsed: Extract<typeof item.parsed, { ok: true }> } => item.parsed.ok)
    .filter((item) => {
      if (!canonicalDirectUrls.has(item.parsed.value.canonicalUrl)) return true;
      warnings.add("direct_discovered_duplicate");
      return false;
    });

  if (documents.length < request.maxDocuments && eligibleDiscovered.length > 0) {
    const environment = readWikimediaResearchEnvironment(dependencies.environment);
    if (!environment.valid || !environment.userAgent) {
      environment.warnings.forEach((warning) => warnings.add(warning));
      if (documents.length === 0) return failure("adapter_unavailable", [...warnings], telemetry, rejectedSources);
    } else {
      const httpClient = dependencies.httpClient ?? new SecureResearchHttpClientImpl();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), RESEARCH_ACQUISITION_OPERATION_TIMEOUT_MS);
      try {
        for (const target of eligibleDiscovered) {
          if (documents.length >= request.maxDocuments || telemetry.networkAcquisitionCount >= RESEARCH_ACQUISITION_MAX_NETWORK_OPERATIONS) break;
          telemetry.networkAcquisitionCount += 1;
          const acquired = await acquireDiscoveredWikipediaSource({
            source: target.source, wikimediaIdentity: request.wikimediaIdentity, httpClient,
            userAgent: environment.userAgent, now, signal: controller.signal,
          });
          acquired.warnings.forEach((warning) => warnings.add(warning));
          if (acquired.status !== "acquired") {
            if (acquired.status === "source_identity_mismatch") telemetry.qidMismatchCount += 1;
            if (acquired.warnings.some((warning) => warning.includes("page_missing"))) telemetry.missingPageCount += 1;
            if (acquired.warnings.some((warning) => warning.includes("disambiguation"))) telemetry.disambiguationCount += 1;
            rejectedSources.push({ sourceId: target.source.sourceId, canonicalUrl: target.parsed.value.canonicalUrl, reason: acquired.status });
            if (acquired.status === "budget_exhausted" && documents.length === 0) return failure("budget_exhausted", [...warnings], telemetry, rejectedSources);
            continue;
          }
          telemetry.cacheHitCount += acquired.pageCache === "cache" ? 1 : 0;
          telemetry.coalescedCount += acquired.pageCache === "coalesced" ? 1 : 0;
          const resolved = resolveDirectResearchDocument({ value: acquired.direct, wikimediaIdentity: request.wikimediaIdentity });
          if (!resolved.ok) {
            rejectedSources.push({ sourceId: "wikipedia", canonicalUrl: acquired.target.canonicalUrl, reason: resolved.reason });
            continue;
          }
          const revisionKey = researchDocumentRevisionKey({ sourceId: "wikipedia", pageId: acquired.pageId, revisionId: resolved.revisionId });
          if (revisionKeys.has(revisionKey)) { warnings.add("direct_discovered_revision_duplicate"); continue; }
          revisionKeys.add(revisionKey);
          documents.push({
            documentId: acquired.direct.document.documentId, sourceId: "wikipedia", canonicalUrl: acquired.direct.document.canonicalUrl,
            language: acquired.language, wikidataEntityId: request.wikimediaIdentity.wikidataEntityId,
            pageId: acquired.pageId, revisionId: resolved.revisionId, title: acquired.direct.document.title,
            text: acquired.direct.document.boundedText, citation: acquired.direct.citation,
          });
          acquiredSources.push({
            sourceId: "wikipedia", canonicalUrl: acquired.direct.document.canonicalUrl, language: acquired.language,
            wikidataEntityId: request.wikimediaIdentity.wikidataEntityId, pageId: acquired.pageId,
            revisionId: resolved.revisionId, documentId: acquired.direct.document.documentId,
            contentHash: acquired.direct.document.contentHash, acquisitionKind: "discovered",
          });
          telemetry.qidMatchCount += 1;
          telemetry.revisionResultCount += 1;
        }
      } finally { clearTimeout(timeout); }
    }
  }

  telemetry.acquisitionDurationMs = Math.max(0, monotonicNow() - startedAt);
  if (documents.length === 0) {
    if (telemetry.qidMismatchCount > 0) return failure("source_identity_mismatch", [...warnings], telemetry, rejectedSources);
    if (rejectedSources.some((item) => item.reason.includes("security"))) return failure("security_rejected", [...warnings], telemetry, rejectedSources);
    if (rejectedSources.some((item) => item.reason === "adapter_unavailable")) return failure("adapter_unavailable", [...warnings], telemetry, rejectedSources);
    if (rejectedSources.length > 0 && rejectedSources.every((item) => /policy|registry|url|query|host|path|title/.test(item.reason))) return failure("source_policy_blocked", [...warnings], telemetry, rejectedSources);
    return failure("no_eligible_source", [...warnings], telemetry, rejectedSources);
  }
  const built = await buildGroundedResearchPacket({
    candidateIdentity: request.candidateIdentity, versionScope: request.versionScope,
    aspectId: request.aspectId, role: request.role, ...(request.minimumLevel ? { minimumLevel: request.minimumLevel } : {}),
    documents, maxPassages: request.maxPassages, maxPacketCharacters: request.maxPacketCharacters,
    acquisitionPolicyVersion: request.acquisitionPolicyVersion, now,
  });
  Object.assign(telemetry, built.telemetry);
  built.warnings.forEach((warning) => warnings.add(warning));
  if (built.status !== "packet_ready") return { status: built.status, acquiredSources: [], rejectedSources, telemetry, warnings: [...warnings] };
  const normalizedHashes = new Map(built.packet.documents.map((document) => [document.documentId, document.contentHash]));
  return {
    status: "packet_ready", packet: built.packet,
    acquiredSources: acquiredSources.filter((source) => normalizedHashes.has(source.documentId)).map((source) => ({ ...source, contentHash: normalizedHashes.get(source.documentId) as string })),
    rejectedSources, telemetry, warnings: [...warnings],
  };
}

export async function acquireResearchSources(value: unknown, dependencies: ResearchAcquisitionDependencies = {}): Promise<ResearchAcquisitionResult> {
  const decoded = decodeResearchSourceAcquisitionRequest(value);
  if (!decoded.ok) {
    const codes = decoded.issues.map((item) => item.code);
    return failure(invalidRequestStatus(codes), codes);
  }
  const key = requestKey(decoded.value);
  const active = pending.get(key);
  if (active) {
    const result = await active;
    return { ...result, telemetry: { ...result.telemetry, coalescedCount: result.telemetry.coalescedCount + 1 } };
  }
  const operation = executeResearchSourceAcquisition(decoded.value, dependencies);
  pending.set(key, operation);
  try { return await operation; }
  finally { pending.delete(key); }
}
