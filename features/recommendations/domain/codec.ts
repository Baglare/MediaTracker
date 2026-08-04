import {
  ASPECT_IDS,
  ASPECT_REGISTRY,
  isAspectId,
  normalizeAspectAlias,
  type AspectId,
} from "./aspect-registry";
import { validateStrengthLevelPair } from "./aspect-strength";
import {
  canonicalizeAspectConstraints,
  canonicalizeObjectiveConstraints,
  type AspectConstraint,
  type LengthConstraint,
  type ObjectiveConstraint,
} from "./constraints";
import type { AspectEvidence, EvidenceClaim, EvidenceClaimValue } from "./evidence";
import { isSemanticEvidenceSource, isStructuredEvidenceSource } from "./evidence";
import { providerSupports } from "./providers";
import { validateLengthMediaTypeCompatibility } from "./policies";
import {
  ASPECT_GROUPS,
  ASPECT_STRENGTH_LEVELS,
  ASPECT_SUPPORT_LEVELS,
  CONSTRAINT_ROLES,
  CONSTRAINT_SOURCES,
  EVIDENCE_CONFIDENCES,
  EVIDENCE_SOURCE_KINDS,
  RECOMMENDATION_MEDIA_TYPES,
  RECOMMENDATION_PROVIDERS,
  RECOMMENDATION_STRICTNESS_VALUES,
  SEMANTIC_VERIFIER_MODES,
  type RecommendationDecodeResult,
  type RecommendationDomainIssue,
  type RecommendationMediaType,
  type RecommendationProvider,
  type RecommendationStrictness,
  type SemanticVerifierMode,
} from "./types";

export const RECOMMENDATION_REQUEST_VERSION = 2 as const;

export interface VerifiedRecommendationReference {
  state: "verified";
  titleSnapshot: string;
  mediaType: RecommendationMediaType;
  provider: RecommendationProvider;
  externalId: string;
}

export interface UnresolvedRecommendationReference {
  state: "unresolved";
  titleText: string;
  mediaType?: RecommendationMediaType;
}

export type RecommendationReference =
  | VerifiedRecommendationReference
  | UnresolvedRecommendationReference;

export interface RecommendationRequestV2 {
  version: typeof RECOMMENDATION_REQUEST_VERSION;
  queryText: string;
  targetMediaTypes: readonly RecommendationMediaType[];
  aspectConstraints: readonly AspectConstraint[];
  objectiveConstraints: readonly ObjectiveConstraint[];
  strictness: RecommendationStrictness;
  references: readonly RecommendationReference[];
  profileSignalsEnabled: boolean;
  semanticVerifierMode: SemanticVerifierMode;
  locale: string;
}

function issue(code: string, path: string, message: string): RecommendationDomainIssue {
  return { code, path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
): RecommendationDomainIssue[] {
  const known = new Set(allowed);
  return Object.keys(value)
    .filter((key) => !known.has(key))
    .map((key) => issue("unknown_field", `${path}.${key}`, "Bilinmeyen V2 domain alanı kabul edilmez."));
}

function asEnum<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  return typeof value === "string" && values.includes(value as T) ? value as T : undefined;
}

function nonEmptyString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

function isIsoInstant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function primitiveClaimValue(value: unknown): value is EvidenceClaimValue {
  return value === null || typeof value === "string" || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value));
}

