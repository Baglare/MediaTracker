import { ASPECT_IDS, ASPECT_REGISTRY, evidenceStrategyForProvider, type AspectId } from "../domain/aspect-registry";
import { createAspectEvidence, createUnknownAspectEvidence, type AspectEvidence, type EvidenceClaim } from "../domain/evidence";
import type { SemanticVerifierMode } from "../domain/types";
import type { CandidateProviderEvidenceSnapshot } from "../providers/types";
import { normalizeRawEvidenceClaims } from "./claim-normalizer";
import { deriveEvidenceConfidence } from "./confidence";
import type { NormalizedEvidenceContribution } from "./claim-normalizer";
import { rankedTagPolicyFor } from "./ranked-tag-policy";
import type { EvidenceConfidence } from "../domain/types";

export const STRUCTURED_EVIDENCE_POLICY = {
  strongCoreGenre: {
    genreFloor: 0.55,
    mediumTagRank: 40,
    highTagRank: 75,
    genreWithMediumTagFloor: 0.68,
    genreWithHighTagFloor: 0.78,
  },
} as const;

export interface SemanticEvidenceBundle {
  mode: Exclude<SemanticVerifierMode, "structured_only">;
  supporting: Readonly<Partial<Record<AspectId, readonly EvidenceClaim[]>>>;
  contradictory: Readonly<Partial<Record<AspectId, readonly EvidenceClaim[]>>>;
  warnings: readonly string[];
}

function boundedNoisyOr(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => b - a).slice(0, 4);
  return Math.min(0.95, sorted.reduce((total, value) => 1 - ((1 - total) * (1 - value)), 0));
}

function supportCap(id: AspectId, provider: CandidateProviderEvidenceSnapshot["candidateIdentity"]["primaryProvider"]): number {
  switch (ASPECT_REGISTRY[id].providerSupport[provider]) {
    case "strong": return 0.9;
    case "partial": return 0.74;
    case "experimental": return 0.49;
    case "unsupported": return 0;
  }
}

function tagRankForClaim(
  snapshot: CandidateProviderEvidenceSnapshot,
  contribution: NormalizedEvidenceContribution,
): number | null {
  if (contribution.claim.sourceKind !== "provider_tag_rank") return null;
  const claimValue = String(contribution.claim.value ?? "").trim().toLocaleLowerCase("en-US");
  const tag = snapshot.objectiveMetadata.tags?.find((entry) => entry.name.trim().toLocaleLowerCase("en-US") === claimValue);
  return typeof tag?.rank === "number" && Number.isFinite(tag.rank) ? tag.rank : null;
}

