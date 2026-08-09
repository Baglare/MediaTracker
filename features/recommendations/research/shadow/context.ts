import type { AiCandidate } from "@/lib/ai/types";
import type { MediaItem } from "@/lib/types";
import type { RecommendationRequestV2 } from "../../domain/codec";
import type { AspectEvidence } from "../../domain/evidence";
import { evaluateConstraintEligibility } from "../../domain/policies";
import type { AspectId } from "../../domain/types";
import type { CandidateProviderEvidenceSnapshot } from "../../providers/types";
import { evaluateObjectiveConstraint, objectiveDecisionsAllowPrimary } from "../../ranking/objective-filters";
import { hasExactLibraryIdentity } from "../../ranking/personal-profile";
import { createResearchVersionScope } from "../domain/version-scope";
import type { AspectStructuredDecision, StructuredEvidenceSummary } from "../domain/types";
import type { GroundedResearchShadowContext } from "./types";

interface ShadowRankableCandidate {
  candidate: AiCandidate;
  snapshot: CandidateProviderEvidenceSnapshot;
  aspectEvidence: ReadonlyMap<AspectId, AspectEvidence>;
}

function structuredDecision(input: { role: "must" | "prefer" | "avoid"; outcome: string; evidence?: AspectEvidence }): AspectStructuredDecision {
  if (!input.evidence || input.evidence.level === "unknown" || input.outcome === "unknown") return "unknown";
  if (input.outcome === "failed_must" || input.outcome === "risk" || input.outcome === "not_preferred") return "partial";
  if (input.role === "avoid" && input.outcome === "passed") return "decisive_contradicted";
  return "decisive_supported";
}

function summary(aspectId: AspectId, decision: AspectStructuredDecision, evidence?: AspectEvidence): StructuredEvidenceSummary {
  const level = evidence?.level === "incidental" || evidence?.level === "significant" || evidence?.level === "primary" ? evidence.level : null;
  return {
    aspectId, decision, level, confidence: evidence?.confidence ?? "unknown",
    sourceKinds: [...new Set((evidence?.sources ?? []).map((item) => item.sourceKind))].sort(),
    warnings: [...(evidence?.warnings ?? [])],
  };
}

export function buildGroundedResearchShadowContext(input: {
  request: RecommendationRequestV2;
  candidates: readonly ShadowRankableCandidate[];
  mediaItems: readonly MediaItem[];
}): GroundedResearchShadowContext {
  const seen = new Set<string>();
  const candidates: GroundedResearchShadowContext["candidates"][number][] = [];
  input.candidates.forEach((item, preResearchRank) => {
    const identity = item.snapshot.candidateIdentity;
    if (seen.has(identity.canonicalKey) || hasExactLibraryIdentity(item.snapshot, input.mediaItems)) return;
    const objectiveDecisions = input.request.objectiveConstraints.map((constraint) => evaluateObjectiveConstraint({ constraint, snapshot: item.snapshot }));
    if (!objectiveDecisionsAllowPrimary(objectiveDecisions)) return;
    let versionScope;
    try { versionScope = createResearchVersionScope({ identity, scopeKind: "work" }); }
    catch { return; }
    const constraintStates = input.request.aspectConstraints.map((constraint) => {
      const evidence = item.aspectEvidence.get(constraint.aspectId);
      const decision = evaluateConstraintEligibility({ constraint, evidence: evidence ?? null, strictness: input.request.strictness });
      return { constraint, evidence, decision, structured: structuredDecision({ role: constraint.role, outcome: decision.outcome, evidence }) };
    });
    const unresolvedConstraints = constraintStates
      .filter(({ constraint, structured }) => constraint.source === "explicit" && (constraint.role === "must" || constraint.role === "avoid") && (structured === "unknown" || structured === "partial"))
      .map(({ constraint, structured }) => {
        const configuredLevel = constraint.role === "avoid" ? constraint.rejectAtLevel : constraint.minimumLevel;
        const minimumLevel = configuredLevel === "absent" ? "incidental" : configuredLevel;
        return {
          aspectId: constraint.aspectId, role: constraint.role,
          ...(minimumLevel ? { minimumLevel } : {}),
          source: "explicit" as const, currentStructuredDecision: structured,
          unresolvedReason: structured === "unknown" ? "structured_evidence_unknown" : "structured_evidence_partial",
        };
      });
    if (unresolvedConstraints.length === 0) return;
    seen.add(identity.canonicalKey);
    candidates.push({
      researchCandidate: {
        identity, versionScope, mediaType: identity.mediaType, preResearchRank, hardObjectiveEligible: true,
        unresolvedConstraints,
        structuredEvidenceSummary: constraintStates.map(({ constraint, evidence, structured }) => summary(constraint.aspectId, structured, evidence)),
      },
      titleSnapshot: item.candidate.title,
      ...(item.snapshot.objectiveMetadata.releaseYear ? { releaseYear: item.snapshot.objectiveMetadata.releaseYear } : {}),
    });
  });
  return {
    version: 1,
    structuredRequest: {
      version: 1, targetMediaTypes: [...input.request.targetMediaTypes],
      aspectConstraints: [...input.request.aspectConstraints], objectiveConstraints: [...input.request.objectiveConstraints],
      strictness: input.request.strictness,
    },
    candidates,
  };
}