export function validateAspectRegistry(): RecommendationDecodeResult<typeof ASPECT_REGISTRY> {
  const issues: RecommendationDomainIssue[] = [];
  if (ASPECT_IDS.length !== 43) {
    issues.push(issue("aspect_count_invalid", "$", `Registry 43 aspect içermeli; bulunan ${ASPECT_IDS.length}.`));
  }
  const ids = new Set<string>();
  const aliasesByLanguage = {
    tr: new Map<string, AspectId>(),
    en: new Map<string, AspectId>(),
  };
  for (const id of ASPECT_IDS) {
    const entry = ASPECT_REGISTRY[id];
    if (ids.has(entry.id)) issues.push(issue("aspect_id_duplicate", id, "Aspect ID tekrarlandı."));
    ids.add(entry.id);
    if (entry.id !== id) issues.push(issue("aspect_id_key_mismatch", id, "Registry key ile entry.id eşleşmiyor."));
    if (!ASPECT_GROUPS.includes(entry.group)) issues.push(issue("aspect_group_invalid", `${id}.group`, "Aspect group geçersiz."));
    if (!entry.labelTr.trim() || !entry.labelEn.trim()) issues.push(issue("aspect_label_missing", id, "Türkçe ve İngilizce label zorunludur."));
    if (!entry.descriptionTr.trim()) issues.push(issue("aspect_description_missing", `${id}.descriptionTr`, "Türkçe açıklama zorunludur."));
    for (const [language, aliases] of [["tr", entry.aliasesTr], ["en", entry.aliasesEn]] as const) {
      const aliasValues = aliases as readonly string[];
      if (aliasValues.length === 0) issues.push(issue("aspect_alias_missing", `${id}.aliases${language}`, "Alias listesi boş olamaz."));
      const local = new Set<string>();
      for (const alias of aliasValues) {
        const normalized = normalizeAspectAlias(alias);
        if (!normalized) issues.push(issue("aspect_alias_invalid", `${id}.aliases${language}`, "Boş normalize edilen alias kabul edilmez."));
        if (local.has(normalized)) issues.push(issue("aspect_alias_duplicate", `${id}.aliases${language}`, "Aynı kayıtta alias tekrarlandı."));
        local.add(normalized);
        const owner = aliasesByLanguage[language].get(normalized);
        if (owner && owner !== id) {
          issues.push(issue("aspect_alias_collision", `${id}.aliases${language}`, `Alias ${owner} ile çakışıyor.`));
        } else {
          aliasesByLanguage[language].set(normalized, id);
        }
      }
    }
    const supportedMediaTypes = entry.supportedMediaTypes as readonly RecommendationMediaType[];
    if (supportedMediaTypes.length === 0
      || supportedMediaTypes.some((mediaType) => !RECOMMENDATION_MEDIA_TYPES.includes(mediaType))) {
      issues.push(issue("aspect_media_type_invalid", `${id}.supportedMediaTypes`, "Desteklenen MediaType listesi geçersiz."));
    }
    const providerKeys = Object.keys(entry.providerSupport).sort();
    const expectedProviderKeys = [...RECOMMENDATION_PROVIDERS].sort();
    if (JSON.stringify(providerKeys) !== JSON.stringify(expectedProviderKeys)) {
      issues.push(issue("aspect_provider_mapping_incomplete", `${id}.providerSupport`, "Beş provider mapping'i explicit olmalıdır."));
    }
    for (const provider of RECOMMENDATION_PROVIDERS) {
      if (!ASPECT_SUPPORT_LEVELS.includes(entry.providerSupport[provider])) {
        issues.push(issue("aspect_support_level_invalid", `${id}.providerSupport.${provider}`, "Support level geçersiz."));
      }
    }
    const safetyValues: readonly string[] = ["safe", "conditional", "unsafe"];
    if (!safetyValues.includes(entry.mustSafety) || !safetyValues.includes(entry.avoidSafety)) {
      issues.push(issue("aspect_constraint_safety_invalid", id, "Must/avoid safety geçersiz."));
    }
    const verifierRequirements: readonly string[] = ["not_required", "recommended", "required_for_hard_decision"];
    if (!verifierRequirements.includes(entry.semanticVerifier)) {
      issues.push(issue("aspect_verifier_requirement_invalid", `${id}.semanticVerifier`, "Semantic verifier flag geçersiz."));
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, value: ASPECT_REGISTRY };
}

function decodeEvidenceClaim(value: unknown, path: string): RecommendationDecodeResult<EvidenceClaim> {
  if (!isRecord(value)) return { ok: false, issues: [issue("evidence_claim_invalid", path, "Evidence claim nesne olmalıdır.")] };
  const issues = unknownFields(value, [
    "id", "sourceKind", "scope", "provider", "field", "value", "normalizedValue",
    "reliability", "explanation", "observedAt",
  ], path);
  const id = nonEmptyString(value.id, 160);
  const sourceKind = asEnum(value.sourceKind, EVIDENCE_SOURCE_KINDS);
  const scope = asEnum(value.scope, ["candidate_metadata", "personal_fit"] as const);
  const provider = value.provider === undefined ? undefined : asEnum(value.provider, RECOMMENDATION_PROVIDERS);
  const field = value.field === undefined ? undefined : nonEmptyString(value.field, 160);
  const explanation = value.explanation === undefined ? undefined : nonEmptyString(value.explanation, 500);
  const reliability = value.reliability;
  if (!id) issues.push(issue("evidence_claim_id_invalid", `${path}.id`, "Claim id zorunludur."));
  if (!sourceKind) {
    const code = typeof value.sourceKind === "string" && /mock|hash/i.test(value.sourceKind)
      ? "evidence_source_forbidden"
      : "evidence_source_invalid";
    issues.push(issue(code, `${path}.sourceKind`, "Evidence source desteklenmiyor; mock/hash semantic evidence değildir."));
  }
  if (!scope) issues.push(issue("evidence_scope_invalid", `${path}.scope`, "Evidence scope geçersiz."));
  if (value.provider !== undefined && !provider) issues.push(issue("evidence_provider_invalid", `${path}.provider`, "Evidence provider geçersiz."));
  if (value.field !== undefined && !field) issues.push(issue("evidence_field_invalid", `${path}.field`, "Evidence field geçersiz."));
  if (value.explanation !== undefined && !explanation) issues.push(issue("evidence_explanation_invalid", `${path}.explanation`, "Evidence açıklaması geçersiz."));
  if (value.value !== undefined && !primitiveClaimValue(value.value)) issues.push(issue("evidence_value_invalid", `${path}.value`, "Evidence value primitive olmalıdır."));
  if (value.normalizedValue !== undefined && !primitiveClaimValue(value.normalizedValue)) issues.push(issue("evidence_normalized_value_invalid", `${path}.normalizedValue`, "Normalized evidence value primitive olmalıdır."));
  if (reliability !== undefined && (typeof reliability !== "number" || !Number.isFinite(reliability) || reliability < 0 || reliability > 1)) {
    issues.push(issue("evidence_reliability_invalid", `${path}.reliability`, "Reliability 0-1 arasında finite olmalıdır."));
  }
  if (value.observedAt !== undefined && !isIsoInstant(value.observedAt)) {
    issues.push(issue("evidence_observed_at_invalid", `${path}.observedAt`, "observedAt canonical ISO instant olmalıdır."));
  }
  if (sourceKind && isStructuredEvidenceSource(sourceKind) && !provider) {
    issues.push(issue("structured_evidence_provider_required", `${path}.provider`, "Structured provider evidence provider taşımalıdır."));
  }
  if (sourceKind === "user_feedback") {
    if (scope !== "personal_fit") issues.push(issue("user_feedback_scope_invalid", `${path}.scope`, "User feedback yalnız personal_fit scope'undadır."));
    if (provider) issues.push(issue("user_feedback_provider_forbidden", `${path}.provider`, "User feedback provider metadata değildir."));
  } else if (scope === "personal_fit") {
    issues.push(issue("personal_fit_source_invalid", `${path}.scope`, "Yalnız user_feedback personal_fit evidence olabilir."));
  }
  if (issues.length || !id || !sourceKind || !scope) return { ok: false, issues };
  return {
    ok: true,
    value: {
      id,
      sourceKind,
      scope,
      ...(provider ? { provider } : {}),
      ...(field ? { field } : {}),
      ...(value.value !== undefined ? { value: value.value as EvidenceClaimValue } : {}),
      ...(value.normalizedValue !== undefined ? { normalizedValue: value.normalizedValue as EvidenceClaimValue } : {}),
      ...(typeof reliability === "number" ? { reliability } : {}),
      ...(explanation ? { explanation } : {}),
      ...(typeof value.observedAt === "string" ? { observedAt: value.observedAt } : {}),
    },
  };
}

function decodeClaimList(value: unknown, path: string): RecommendationDecodeResult<EvidenceClaim[]> {
  if (!Array.isArray(value)) return { ok: false, issues: [issue("evidence_claims_invalid", path, "Evidence claim listesi olmalıdır.")] };
  const issues: RecommendationDomainIssue[] = [];
  const claims: EvidenceClaim[] = [];
  const ids = new Set<string>();
  value.forEach((entry, index) => {
    const decoded = decodeEvidenceClaim(entry, `${path}.${index}`);
    if (!decoded.ok) {
      issues.push(...decoded.issues);
      return;
    }
    if (ids.has(decoded.value.id)) {
      issues.push(issue("evidence_claim_id_duplicate", `${path}.${index}.id`, "Evidence claim ID tekrarlandı."));
      return;
    }
    ids.add(decoded.value.id);
    claims.push(decoded.value);
  });
  return issues.length ? { ok: false, issues } : { ok: true, value: claims };
}

export function decodeAspectEvidence(value: unknown): RecommendationDecodeResult<AspectEvidence> {
  if (!isRecord(value)) return { ok: false, issues: [issue("aspect_evidence_invalid", "$", "AspectEvidence nesne olmalıdır.")] };
  const issues = unknownFields(value, [
    "aspectId", "strength", "level", "confidence", "sources", "supportingEvidence",
    "contradictoryEvidence", "verifierMode", "warnings",
  ], "$" );
  const aspectId = isAspectId(value.aspectId) ? value.aspectId : undefined;
  const confidence = asEnum(value.confidence, EVIDENCE_CONFIDENCES);
  const verifierMode = asEnum(value.verifierMode, SEMANTIC_VERIFIER_MODES);
  const strengthLevel = validateStrengthLevelPair(value.strength, value.level, "$" );
  const sources = decodeClaimList(value.sources, "sources");
  const supporting = decodeClaimList(value.supportingEvidence, "supportingEvidence");
  const contradictory = decodeClaimList(value.contradictoryEvidence, "contradictoryEvidence");
  const warnings = Array.isArray(value.warnings)
    && value.warnings.every((entry) => typeof entry === "string" && entry.length <= 500)
    ? value.warnings as string[]
    : undefined;
  if (!aspectId) issues.push(issue("aspect_id_unknown", "aspectId", "Aspect ID registry'de bulunmuyor."));
  if (!confidence) issues.push(issue("evidence_confidence_invalid", "confidence", "Evidence confidence geçersiz."));
  if (!verifierMode) issues.push(issue("verifier_mode_invalid", "verifierMode", "Verifier mode geçersiz."));
  if (!strengthLevel.ok) issues.push(...strengthLevel.issues);
  if (!sources.ok) issues.push(...sources.issues);
  if (!supporting.ok) issues.push(...supporting.issues);
  if (!contradictory.ok) issues.push(...contradictory.issues);
  if (!warnings) issues.push(issue("evidence_warnings_invalid", "warnings", "Warnings string listesi olmalıdır."));
  if (sources.ok && supporting.ok && contradictory.ok) {
    const sourceIds = new Set(sources.value.map((claim) => claim.id));
    const supportingIds = new Set(supporting.value.map((claim) => claim.id));
    for (const claim of [...supporting.value, ...contradictory.value]) {
      if (!sourceIds.has(claim.id)) issues.push(issue("evidence_claim_not_in_sources", claim.id, "Supporting/contradictory claim sources içinde olmalıdır."));
    }
    for (const claim of contradictory.value) {
      if (supportingIds.has(claim.id)) issues.push(issue("evidence_claim_role_conflict", claim.id, "Claim hem supporting hem contradictory olamaz."));
    }
    if (confidence === "high" && supporting.value.length === 0) {
      issues.push(issue("high_confidence_without_evidence", "confidence", "Boş supporting evidence high confidence üretemez."));
    }
    const semanticKinds = sources.value.filter((claim) => isSemanticEvidenceSource(claim.sourceKind));
    if (verifierMode === "structured_only" && semanticKinds.length > 0) {
      issues.push(issue("semantic_evidence_mode_mismatch", "verifierMode", "Structured-only sonuç semantic verifier claim taşıyamaz."));
    }
    if (semanticKinds.some((claim) => claim.sourceKind === "remote_llm_verifier") && verifierMode !== "remote_enhanced") {
      issues.push(issue("remote_evidence_mode_mismatch", "verifierMode", "Remote verifier claim remote_enhanced mode gerektirir."));
    }
    if (semanticKinds.some((claim) => claim.sourceKind === "local_semantic_verifier" || claim.sourceKind === "synopsis_classifier")
      && verifierMode === "structured_only") {
      issues.push(issue("local_evidence_mode_mismatch", "verifierMode", "Local semantic claim enhanced mode gerektirir."));
    }
    const metadataClaims = sources.value.filter((claim) => claim.scope === "candidate_metadata");
    if (metadataClaims.length === 0 && strengthLevel.ok && strengthLevel.value.level !== "unknown") {
      issues.push(issue("personal_fit_not_aspect_evidence", "sources", "User feedback provider/aspect metadata sonucu üretemez."));
    }
    if (aspectId && strengthLevel.ok && strengthLevel.value.level !== "unknown") {
      const hasSupportedProvider = metadataClaims.some((claim) => claim.provider
        && ASPECT_REGISTRY[aspectId].providerSupport[claim.provider] !== "unsupported");
      const hasSemantic = metadataClaims.some((claim) => isSemanticEvidenceSource(claim.sourceKind));
      if (!hasSupportedProvider && !hasSemantic) {
        issues.push(issue("unsupported_aspect_must_be_unknown", "level", "Unsupported aspect için absent veya pozitif strength üretilemez; unknown kullanılmalıdır."));
      }
    }
  }
  if (strengthLevel.ok && strengthLevel.value.level === "unknown" && confidence && confidence !== "unknown") {
    issues.push(issue("unknown_confidence_mismatch", "confidence", "Unknown level confidence=unknown taşımalıdır."));
  }
  if (issues.length || !aspectId || !confidence || !verifierMode || !strengthLevel.ok
    || !sources.ok || !supporting.ok || !contradictory.ok || !warnings) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    value: {
      aspectId,
      strength: strengthLevel.value.strength,
      level: strengthLevel.value.level,
      confidence,
      sources: sources.value,
      supportingEvidence: supporting.value,
      contradictoryEvidence: contradictory.value,
      verifierMode,
      warnings,
    },
  };
}

