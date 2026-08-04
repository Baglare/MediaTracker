import { strengthToLevel } from "./aspect-strength";
import type {
  AspectId,
  AspectStrengthLevel,
  EvidenceConfidence,
  EvidenceSourceKind,
  RecommendationProvider,
  SemanticVerifierMode,
} from "./types";

export type EvidenceClaimScope = "candidate_metadata" | "personal_fit";
export type EvidenceClaimValue = string | number | boolean | null;

export interface EvidenceClaim {
  id: string;
  sourceKind: EvidenceSourceKind;
  scope: EvidenceClaimScope;
  provider?: RecommendationProvider;
  field?: string;
  value?: EvidenceClaimValue;
  normalizedValue?: EvidenceClaimValue;
  reliability?: number;
  explanation?: string;
  observedAt?: string;
}

export interface AspectEvidence {
  aspectId: AspectId;
  strength: number | null;
  level: AspectStrengthLevel;
  confidence: EvidenceConfidence;
  sources: readonly EvidenceClaim[];
  supportingEvidence: readonly EvidenceClaim[];
  contradictoryEvidence: readonly EvidenceClaim[];
  verifierMode: SemanticVerifierMode;
  warnings: readonly string[];
}

export const STRUCTURED_EVIDENCE_SOURCE_KINDS: readonly EvidenceSourceKind[] = [
  "provider_genre",
  "provider_tag_rank",
  "provider_keyword",
  "provider_metadata",
];

export const SEMANTIC_EVIDENCE_SOURCE_KINDS: readonly EvidenceSourceKind[] = [
  "synopsis_classifier",
  "local_semantic_verifier",
  "remote_llm_verifier",
];

export function isStructuredEvidenceSource(kind: EvidenceSourceKind): boolean {
  return STRUCTURED_EVIDENCE_SOURCE_KINDS.includes(kind);
}

export function isSemanticEvidenceSource(kind: EvidenceSourceKind): boolean {
  return SEMANTIC_EVIDENCE_SOURCE_KINDS.includes(kind);
}

export function createUnknownAspectEvidence(
  aspectId: AspectId,
  warnings: readonly string[] = [],
): AspectEvidence {
  return {
    aspectId,
    strength: null,
    level: strengthToLevel(null),
    confidence: "unknown",
    sources: [],
    supportingEvidence: [],
    contradictoryEvidence: [],
    verifierMode: "structured_only",
    warnings: [...warnings],
  };
}

/**
 * Evidence yalnız domain contract'ıdır; bu helper aggregation yapmaz.
 * `level` her zaman strength'ten türetilir ve ikinci bir gerçek kaynağı olmaz.
 */
export function createAspectEvidence(input: Omit<AspectEvidence, "level">): AspectEvidence {
  return { ...input, level: strengthToLevel(input.strength) };
}
