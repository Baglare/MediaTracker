import { ASPECT_REGISTRY, evidenceStrategyForProvider } from "../domain/aspect-registry";
import type { AspectId, AspectSupportLevel } from "../domain/types";
import type { CandidateProviderEvidenceSnapshot, RawProviderEvidenceClaim } from "../providers/types";

export interface NormalizedEvidenceContribution {
  claim: RawProviderEvidenceClaim;
  aspectId: AspectId;
  contribution: number;
  warning?: string;
}

const SUPPORT_MULTIPLIER: Readonly<Record<AspectSupportLevel, number>> = {
  strong: 1,
  partial: 0.82,
  experimental: 0.55,
  unsupported: 0,
};

const SOURCE_BASE = {
  provider_genre: 0.55,
  provider_tag_rank: 0.62,
  provider_keyword: 0.46,
  provider_metadata: 0.32,
  synopsis_classifier: 0.5,
  local_semantic_verifier: 0.58,
  remote_llm_verifier: 0.55,
  user_feedback: 0,
} as const;

function tagRankFactor(snapshot: CandidateProviderEvidenceSnapshot, claim: RawProviderEvidenceClaim): number | null {
  if (claim.sourceKind !== "provider_tag_rank") return 1;
  const value = String(claim.value ?? "").trim();
  const tag = snapshot.objectiveMetadata.tags?.find((entry) => entry.name === value);
  if (tag?.rank === undefined) return 0.72;
  if (!Number.isFinite(tag.rank) || tag.rank < 0 || tag.rank > 100) return null;
  return 0.5 + (tag.rank / 100) * 0.5;
}

function tagRank(snapshot: CandidateProviderEvidenceSnapshot, claim: RawProviderEvidenceClaim): number | undefined | null {
  if (claim.sourceKind !== "provider_tag_rank") return undefined;
  const value = String(claim.value ?? "").trim();
  const rank = snapshot.objectiveMetadata.tags?.find((entry) => entry.name === value)?.rank;
  if (rank === undefined) return undefined;
  return Number.isFinite(rank) && rank >= 0 && rank <= 100 ? rank : null;
}

export function normalizeRawEvidenceClaims(snapshot: CandidateProviderEvidenceSnapshot): {
  contributions: NormalizedEvidenceContribution[];
  warnings: string[];
} {
  const contributions: NormalizedEvidenceContribution[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const claim of snapshot.rawEvidenceClaims) {
    if (claim.scope !== "candidate_metadata" || claim.sourceKind === "user_feedback") continue;
    const reliability = claim.reliability;
    if (typeof reliability !== "number" || !Number.isFinite(reliability) || reliability < 0 || reliability > 1) {
      warnings.push(`invalid_reliability:${claim.id}`);
      continue;
    }
    const tagFactor = tagRankFactor(snapshot, claim);
    if (tagFactor === null) {
      warnings.push(`malformed_tag_rank:${claim.id}`);
      continue;
    }
    for (const aspectId of claim.mappedAspectIds) {
      const evidenceProvider = claim.provider ?? snapshot.candidateIdentity.primaryProvider;
      const support = ASPECT_REGISTRY[aspectId].providerSupport[evidenceProvider];
      if (support === "unsupported") {
        warnings.push(`unsupported_provider_aspect:${aspectId}:${evidenceProvider}`);
        continue;
      }
      const strategy = evidenceStrategyForProvider(aspectId, evidenceProvider);
      if (strategy === "semantic_required") {
        warnings.push(`semantic_required_structured_ignored:${aspectId}:${claim.id}`);
        continue;
      }
      const rank = tagRank(snapshot, claim);
      if (claim.sourceKind === "provider_tag_rank" && strategy === "ranked_tag") {
        if (rank === undefined) {
          warnings.push(`ranked_tag_rank_missing:${aspectId}:${claim.id}`);
          continue;
        }
        if (rank !== null && rank < 20) {
          warnings.push(`ranked_tag_below_contribution:${aspectId}:${claim.id}`);
          continue;
        }
      }
      const key = `${claim.provider ?? "-"}:${claim.sourceKind}:${claim.field ?? "-"}:${String(claim.normalizedValue)}:${aspectId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const contribution = Math.min(0.9, SOURCE_BASE[claim.sourceKind] * reliability * SUPPORT_MULTIPLIER[support] * tagFactor);
      contributions.push({ claim, aspectId, contribution });
    }
  }
  return { contributions, warnings };
}
