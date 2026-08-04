import { ASPECT_IDS, ASPECT_REGISTRY, type AspectId } from "../domain/aspect-registry";
import { createAspectEvidence, createUnknownAspectEvidence, type AspectEvidence, type EvidenceClaim } from "../domain/evidence";
import type { SemanticVerifierMode } from "../domain/types";
import type { CandidateProviderEvidenceSnapshot } from "../providers/types";
import { normalizeRawEvidenceClaims } from "./claim-normalizer";
import { deriveEvidenceConfidence } from "./confidence";

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
    const structuredStrength = Math.min(structuredCap, boundedNoisyOr(structured.map((item) => item.contribution)));
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