export function decodeAspectConstraint(value: unknown, path = "constraint"): RecommendationDecodeResult<AspectConstraint> {
  if (!isRecord(value)) return { ok: false, issues: [issue("aspect_constraint_invalid", path, "Aspect constraint nesne olmalıdır.")] };
  const issues = unknownFields(value, [
    "kind", "id", "aspectId", "role", "source", "minimumLevel", "rejectAtLevel", "minimumConfidence", "rationale",
  ], path);
  const id = nonEmptyString(value.id, 160);
  const aspectId = isAspectId(value.aspectId) ? value.aspectId : undefined;
  const role = asEnum(value.role, CONSTRAINT_ROLES);
  const source = asEnum(value.source, CONSTRAINT_SOURCES);
  const minimumLevel = value.minimumLevel === undefined
    ? undefined : asEnum(value.minimumLevel, ASPECT_STRENGTH_LEVELS.filter((item) => item !== "unknown"));
  const rejectAtLevel = value.rejectAtLevel === undefined
    ? undefined : asEnum(value.rejectAtLevel, ["primary", "significant", "incidental"] as const);
  const minimumConfidence = value.minimumConfidence === undefined
    ? undefined : asEnum(value.minimumConfidence, ["high", "medium", "low"] as const);
  const rationale = value.rationale === undefined ? undefined : nonEmptyString(value.rationale, 500);
  if (value.kind !== "aspect") issues.push(issue("constraint_kind_invalid", `${path}.kind`, "Aspect constraint kind=aspect olmalıdır."));
  if (!id) issues.push(issue("constraint_id_invalid", `${path}.id`, "Constraint id geçersiz."));
  if (!aspectId) issues.push(issue("aspect_id_unknown", `${path}.aspectId`, "Aspect ID registry'de bulunmuyor."));
  if (!role) issues.push(issue("constraint_role_invalid", `${path}.role`, "Constraint role geçersiz."));
  if (!source) issues.push(issue("constraint_source_invalid", `${path}.source`, "Constraint source geçersiz."));
  if (value.minimumLevel !== undefined && !minimumLevel) issues.push(issue("minimum_level_invalid", `${path}.minimumLevel`, "minimumLevel geçersiz."));
  if (value.rejectAtLevel !== undefined && !rejectAtLevel) issues.push(issue("reject_level_invalid", `${path}.rejectAtLevel`, "rejectAtLevel geçersiz."));
  if (value.minimumConfidence !== undefined && !minimumConfidence) issues.push(issue("minimum_confidence_invalid", `${path}.minimumConfidence`, "minimumConfidence geçersiz."));
  if (value.rationale !== undefined && !rationale) issues.push(issue("constraint_rationale_invalid", `${path}.rationale`, "Rationale geçersiz."));
  if (issues.length || !id || !aspectId || !role || !source) return { ok: false, issues };
  const canonical = canonicalizeAspectConstraints([{
    kind: "aspect", id, aspectId, role, source,
    ...(minimumLevel ? { minimumLevel } : {}),
    ...(rejectAtLevel ? { rejectAtLevel } : {}),
    ...(minimumConfidence ? { minimumConfidence } : {}),
    ...(rationale ? { rationale } : {}),
  }]);
  return canonical.ok ? { ok: true, value: canonical.value[0] } : canonical;
}