export function applyStructuredEvidencePolicy(input: {
  aspectId: AspectId;
  snapshot: CandidateProviderEvidenceSnapshot;
  structured: readonly NormalizedEvidenceContribution[];
  strength: number;
}): number {
  const registryEntry = ASPECT_REGISTRY[input.aspectId];
  const rankedTags = input.structured.flatMap((item) => {
    const provider = item.claim.provider ?? input.snapshot.candidateIdentity.primaryProvider;
    if (evidenceStrategyForProvider(input.aspectId, provider) !== "ranked_tag") return [];
    const rank = tagRankForClaim(input.snapshot, item);
    return rank === null ? [] : [{ item, provider, rank }];
  });
  if (rankedTags.length > 0) {
    const strongest = [...rankedTags].sort((a, b) => b.rank - a.rank)[0];
    const hasIndependentStrongClaim = input.structured.some((item) => {
      const provider = item.claim.provider ?? input.snapshot.candidateIdentity.primaryProvider;
      return item !== strongest.item
        && item.contribution >= 0.4
        && `${provider}:${item.claim.sourceKind}:${item.claim.field ?? "-"}`
          !== `${strongest.provider}:${strongest.item.claim.sourceKind}:${strongest.item.claim.field ?? "-"}`;
    });
    const policy = rankedTagPolicyFor(strongest.rank, hasIndependentStrongClaim);
    if (policy.included) {
      const strength = Math.max(input.strength, policy.strengthFloor);
      return hasIndependentStrongClaim ? strength : Math.min(0.74, strength);
    }
  }
  const allSoftOnly = input.structured.length > 0 && input.structured.every((item) => {
    const provider = item.claim.provider ?? input.snapshot.candidateIdentity.primaryProvider;
    return evidenceStrategyForProvider(input.aspectId, provider) === "soft_only";
  });
  if (allSoftOnly) {
    const tmdbKeywords = new Set(input.structured.flatMap((item) => item.claim.provider === "tmdb"
      && item.claim.sourceKind === "provider_keyword"
      ? [String(item.claim.normalizedValue ?? item.claim.value ?? "")]
      : []));
    return tmdbKeywords.size >= 2 ? Math.max(input.strength, 0.55) : Math.min(input.strength, 0.49);
  }
  if (registryEntry.group !== "core" || registryEntry.defaultEvidenceStrategy !== "exact_taxonomy") return input.strength;
  const strongGenreProviders = new Set(input.structured.flatMap((item) => {
    const provider = item.claim.provider ?? input.snapshot.candidateIdentity.primaryProvider;
    return item.claim.sourceKind === "provider_genre" && registryEntry.providerSupport[provider] === "strong"
      ? [provider]
      : [];
  }));
  if (strongGenreProviders.size === 0) return input.strength;
  const strongestTagRank = input.structured.reduce<number | null>((strongest, item) => {
    const provider = item.claim.provider ?? input.snapshot.candidateIdentity.primaryProvider;
    if (!strongGenreProviders.has(provider)) return strongest;
    const rank = tagRankForClaim(input.snapshot, item);
    return rank === null ? strongest : Math.max(strongest ?? rank, rank);
  }, null);
  const policy = STRUCTURED_EVIDENCE_POLICY.strongCoreGenre;
  if (strongestTagRank !== null && strongestTagRank >= policy.highTagRank) {
    return Math.max(input.strength, policy.genreWithHighTagFloor);
  }
  if (strongestTagRank !== null && strongestTagRank >= policy.mediumTagRank) {
    return Math.max(input.strength, policy.genreWithMediumTagFloor);
  }
  return Math.max(input.strength, policy.genreFloor);
}

const CONFIDENCE_ORDER: Readonly<Record<EvidenceConfidence, number>> = { unknown: 0, low: 1, medium: 2, high: 3 };

function lowerConfidence(confidence: EvidenceConfidence): EvidenceConfidence {
  return confidence === "high" ? "medium" : confidence === "medium" ? "low" : confidence;
}

function applyConfidencePolicy(input: {
  aspectId: AspectId;
  snapshot: CandidateProviderEvidenceSnapshot;
  structured: readonly NormalizedEvidenceContribution[];
  supporting: readonly EvidenceClaim[];
  contradictory: readonly EvidenceClaim[];
  strength: number;
}): EvidenceConfidence {
  let confidence = deriveEvidenceConfidence({ supporting: input.supporting, contradictory: input.contradictory, strength: input.strength });
  const ranked = input.structured.flatMap((item) => {
    const provider = item.claim.provider ?? input.snapshot.candidateIdentity.primaryProvider;
    if (evidenceStrategyForProvider(input.aspectId, provider) !== "ranked_tag") return [];
    const rank = tagRankForClaim(input.snapshot, item);
    return rank === null ? [] : [rank];
  }).sort((a, b) => b - a)[0];
  if (ranked !== undefined) {
    const policyConfidence = rankedTagPolicyFor(ranked, false).confidence;
    const hasSemanticSupporting = input.supporting.some((claim) => claim.sourceKind === "local_semantic_verifier"
      || claim.sourceKind === "remote_llm_verifier"
      || claim.sourceKind === "synopsis_classifier");
    const semanticConfidence = hasSemanticSupporting
      ? deriveEvidenceConfidence({ supporting: input.supporting, contradictory: [], strength: input.strength })
      : "unknown";
    confidence = CONFIDENCE_ORDER[semanticConfidence] > CONFIDENCE_ORDER[policyConfidence]
      ? semanticConfidence
      : policyConfidence;
    if (input.contradictory.length > 0) confidence = lowerConfidence(confidence);
    return confidence;
  }
  const allSoftOnly = input.structured.length > 0 && input.structured.every((item) => {
    const provider = item.claim.provider ?? input.snapshot.candidateIdentity.primaryProvider;
    return evidenceStrategyForProvider(input.aspectId, provider) === "soft_only";
  });
  if (allSoftOnly) {
    const tmdbKeywords = new Set(input.structured.flatMap((item) => item.claim.provider === "tmdb"
      && item.claim.sourceKind === "provider_keyword"
      ? [String(item.claim.normalizedValue ?? item.claim.value ?? "")]
      : []));
    const cap: EvidenceConfidence = tmdbKeywords.size >= 2 ? "medium" : "low";
    if (CONFIDENCE_ORDER[confidence] > CONFIDENCE_ORDER[cap]) confidence = cap;
  }
  return confidence;
}

