import type { AiCandidate } from "@/lib/ai/types";
import type { AniListNormalizedResult } from "@/lib/anilist-types";
import type { OmdbNormalizedResult } from "@/lib/omdb-types";
import type { OpenLibraryNormalizedResult } from "@/lib/openlibrary-types";
import type { TmdbNormalizedResult } from "@/lib/tmdb-types";
import type { TvmazeNormalizedResult } from "@/lib/tvmaze-types";
import type { RecommendationMediaType, RecommendationProvider } from "../domain/types";
import { adaptAniListEvidence } from "./anilist-adapter";
import { evaluateExactIdentityLink, selectPrimaryIdentity } from "./candidate-identity";
import { providerEvidenceCache, providerEvidenceCacheKey } from "./evidence-cache";
import { adaptOmdbEvidence } from "./omdb-adapter";
import { adaptOpenLibraryEvidence, fetchOpenLibraryWorkEvidence } from "./openlibrary-adapter";
import { adaptTmdbEvidence, fetchTmdbEvidenceDetail } from "./tmdb-adapter";
import { adaptTvmazeRecommendationEvidence, countTvmazeDecision } from "./tvmaze-adapter";
import type { CandidateProviderEvidenceSnapshot, ProviderEvidenceTelemetry } from "./types";
import { emptyProviderEvidenceTelemetry } from "./types";

export const PROVIDER_ENRICHMENT_MAX_CANDIDATES = 8;
export const PROVIDER_ENRICHMENT_CONCURRENCY = 3;
export const PROVIDER_ENRICHMENT_TIMEOUT_MS = 2500;

const TTL_MS: Readonly<Record<RecommendationProvider, number>> = {
  anilist: 6 * 60 * 60 * 1000,
  tvmaze: 30 * 60 * 1000,
  tmdb: 6 * 60 * 60 * 1000,
  omdb: 24 * 60 * 60 * 1000,
  openlibrary: 24 * 60 * 60 * 1000,
};

function asSupportedMediaType(type: AiCandidate["type"]): RecommendationMediaType | null {
  return ["anime", "manga", "manhwa", "manhua", "tv", "movie", "book"].includes(type)
    ? type as RecommendationMediaType : null;
}

function baseSnapshot(candidate: AiCandidate): CandidateProviderEvidenceSnapshot | null {
  if (candidate.source === "library") return null;
  const raw = candidate.globalSearch?.raw as unknown;
  if (!raw || typeof raw !== "object" || !candidate.externalId || !asSupportedMediaType(candidate.type)) return null;
  switch (candidate.source) {
    case "anilist": return adaptAniListEvidence(raw as AniListNormalizedResult);
    case "tmdb": return adaptTmdbEvidence(raw as TmdbNormalizedResult);
    case "omdb": return adaptOmdbEvidence(raw as OmdbNormalizedResult);
    case "openlibrary": return adaptOpenLibraryEvidence(raw as OpenLibraryNormalizedResult);
    case "tvmaze": return adaptTvmazeRecommendationEvidence(raw as TvmazeNormalizedResult).snapshot ?? null;
  }
}

async function mapBounded<T>(items: readonly T[], worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(PROVIDER_ENRICHMENT_CONCURRENCY, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  }));
}

function mergeSnapshots(primary: CandidateProviderEvidenceSnapshot, secondary: CandidateProviderEvidenceSnapshot): CandidateProviderEvidenceSnapshot {
  const primaryIdentity = selectPrimaryIdentity(primary.candidateIdentity, secondary.candidateIdentity);
  const ids = new Map([...primary.candidateIdentity.secondaryIds, ...secondary.candidateIdentity.secondaryIds].map((id) => [`${id.kind}:${id.externalId}`, id]));
  return {
    ...primary,
    candidateIdentity: { ...primaryIdentity, secondaryIds: [...ids.values()], verificationEvidence: [...primary.candidateIdentity.verificationEvidence, ...secondary.candidateIdentity.verificationEvidence] },
    objectiveMetadata: { ...secondary.objectiveMetadata, ...primary.objectiveMetadata },
    rawEvidenceClaims: [...primary.rawEvidenceClaims, ...secondary.rawEvidenceClaims],
    providerCoverage: { ...secondary.providerCoverage, ...primary.providerCoverage },
    missingFields: [...new Set([...primary.missingFields, ...secondary.missingFields])],
    warnings: [...new Set([...primary.warnings, ...secondary.warnings])],
  };
}

export interface ProviderEvidencePipelineResult {
  candidates: AiCandidate[];
  evidenceByCandidateKey: ReadonlyMap<string, CandidateProviderEvidenceSnapshot>;
  telemetry: ProviderEvidenceTelemetry;
  rejectedCandidates: readonly { title: string; reason: string }[];
}