export function decodeObjectiveConstraint(value: unknown, path = "constraint"): RecommendationDecodeResult<ObjectiveConstraint> {
  if (!isRecord(value)) return { ok: false, issues: [issue("objective_constraint_invalid", path, "Objective constraint nesne olmalıdır.")] };
  const commonAllowed = ["kind", "id", "role", "source", "field", "operator"];
  const field = value.field;
  const allowed = field === "length"
    ? [...commonAllowed, "unit", "value", "min", "max"]
    : field === "release_year"
      ? [...commonAllowed, "value", "min", "max"]
      : [...commonAllowed, "value"];
  const issues = unknownFields(value, allowed, path);
  const id = nonEmptyString(value.id, 160);
  const role = asEnum(value.role, CONSTRAINT_ROLES);
  const source = asEnum(value.source, CONSTRAINT_SOURCES);
  if (value.kind !== "objective") issues.push(issue("constraint_kind_invalid", `${path}.kind`, "Objective constraint kind=objective olmalıdır."));
  if (!id) issues.push(issue("constraint_id_invalid", `${path}.id`, "Constraint id geçersiz."));
  if (!role) issues.push(issue("constraint_role_invalid", `${path}.role`, "Constraint role geçersiz."));
  if (!source) issues.push(issue("constraint_source_invalid", `${path}.source`, "Constraint source geçersiz."));
  let constraint: ObjectiveConstraint | undefined;
  if (id && role && source && field === "media_type") {
    const mediaType = asEnum(value.value, RECOMMENDATION_MEDIA_TYPES);
    if (!mediaType) issues.push(issue("media_type_invalid", `${path}.value`, "Media type desteklenmiyor."));
    if (mediaType) constraint = { kind: "objective", id, role, source, field, operator: value.operator as "eq", value: mediaType };
  } else if (id && role && source && field === "length") {
    constraint = {
      kind: "objective", id, role, source, field,
      unit: value.unit as LengthConstraint["unit"],
      operator: value.operator as LengthConstraint["operator"],
      ...(value.value !== undefined ? { value: value.value as number } : {}),
      ...(value.min !== undefined ? { min: value.min as number } : {}),
      ...(value.max !== undefined ? { max: value.max as number } : {}),
    };
  } else if (id && role && source && field === "release_year") {
    constraint = {
      kind: "objective", id, role, source, field,
      operator: value.operator as "eq" | "lte" | "gte" | "between",
      ...(value.value !== undefined ? { value: value.value as number } : {}),
      ...(value.min !== undefined ? { min: value.min as number } : {}),
      ...(value.max !== undefined ? { max: value.max as number } : {}),
    };
  } else if (id && role && source
    && (field === "release_status" || field === "format" || field === "language" || field === "country")) {
    constraint = { kind: "objective", id, role, source, field, operator: value.operator as "eq", value: value.value as string };
  } else if (!(field === "media_type" || field === "length" || field === "release_year"
    || field === "release_status" || field === "format" || field === "language" || field === "country")) {
    issues.push(issue("objective_field_invalid", `${path}.field`, "Objective field desteklenmiyor."));
  }
  if (issues.length || !constraint) return { ok: false, issues };
  const canonical = canonicalizeObjectiveConstraints([constraint]);
  return canonical.ok ? { ok: true, value: canonical.value[0] } : canonical;
}