export function aggregateAspectEvidence(input: {
  snapshot: CandidateProviderEvidenceSnapshot;
  semantic?: SemanticEvidenceBundle;
}): ReadonlyMap<AspectId, AspectEvidence> {
  const normalized = normalizeRawEvidenceClaims(input.snapshot);
  const result = new Map<AspectId, AspectEvidence>();
  for (const aspectId of ASPECT_IDS) {
    const structured = normalized.contributions.filter((item) => item.aspectId === aspectId);
    const semanticSupporting = [...(input.semantic?.supporting[aspectId] ?? [])];
    const contradictory = [...(input.semantic?.contradictory[aspectId] ?? [])];
    if (structured.length === 0 && semanticSupporting.length === 0) {
      result.set(aspectId, createUnknownAspectEvidence(aspectId, [
        ...normalized.warnings,
        ...(input.semantic?.warnings ?? []),
      ]));
      continue;
    }
    const structuredCap = structured.length > 0
      ? Math.max(...structured.map((item) => supportCap(aspectId, item.claim.provider ?? input.snapshot.candidateIdentity.primaryProvider)))
      : 0;
    const structuredStrength = applyStructuredEvidencePolicy({
      aspectId,
      snapshot: input.snapshot,
      structured,
      strength: Math.min(structuredCap, boundedNoisyOr(structured.map((item) => item.contribution))),
    });
    const semanticStrength = boundedNoisyOr(semanticSupporting.map((claim) => Math.min(0.65, claim.reliability ?? 0)));
    const strength = Math.min(0.95, boundedNoisyOr([structuredStrength, semanticStrength].filter((value) => value > 0)));
    const supporting = [...structured.map((item) => item.claim), ...semanticSupporting];
    result.set(aspectId, createAspectEvidence({
      aspectId,
      strength,
      confidence: applyConfidencePolicy({ aspectId, snapshot: input.snapshot, structured, supporting, contradictory, strength }),
      sources: [...supporting, ...contradictory],
      supportingEvidence: supporting,
      contradictoryEvidence: contradictory,
      verifierMode: input.semantic?.mode ?? "structured_only",
      warnings: [...normalized.warnings, ...(input.semantic?.warnings ?? [])],
    }));
  }
  return result;
}

export function aggregateEvidenceSnapshots(input: {
  snapshots: ReadonlyMap<string, CandidateProviderEvidenceSnapshot>;
  semanticByCandidateKey?: ReadonlyMap<string, SemanticEvidenceBundle>;
}): ReadonlyMap<string, ReadonlyMap<AspectId, AspectEvidence>> {
  return new Map([...input.snapshots].map(([key, snapshot]) => [
    key,
    aggregateAspectEvidence({ snapshot, semantic: input.semanticByCandidateKey?.get(key) }),
  ]));
}
