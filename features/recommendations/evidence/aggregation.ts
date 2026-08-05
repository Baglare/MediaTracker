import { ASPECT_IDS, ASPECT_REGISTRY, type AspectId } from "../domain/aspect-registry";
import { createAspectEvidence, createUnknownAspectEvidence, type AspectEvidence, type EvidenceClaim } from "../domain/evidence";
import type { SemanticVerifierMode } from "../domain/types";
import type { CandidateProviderEvidenceSnapshot } from "../providers/types";
import { normalizeRawEvidenceClaims } from "./claim-normalizer";
import { deriveEvidenceConfidence } from "./confidence";
import type { NormalizedEvidenceContribution } from "./claim-normalizer";

export const STRUCTURED_EVIDENCE_POLICY = {
  anilistRomance: {
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
  if (input.aspectId !== "romance" || input.snapshot.candidateIdentity.primaryProvider !== "anilist") {
    return input.strength;
  }
  const genreClaim = input.structured.some((item) => item.claim.sourceKind === "provider_genre");
  if (!genreClaim) return input.strength;
  const strongestTagRank = input.structured.reduce<number | null>((strongest, item) => {
    const rank = tagRankForClaim(input.snapshot, item);
    return rank === null ? strongest : Math.max(strongest ?? rank, rank);
  }, null);
  const policy = STRUCTURED_EVIDENCE_POLICY.anilistRomance;
  if (strongestTagRank !== null && strongestTagRank >= policy.highTagRank) {
    return Math.max(input.strength, policy.genreWithHighTagFloor);
  }
  if (strongestTagRank !== null && strongestTagRank >= policy.mediumTagRank) {
    return Math.max(input.strength, policy.genreWithMediumTagFloor);
  }
  return Math.max(input.strength, policy.genreFloor);
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
      confidence: deriveEvidenceConfidence({ supporting, contradictory, strength }),
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