function decodeReference(value: unknown, path: string): RecommendationDecodeResult<RecommendationReference> {
  if (!isRecord(value)) return { ok: false, issues: [issue("reference_invalid", path, "Reference nesne olmalıdır.")] };
  if (value.state === "verified") {
    const issues = unknownFields(value, ["state", "titleSnapshot", "mediaType", "provider", "externalId"], path);
    const titleSnapshot = nonEmptyString(value.titleSnapshot, 300);
    const mediaType = asEnum(value.mediaType, RECOMMENDATION_MEDIA_TYPES);
    const provider = asEnum(value.provider, RECOMMENDATION_PROVIDERS);
    const externalId = nonEmptyString(value.externalId, 240);
    if (!titleSnapshot) issues.push(issue("reference_title_invalid", `${path}.titleSnapshot`, "Verified reference title snapshot taşımalıdır."));
    if (!mediaType) issues.push(issue("reference_media_type_invalid", `${path}.mediaType`, "Reference media type geçersiz."));
    if (!provider) issues.push(issue("reference_provider_invalid", `${path}.provider`, "Verified reference provider taşımalıdır."));
    if (!externalId) issues.push(issue("reference_external_id_invalid", `${path}.externalId`, "Verified reference externalId taşımalıdır."));
    if (provider && mediaType && !providerSupports(provider, "identity", mediaType)) {
      issues.push(issue("reference_provider_media_type_unsupported", `${path}.mediaType`, "Provider bu media type identity'sini desteklemiyor."));
    }
    return issues.length || !titleSnapshot || !mediaType || !provider || !externalId
      ? { ok: false, issues }
      : { ok: true, value: { state: "verified", titleSnapshot, mediaType, provider, externalId } };
  }
  if (value.state === "unresolved") {
    const issues = unknownFields(value, ["state", "titleText", "mediaType"], path);
    const titleText = nonEmptyString(value.titleText, 300);
    const mediaType = value.mediaType === undefined ? undefined : asEnum(value.mediaType, RECOMMENDATION_MEDIA_TYPES);
    if (!titleText) issues.push(issue("unresolved_reference_title_invalid", `${path}.titleText`, "Unresolved reference doğal dil başlığı taşımalıdır."));
    if (value.mediaType !== undefined && !mediaType) issues.push(issue("reference_media_type_invalid", `${path}.mediaType`, "Reference media type geçersiz."));
    return issues.length || !titleText
      ? { ok: false, issues }
      : { ok: true, value: { state: "unresolved", titleText, ...(mediaType ? { mediaType } : {}) } };
  }
  return { ok: false, issues: [issue("reference_state_invalid", `${path}.state`, "Reference state verified veya unresolved olmalıdır.")] };
}

