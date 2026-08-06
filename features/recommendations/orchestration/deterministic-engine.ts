import type { AiCandidate, AiIntent, AiRecommendRequest, AiRecommendResponse, AiRetrievalPlan, AiSettings } from "@/lib/ai/types";
import { aggregateEvidenceSnapshots, runSemanticVerifier } from "../evidence";
import { buildGroundedAssistantMessage, buildGroundedNearMatchRecommendation, buildGroundedRecommendation } from "../explanation";
import { adaptV1RequestToV2 } from "../intent/v1-request-adapter";
import { prepareProviderEvidencePipeline } from "../providers/pipeline";
import type { ProviderEvidencePipelineResult } from "../providers/pipeline";
import type { CandidateProviderEvidenceSnapshot } from "../providers/types";
import { rerankForDiversity, scoreEligibleCandidates } from "../ranking";
import type { SemanticVerifierMode } from "../domain/types";
import type { RecommendationRequestV2 } from "../domain/codec";
import type { RecommendationFeedbackEventV2 } from "../feedback";

export const DETERMINISTIC_RECOMMENDATION_V2_ENABLED = true;

function configuredVerifierMode(): SemanticVerifierMode {
  const value = process.env.AI_RECOMMENDATION_SEMANTIC_MODE;
  return value === "local_enhanced" || value === "remote_enhanced" ? value : "structured_only";
}

function findSnapshot(candidate: AiCandidate, snapshots: ReadonlyMap<string, CandidateProviderEvidenceSnapshot>): CandidateProviderEvidenceSnapshot | null {
  for (const snapshot of snapshots.values()) {
    if (snapshot.candidateIdentity.primaryProvider === candidate.source && snapshot.candidateIdentity.primaryExternalId === candidate.externalId) return snapshot;
  }
  return null;
}

function isExactlyDismissed(candidate: AiCandidate, dismissed: AiRecommendRequest["dismissed"]): boolean {
  return Boolean(dismissed?.some((item) => item.externalSource === candidate.source && item.externalId === candidate.externalId));
}

