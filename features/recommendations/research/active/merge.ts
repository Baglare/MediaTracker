import { aspectConstraintKey } from "../../domain/constraints";
import type { AspectId } from "../../domain/aspect-registry";
import type { AspectEvidence, EvidenceClaim } from "../../domain/evidence";
import type { ConstraintDecision } from "../../domain/policies";
import type { AspectConstraint } from "../../domain/constraints";
import { canResearchDecisionDriveHardConstraint, mapResearchDecisionToDeterministicSignal } from "../domain/decisions";
import type { ResearchEvidenceHandoff } from "../domain/types";

const LEVEL_STRENGTH = { incidental: 0.35, significant: 0.65, primary: 0.9 } as const;

export interface ActiveResearchMerge {
  aspectEvidenceByCandidateKey: ReadonlyMap<string, ReadonlyMap<AspectId, AspectEvidence>>;
  constraintDecisionsByCandidateKey: ReadonlyMap<string, ReadonlyMap<string, ConstraintDecision>>;
}

function evidenceClaim(id: string, aspectId: AspectId, level: string | null, polarity: "support" | "contradict"): EvidenceClaim {
  return { id, sourceKind: "remote_llm_verifier", scope: "candidate_metadata", field: `grounded_research:${aspectId}:${polarity}`, value: level, reliability: 0.7 };
}

export function buildActiveResearchMerge(input: {
  handoffs: readonly ResearchEvidenceHandoff[];
  constraints: readonly AspectConstraint[];
}): ActiveResearchMerge {
  const aspectEvidenceByCandidateKey = new Map<string, Map<AspectId, AspectEvidence>>();
  const constraintDecisionsByCandidateKey = new Map<string, Map<string, ConstraintDecision>>();
  for (const handoff of input.handoffs) {
    for (const researchDecision of handoff.aspectDecisions) {
      if (researchDecision.status === "unknown") continue;
      const constraint = input.constraints.find((item) => item.aspectId === researchDecision.aspectId && item.source === "explicit" && (item.role === "must" || item.role === "avoid"));
      if (!constraint) continue;
      const hardDecisionAllowed = canResearchDecisionDriveHardConstraint({ decision: researchDecision, claims: handoff.claims, citations: handoff.citations });
      if (!hardDecisionAllowed) continue;
      const configuredThreshold = constraint.role === "avoid" ? constraint.rejectAtLevel : constraint.minimumLevel;
      const threshold = configuredThreshold === "absent" ? "incidental" : configuredThreshold;
      const signal = mapResearchDecisionToDeterministicSignal({ decision: researchDecision, role: constraint.role, ...(threshold ? { minimumLevel: threshold } : {}), hardDecisionAllowed });
      const outcome = constraint.role === "must"
        ? (signal.mustSatisfied ? "passed" : "failed_must")
        : (signal.avoidTriggered ? "triggered_avoid" : "passed");
      const decision: ConstraintDecision = {
        constraintId: constraint.id,
        constraintKey: aspectConstraintKey(constraint),
        role: constraint.role,
        passed: outcome === "passed",
        outcome,
        evidenceConfidence: researchDecision.confidence === "none" ? "unknown" : researchDecision.confidence,
        reasons: [signal.reason],
        warnings: [...researchDecision.warnings],
      };
      const claimIds = researchDecision.status === "supported" ? researchDecision.supportingClaimIds : researchDecision.contradictingClaimIds;
      const claims = claimIds.map((id) => evidenceClaim(id, researchDecision.aspectId, researchDecision.level, researchDecision.status === "supported" ? "support" : "contradict"));
      const evidence: AspectEvidence = {
        aspectId: researchDecision.aspectId,
        strength: researchDecision.status === "supported" && researchDecision.level ? LEVEL_STRENGTH[researchDecision.level] : 0,
        level: researchDecision.status === "supported" && researchDecision.level ? researchDecision.level : "absent",
        confidence: researchDecision.confidence === "none" ? "unknown" : researchDecision.confidence,
        sources: claims,
        supportingEvidence: researchDecision.status === "supported" ? claims : [],
        contradictoryEvidence: researchDecision.status === "contradicted" ? claims : [],
        verifierMode: "remote_enhanced",
        warnings: [...researchDecision.warnings, "grounded_research_active_override"],
      };
      const candidateKey = handoff.candidateIdentity.canonicalKey;
      const aspectMap = aspectEvidenceByCandidateKey.get(candidateKey) ?? new Map();
      aspectMap.set(researchDecision.aspectId, evidence);
      aspectEvidenceByCandidateKey.set(candidateKey, aspectMap);
      const decisionMap = constraintDecisionsByCandidateKey.get(candidateKey) ?? new Map();
      decisionMap.set(constraint.id, decision);
      constraintDecisionsByCandidateKey.set(candidateKey, decisionMap);
    }
  }
  return { aspectEvidenceByCandidateKey, constraintDecisionsByCandidateKey };
}
