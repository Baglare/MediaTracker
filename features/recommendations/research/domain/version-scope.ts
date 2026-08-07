import { createCandidateCanonicalKey } from "../../providers/candidate-identity";
import type { RecommendationCandidateIdentity } from "../../providers/types";
import type { RecommendationDomainIssue, RecommendationMediaType } from "../../domain/types";
import type { ResearchScopeKind, ResearchVersionScope } from "./types";

const DETAIL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,159}$/;

function issue(code: string, path: string, message: string): RecommendationDomainIssue {
  return { code, path, message };
}

function exactIdentityValid(identity: RecommendationCandidateIdentity): boolean {
  try {
    return identity.verified === true
      && identity.canonicalKey === createCandidateCanonicalKey(identity.primaryProvider, identity.mediaType, identity.primaryExternalId);
  } catch {
    return false;
  }
}

export function researchScopeKey(input: {
  scopeKind: ResearchScopeKind;
  canonicalKey: string;
  seasonNumber?: number;
  installmentKey?: string;
  editionKey?: string;
}): string {
  const detail = input.scopeKind === "work"
    ? "work"
    : input.scopeKind === "season"
      ? `season-${input.seasonNumber}`
      : input.scopeKind === "installment"
        ? `installment-${encodeURIComponent(input.installmentKey ?? "")}`
        : `edition-${encodeURIComponent(input.editionKey ?? "")}`;
  return `research-scope:v1:${input.scopeKind}:${encodeURIComponent(input.canonicalKey)}:${detail}`;
}

export function createResearchVersionScope(input: {
  identity: RecommendationCandidateIdentity;
  scopeKind: ResearchScopeKind;
  parentIdentity?: RecommendationCandidateIdentity;
  seasonNumber?: number;
  installmentKey?: string;
  editionKey?: string;
}): ResearchVersionScope {
  if (!exactIdentityValid(input.identity)) throw new Error("research_scope_exact_identity_invalid");
  if (input.parentIdentity) throw new Error("research_scope_parent_relation_unavailable");

  const base = {
    version: 1 as const,
    canonicalKey: input.identity.canonicalKey,
    mediaType: input.identity.mediaType,
    sourceIdentityVerified: true as const,
  };
  if (input.scopeKind === "work") {
    if (input.seasonNumber !== undefined || input.installmentKey !== undefined || input.editionKey !== undefined) throw new Error("research_scope_work_fields_forbidden");
    return { ...base, scopeKind: "work", scopeKey: researchScopeKey({ scopeKind: "work", canonicalKey: base.canonicalKey }) };
  }
  if (input.scopeKind === "season") {
    if (!Number.isInteger(input.seasonNumber) || (input.seasonNumber ?? 0) <= 0 || input.installmentKey !== undefined || input.editionKey !== undefined) throw new Error("research_scope_season_fields_invalid");
    return { ...base, scopeKind: "season", seasonNumber: input.seasonNumber as number, scopeKey: researchScopeKey({ scopeKind: "season", canonicalKey: base.canonicalKey, seasonNumber: input.seasonNumber }) };
  }
  if (input.scopeKind === "installment") {
    if (!input.installmentKey || !DETAIL_PATTERN.test(input.installmentKey) || input.seasonNumber !== undefined || input.editionKey !== undefined) throw new Error("research_scope_installment_fields_invalid");
    return { ...base, scopeKind: "installment", installmentKey: input.installmentKey, scopeKey: researchScopeKey({ scopeKind: "installment", canonicalKey: base.canonicalKey, installmentKey: input.installmentKey }) };
  }
  if (input.identity.mediaType !== "book" || !input.editionKey || !DETAIL_PATTERN.test(input.editionKey) || input.seasonNumber !== undefined || input.installmentKey !== undefined) throw new Error("research_scope_edition_fields_invalid");
  const exactEdition = input.identity.secondaryIds.some((item) => item.kind === "openlibrary_edition" && item.externalId === input.editionKey);
  if (!exactEdition) throw new Error("research_scope_edition_identity_unverified");
  return { ...base, scopeKind: "edition", editionKey: input.editionKey, scopeKey: researchScopeKey({ scopeKind: "edition", canonicalKey: base.canonicalKey, editionKey: input.editionKey }) };
}

export function validateResearchVersionScope(input: {
  identity: RecommendationCandidateIdentity;
  scope: ResearchVersionScope;
}): { ok: true; value: ResearchVersionScope } | { ok: false; issues: RecommendationDomainIssue[] } {
  const issues: RecommendationDomainIssue[] = [];
  const { identity, scope } = input;
  if (!exactIdentityValid(identity)) issues.push(issue("research_scope_identity_invalid", "identity", "Exact ve doğrulanmış provider identity zorunludur."));
  if (scope.version !== 1) issues.push(issue("research_scope_version_invalid", "versionScope.version", "Research scope version=1 olmalıdır."));
  if (scope.sourceIdentityVerified !== true) issues.push(issue("research_scope_identity_unverified", "versionScope.sourceIdentityVerified", "Research scope yalnız doğrulanmış identity kullanır."));
  if (scope.canonicalKey !== identity.canonicalKey) issues.push(issue("research_scope_canonical_key_mismatch", "versionScope.canonicalKey", "Scope canonical key candidate identity ile exact eşleşmelidir."));
  if (scope.mediaType !== identity.mediaType) issues.push(issue("research_scope_media_type_mismatch", "versionScope.mediaType", "Scope media type candidate identity ile eşleşmelidir."));
  if (scope.parentCanonicalKey !== undefined) issues.push(issue("research_scope_parent_relation_unverified", "versionScope.parentCanonicalKey", "D7-R1 exact parent relation resolver taşımadığı için parentCanonicalKey kabul etmez."));

  const expected = researchScopeKey({
    scopeKind: scope.scopeKind,
    canonicalKey: scope.canonicalKey,
    seasonNumber: scope.scopeKind === "season" ? scope.seasonNumber : undefined,
    installmentKey: scope.scopeKind === "installment" ? scope.installmentKey : undefined,
    editionKey: scope.scopeKind === "edition" ? scope.editionKey : undefined,
  });
  if (scope.scopeKey !== expected) issues.push(issue("research_scope_key_invalid", "versionScope.scopeKey", "Scope key exact alanlardan deterministik türetilmelidir."));
  if (scope.scopeKind === "season" && (!Number.isInteger(scope.seasonNumber) || scope.seasonNumber <= 0)) issues.push(issue("research_scope_season_invalid", "versionScope.seasonNumber", "Season number pozitif tam sayı olmalıdır."));
  if (scope.scopeKind === "installment" && !DETAIL_PATTERN.test(scope.installmentKey)) issues.push(issue("research_scope_installment_invalid", "versionScope.installmentKey", "Installment key bounded exact ID olmalıdır."));
  if (scope.scopeKind === "edition") {
    if (scope.mediaType !== "book" || !DETAIL_PATTERN.test(scope.editionKey)) issues.push(issue("research_scope_edition_invalid", "versionScope.editionKey", "Edition yalnız book için bounded exact ID olabilir."));
    if (!identity.secondaryIds.some((item) => item.kind === "openlibrary_edition" && item.externalId === scope.editionKey)) issues.push(issue("research_scope_edition_identity_unverified", "versionScope.editionKey", "Edition key exact provider identity relation'ında bulunmalıdır."));
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: scope };
}

export function isResearchMediaType(value: unknown): value is RecommendationMediaType {
  return ["anime", "manga", "manhwa", "manhua", "tv", "movie", "book"].includes(String(value));
}