export async function prepareProviderEvidencePipeline(input: {
  candidates: readonly AiCandidate[];
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<ProviderEvidencePipelineResult> {
  const telemetry = emptyProviderEvidenceTelemetry();
  const rejectedCandidates: { title: string; reason: string }[] = [];
  const kept: AiCandidate[] = [];
  const snapshots = new Map<AiCandidate, CandidateProviderEvidenceSnapshot>();

  for (const candidate of input.candidates) {
    if (candidate.source === "library") { kept.push(candidate); continue; }
    if (candidate.source === "tvmaze") {
      const raw = candidate.globalSearch?.raw as TvmazeNormalizedResult | undefined;
      if (!raw) { rejectedCandidates.push({ title: candidate.title, reason: "provider_identity_unverified" }); continue; }
      const decision = adaptTvmazeRecommendationEvidence(raw);
      countTvmazeDecision(telemetry, decision);
      if (!decision.keep || !decision.snapshot) {
        rejectedCandidates.push({ title: candidate.title, reason: decision.reasonCode ?? "tvmaze_anime_excluded" });
        continue;
      }
      kept.push(candidate); snapshots.set(candidate, decision.snapshot); continue;
    }
    const snapshot = baseSnapshot(candidate);
    if (!snapshot) { rejectedCandidates.push({ title: candidate.title, reason: "provider_identity_unverified" }); continue; }
    kept.push(candidate); snapshots.set(candidate, snapshot);
  }

  const enrichable = kept.filter((candidate) => candidate.source === "tmdb" || candidate.source === "openlibrary").slice(0, PROVIDER_ENRICHMENT_MAX_CANDIDATES);
  await mapBounded(enrichable, async (candidate) => {
    const base = snapshots.get(candidate);
    if (!base) return;
    const key = providerEvidenceCacheKey({ provider: base.candidateIdentity.primaryProvider, mediaType: base.candidateIdentity.mediaType, externalId: base.candidateIdentity.primaryExternalId });
    try {
      const loaded = await providerEvidenceCache.getOrLoadWithStatus(
        key,
        () => candidate.source === "tmdb"
          ? fetchTmdbEvidenceDetail({ baseUrl: input.baseUrl, externalId: candidate.externalId, mediaType: candidate.type as "movie" | "tv", fetchImpl: input.fetchImpl, timeoutMs: PROVIDER_ENRICHMENT_TIMEOUT_MS })
          : fetchOpenLibraryWorkEvidence({ result: candidate.globalSearch?.raw as OpenLibraryNormalizedResult, fetchImpl: input.fetchImpl, timeoutMs: PROVIDER_ENRICHMENT_TIMEOUT_MS }),
        TTL_MS[base.candidateIdentity.primaryProvider],
      );
      if (loaded.source === "cache") telemetry.cacheHits += 1;
      else telemetry.cacheMisses += 1;
      if (loaded.source === "coalesced") telemetry.coalescedRequests += 1;
      if (loaded.source === "loaded") telemetry.enrichedCandidates += 1;
      snapshots.set(candidate, loaded.snapshot);
    } catch {
      telemetry.enrichmentFailures += 1;
    }
  });

  for (const [candidate, snapshot] of snapshots) {
    if (candidate.source === "tmdb" || candidate.source === "openlibrary") continue;
    const key = providerEvidenceCacheKey({ provider: snapshot.candidateIdentity.primaryProvider, mediaType: snapshot.candidateIdentity.mediaType, externalId: snapshot.candidateIdentity.primaryExternalId });
    const cached = providerEvidenceCache.get(key);
    if (cached) { telemetry.cacheHits += 1; snapshots.set(candidate, cached); }
    else { telemetry.cacheMisses += 1; providerEvidenceCache.set(key, snapshot, TTL_MS[snapshot.candidateIdentity.primaryProvider]); }
  }

  const finalCandidates: AiCandidate[] = [];
  const finalSnapshots = new Map<AiCandidate, CandidateProviderEvidenceSnapshot>();
  for (const candidate of kept) {
    let snapshot = snapshots.get(candidate);
    if (!snapshot) { finalCandidates.push(candidate); continue; }
    let merged = false;
    for (let index = 0; index < finalCandidates.length; index += 1) {
      const existing = finalCandidates[index];
      const existingSnapshot = finalSnapshots.get(existing);
      if (!existingSnapshot) continue;
      const decision = evaluateExactIdentityLink(existingSnapshot.candidateIdentity, snapshot.candidateIdentity);
      if (decision.reason === "identity_conflict") {
        telemetry.identity_conflicts += 1;
        const warning = decision.warning ?? "conflicting_exact_identity";
        finalSnapshots.set(existing, { ...existingSnapshot, warnings: [...new Set([...existingSnapshot.warnings, warning])] });
        snapshot = { ...snapshot, warnings: [...new Set([...snapshot.warnings, warning])] };
        continue;
      }
      if (!decision.link) continue;
      const selectedIdentity = selectPrimaryIdentity(existingSnapshot.candidateIdentity, snapshot.candidateIdentity);
      const selectedCandidate = selectedIdentity.canonicalKey === snapshot.candidateIdentity.canonicalKey ? candidate : existing;
      const combined = mergeSnapshots(selectedCandidate === existing ? existingSnapshot : snapshot, selectedCandidate === existing ? snapshot : existingSnapshot);
      finalCandidates[index] = selectedCandidate;
      finalSnapshots.delete(existing);
      finalSnapshots.set(selectedCandidate, combined);
      if (decision.reason === "same_provider_id") telemetry.same_provider_deduped += 1;
      else telemetry.exact_bridge_deduped += 1;
      merged = true; break;
    }
    if (!merged) { finalCandidates.push(candidate); finalSnapshots.set(candidate, snapshot); }
  }

  const evidenceByCandidateKey = new Map<string, CandidateProviderEvidenceSnapshot>();
  for (const snapshot of finalSnapshots.values()) evidenceByCandidateKey.set(snapshot.candidateIdentity.canonicalKey, snapshot);
  telemetry.snapshots = evidenceByCandidateKey.size;
  return { candidates: finalCandidates, evidenceByCandidateKey, telemetry, rejectedCandidates };
}