export async function runDeterministicRecommendationV2(input: {
  message: string;
  intent: AiIntent;
  retrievalPlan: AiRetrievalPlan | null;
  settings: AiSettings;
  candidates: readonly AiCandidate[];
  mediaItems: AiRecommendRequest["mediaItems"];
  feedback: readonly NonNullable<AiRecommendRequest["recommendationFeedback"]>[number][];
  feedbackV2?: readonly RecommendationFeedbackEventV2[];
  dismissed: AiRecommendRequest["dismissed"];
  baseUrl: string;
  fetchImpl?: typeof fetch;
  providerPipeline?: ProviderEvidencePipelineResult;
  structuredRequest?: RecommendationRequestV2;
}): Promise<AiRecommendResponse> {
  const engineStartedAt = performance.now();
  const pipelineStartedAt = performance.now();
  const pipeline = input.providerPipeline ?? await prepareProviderEvidencePipeline({ candidates: input.candidates, baseUrl: input.baseUrl, fetchImpl: input.fetchImpl });
  const enrichmentMs = input.providerPipeline ? 0 : performance.now() - pipelineStartedAt;
  const identityVerified = input.candidates.filter((candidate) => candidate.source !== "library" && findSnapshot(candidate, pipeline.evidenceByCandidateKey));
  const dismissedRejected = identityVerified.filter((candidate) => isExactlyDismissed(candidate, input.dismissed)).map((candidate) => ({ title: candidate.title, reason: "dismissed_exact_identity" }));
  const candidates = identityVerified.filter((candidate) => !isExactlyDismissed(candidate, input.dismissed));
  const verifierMode = configuredVerifierMode();
  const adapted = input.structuredRequest ? {
    request: input.structuredRequest,
    needsClarification: false,
    issues: [] as string[],
    warnings: [] as string[],
    telemetry: {
      aspectConstraints: input.structuredRequest.aspectConstraints.length,
      objectiveConstraints: input.structuredRequest.objectiveConstraints.length,
      explicit: input.structuredRequest.aspectConstraints.filter((item) => item.source === "explicit").length,
      inferred: input.structuredRequest.aspectConstraints.filter((item) => item.source === "inferred").length,
      profile: input.structuredRequest.aspectConstraints.filter((item) => item.source === "profile").length,
      unresolvedReferences: input.structuredRequest.references.filter((item) => item.state === "unresolved").length,
    },
  } : adaptV1RequestToV2({
    message: input.message,
    intent: input.intent,
    retrievalPlan: input.retrievalPlan,
    settings: input.settings,
    mediaItems: input.mediaItems,
    candidates,
    semanticVerifierMode: verifierMode,
  });
  if (!adapted.request || adapted.needsClarification) {
    return {
      assistantMessage: adapted.issues.length > 0
        ? "İstekte birbiriyle çelişen veya doğrulanamayan koşullar var. Medya türünü ve zorunlu tercihlerini biraz daha açık yazar mısın?"
        : "Hangi medya türünde öneri istediğini netleştirir misin?",
      recommendations: [],
      rejectedCandidates: [...pipeline.rejectedCandidates, ...dismissedRejected],
      transparencySummary: "V2 yapılandırılmış istek çözümlendi; belirsizlik nedeniyle sıralama çalıştırılmadı.",
      intent: input.intent,
      engineStatus: {
        provider: "deterministic_v2",
        embeddingMode: "disabled",
        providerFallbackUsed: false,
        evaluatedCandidateCount: 0,
        sources: [],
        feedbackApplied: false,
        feedbackEventCount: input.feedback.length,
        persistentCache: "not_used",
        semanticVerifierMode: "structured_only",
      },
      debug: { provider: "deterministic_v2", note: `clarification:${adapted.issues.join(",")}` },
    };
  }
  const evidenceStartedAt = performance.now();
  const verifier = await runSemanticVerifier({ mode: adapted.request.semanticVerifierMode, snapshots: pipeline.evidenceByCandidateKey, fetchImpl: input.fetchImpl });
  const evidence = aggregateEvidenceSnapshots({ snapshots: pipeline.evidenceByCandidateKey, semanticByCandidateKey: verifier.evidenceByCandidateKey });
  const evidenceMs = performance.now() - evidenceStartedAt;
  const rankable = candidates.flatMap((candidate) => {
    const snapshot = findSnapshot(candidate, pipeline.evidenceByCandidateKey);
    if (!snapshot) return [];
    return [{ candidate, snapshot, aspectEvidence: evidence.get(snapshot.candidateIdentity.canonicalKey) ?? new Map() }];
  });
  const rankingStartedAt = performance.now();
  const ranking = scoreEligibleCandidates({ request: adapted.request, candidates: rankable, mediaItems: input.mediaItems, feedback: input.feedback, feedbackV2: input.feedbackV2 });
  const selected = rerankForDiversity(ranking.scored, 5);
  const averageCoverage = selected.length > 0
    ? selected.reduce((sum, item) => sum + item.explicitRequestCoverage.coverage, 0) / selected.length
    : 0;
  const nearMatches = adapted.request.strictness === "exploratory" ? ranking.nearMatches.slice(0, 3) : [];
  const rejectedCandidates = [...pipeline.rejectedCandidates, ...dismissedRejected, ...ranking.rejected];
  const rankingMs = performance.now() - rankingStartedAt;
  const explanationStartedAt = performance.now();
  const assistantMessage = buildGroundedAssistantMessage(selected.length, rejectedCandidates.length);
  const recommendations = selected.map((item, index) => buildGroundedRecommendation(item, adapted.request as NonNullable<typeof adapted.request>, index));
  const groundedNearMatches = nearMatches.map((item, index) => buildGroundedNearMatchRecommendation(item, adapted.request as NonNullable<typeof adapted.request>, index));
  const explanationMs = performance.now() - explanationStartedAt;
  return {
    assistantMessage,
    recommendations,
    nearMatches: groundedNearMatches,
    rejectedCandidates: rejectedCandidates.length > 0 ? rejectedCandidates : undefined,
    transparencySummary: `Kimlik doğrulama, yapılandırılmış kanıt ve hard filter uygulandı; deterministik sıra istek uyumu, kanıt güveni ve ardından kişisel uyumu kullandı. Semantic verifier: ${verifier.status}.`,
    intent: input.intent,
    engineStatus: {
      provider: "deterministic_v2",
      embeddingMode: "disabled",
      providerFallbackUsed: verifier.status === "unavailable" && verifier.requestedMode !== "structured_only",
      evaluatedCandidateCount: rankable.length,
      sources: [...new Set(candidates.map((candidate) => candidate.source))].sort(),
      feedbackApplied: input.feedback.length > 0 && selected.some((item) => item.scoreBreakdown.personalFit !== 0),
      feedbackEventCount: input.feedback.length,
      persistentCache: "not_used",
      semanticVerifierMode: verifier.effectiveMode,
    },
    debug: {
      provider: "deterministic_v2",
      note: [
        `constraints=${adapted.telemetry.aspectConstraints + adapted.telemetry.objectiveConstraints}`,
        `evidence=${pipeline.evidenceByCandidateKey.size}`,
        `eligible=${ranking.scored.length}`,
        `verifier=${verifier.status}`,
      ].join(";"),
      retrieval: {
        parsedIntent: input.intent,
        taskType: input.retrievalPlan?.taskType ?? input.intent.kind,
        targetMediaTypes: [...adapted.request.targetMediaTypes],
        sourceTypes: input.intent.sourceTypes,
        sourceContext: input.retrievalPlan?.sourceContext,
        preferenceSignals: input.retrievalPlan?.preferenceSignals ?? [],
        avoidSignals: input.retrievalPlan?.avoidSignals ?? [],
        needsClarification: false,
        searchPlans: input.retrievalPlan?.searchPlans ?? [],
        executedQueries: [],
        sourceCandidateCounts: {},
        filterSummary: { before: input.candidates.length, after: candidates.length, removed: input.candidates.length - candidates.length, reasons: {} },
        finalCandidateCount: selected.length,
        refinedPassUsed: false,
        providerFallback: false,
        providerEvidence: pipeline.telemetry,
        latencyMs: {
          enrichment: Number(enrichmentMs.toFixed(2)),
          evidence: Number(evidenceMs.toFixed(2)),
          ranking: Number(rankingMs.toFixed(2)),
          explanation: Number(explanationMs.toFixed(2)),
          total: Number((performance.now() - engineStartedAt).toFixed(2)),
        },
        notes: [
          `v2_constraint_explicit=${adapted.telemetry.explicit}`,
          `v2_constraint_inferred=${adapted.telemetry.inferred}`,
          `v2_constraint_profile=${adapted.telemetry.profile}`,
          `v2_hard_filter_rejected=${ranking.rejected.length}`,
          `v2_semantic_mode=${verifier.effectiveMode}`,
          `v2_weighted_coverage=${averageCoverage.toFixed(4)}`,
          "v2_sort=request_fit,evidence_confidence,personal_fit,quality,novelty,identity",
        ],
      },
    },
  };
}