export function decodeRecommendationRequestV2(value: unknown): RecommendationDecodeResult<RecommendationRequestV2> {
  if (!isRecord(value)) return { ok: false, issues: [issue("request_invalid", "$", "RecommendationRequestV2 nesne olmalıdır.")] };
  const issues = unknownFields(value, [
    "version", "queryText", "targetMediaTypes", "aspectConstraints", "objectiveConstraints",
    "strictness", "references", "profileSignalsEnabled", "semanticVerifierMode", "locale",
  ], "$" );
  const queryText = nonEmptyString(value.queryText, 4000);
  const strictness = asEnum(value.strictness, RECOMMENDATION_STRICTNESS_VALUES);
  const verifierMode = asEnum(value.semanticVerifierMode, SEMANTIC_VERIFIER_MODES);
  const locale = nonEmptyString(value.locale, 40);
  if (value.version !== RECOMMENDATION_REQUEST_VERSION) issues.push(issue("request_version_unsupported", "version", "Yalnız RecommendationRequestV2 version=2 desteklenir."));
  if (!queryText) issues.push(issue("request_query_invalid", "queryText", "Mevcut ürün davranışıyla uyumlu olarak boş query kabul edilmez."));
  if (!strictness) issues.push(issue("strictness_invalid", "strictness", "Strictness değeri geçersiz."));
  if (!verifierMode) issues.push(issue("verifier_mode_invalid", "semanticVerifierMode", "Semantic verifier mode geçersiz."));
  if (!locale || !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)) issues.push(issue("locale_invalid", "locale", "Locale BCP-47 benzeri non-empty değer olmalıdır."));
  if (typeof value.profileSignalsEnabled !== "boolean") issues.push(issue("profile_signals_invalid", "profileSignalsEnabled", "profileSignalsEnabled boolean olmalıdır."));

  const targetMediaTypes: RecommendationMediaType[] = [];
  if (!Array.isArray(value.targetMediaTypes)) {
    issues.push(issue("target_media_types_invalid", "targetMediaTypes", "Target media types liste olmalıdır."));
  } else {
    for (const [index, entry] of value.targetMediaTypes.entries()) {
      const mediaType = asEnum(entry, RECOMMENDATION_MEDIA_TYPES);
      if (!mediaType) issues.push(issue("target_media_type_invalid", `targetMediaTypes.${index}`, "Media type desteklenmiyor."));
      else if (!targetMediaTypes.includes(mediaType)) targetMediaTypes.push(mediaType);
    }
  }

  const rawAspectConstraints: AspectConstraint[] = [];
  if (!Array.isArray(value.aspectConstraints)) {
    issues.push(issue("aspect_constraints_invalid", "aspectConstraints", "Aspect constraints liste olmalıdır."));
  } else {
    value.aspectConstraints.forEach((entry, index) => {
      const decoded = decodeAspectConstraint(entry, `aspectConstraints.${index}`);
      if (decoded.ok) rawAspectConstraints.push(decoded.value);
      else issues.push(...decoded.issues);
    });
  }
  const aspectConstraints = canonicalizeAspectConstraints(rawAspectConstraints);
  if (!aspectConstraints.ok) issues.push(...aspectConstraints.issues);

  const rawObjectiveConstraints: ObjectiveConstraint[] = [];
  if (!Array.isArray(value.objectiveConstraints)) {
    issues.push(issue("objective_constraints_invalid", "objectiveConstraints", "Objective constraints liste olmalıdır."));
  } else {
    value.objectiveConstraints.forEach((entry, index) => {
      const decoded = decodeObjectiveConstraint(entry, `objectiveConstraints.${index}`);
      if (decoded.ok) rawObjectiveConstraints.push(decoded.value);
      else issues.push(...decoded.issues);
    });
  }
  const objectiveConstraints = canonicalizeObjectiveConstraints(rawObjectiveConstraints);
  if (!objectiveConstraints.ok) issues.push(...objectiveConstraints.issues);
  if (objectiveConstraints.ok) {
    objectiveConstraints.value.forEach((constraint) => {
      if (constraint.field !== "length") return;
      const compatibility = validateLengthMediaTypeCompatibility(constraint, targetMediaTypes);
      if (!compatibility.ok) issues.push(...compatibility.issues);
    });
  }

  const references: RecommendationReference[] = [];
  if (!Array.isArray(value.references)) {
    issues.push(issue("references_invalid", "references", "References liste olmalıdır."));
  } else {
    value.references.forEach((entry, index) => {
      const decoded = decodeReference(entry, `references.${index}`);
      if (decoded.ok) references.push(decoded.value);
      else issues.push(...decoded.issues);
    });
  }

  if (issues.length || !queryText || !strictness || !verifierMode || !locale
    || typeof value.profileSignalsEnabled !== "boolean" || !aspectConstraints.ok || !objectiveConstraints.ok) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    value: {
      version: RECOMMENDATION_REQUEST_VERSION,
      queryText,
      targetMediaTypes,
      aspectConstraints: aspectConstraints.value,
      objectiveConstraints: objectiveConstraints.value,
      strictness,
      references,
      profileSignalsEnabled: value.profileSignalsEnabled,
      semanticVerifierMode: verifierMode,
      locale,
    },
  };
}
