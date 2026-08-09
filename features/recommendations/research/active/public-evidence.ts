import type { PublicResearchEvidenceSummary, PublicResearchSource } from "@/lib/ai/types";
import { ASPECT_REGISTRY } from "../../domain/aspect-registry";
import { validateAspectResearchDecision } from "../domain/decisions";
import { validatePersistedResearchCitation } from "../domain/citations";
import { getResearchSource } from "../domain/source-registry";
import type { ResearchEvidenceHandoff } from "../domain/types";
import { decodePublicResearchEvidenceSummary } from "./public-codec";
import type { ActiveResearchProvenanceSidecar } from "./types";

function publicSource(citation: ResearchEvidenceHandoff["citations"][number]): PublicResearchSource | null {
  const validated = validatePersistedResearchCitation(citation);
  const source = getResearchSource(citation.sourceId);
  if (!validated.ok || !source?.enabled || !citation.attribution?.trim()) return null;
  const url = new URL(validated.value.canonicalUrl);
  if (source.requiresRevisionId && (!citation.revisionId || url.searchParams.get("oldid") !== citation.revisionId)) return null;
  const label = citation.sourceId === "wikipedia" ? "Wikipedia" : citation.sourceId === "wikidata" ? "Wikidata" : null;
  if (!label) return null;
  return { sourceId: citation.sourceId, label, url: validated.value.canonicalUrl, attribution: citation.attribution, accessedAt: citation.accessedAt };
}

export function buildPublicResearchEvidenceSummary(input: {
  handoff: ResearchEvidenceHandoff;
  provenance: ActiveResearchProvenanceSidecar;
}): PublicResearchEvidenceSummary | null {
  if (input.provenance.whetherResearchChangedOutcome !== "rescued_candidate" && input.provenance.whetherResearchChangedOutcome !== "cleared_avoid") return null;
  const decision = input.handoff.aspectDecisions.find((item) => item.aspectId === input.provenance.aspectId);
  if (!decision || decision.status === "unknown" || !validateAspectResearchDecision({ decision, claims: input.handoff.claims, citations: input.handoff.citations, identity: input.handoff.candidateIdentity }).ok) return null;
  if (input.provenance.whetherResearchChangedOutcome === "rescued_candidate" && (decision.status !== "supported" || decision.level === null)) return null;
  if (input.provenance.whetherResearchChangedOutcome === "cleared_avoid" && decision.status !== "contradicted") return null;
  const claimIds = decision.status === "supported" ? decision.supportingClaimIds : decision.contradictingClaimIds;
  const claims = claimIds.map((claimId) => input.handoff.claims.find((claim) => claim.claimId === claimId));
  if (claims.some((claim) => !claim)) return null;
  const citationIds = new Set(claims.flatMap((claim) => claim?.citationIds ?? []));
  const citations = [...citationIds].map((citationId) => input.handoff.citations.find((citation) => citation.citationId === citationId));
  if (citations.some((citation) => !citation)) return null;
  const sources: PublicResearchSource[] = [];
  const seenUrls = new Set<string>();
  for (const citation of citations) {
    const mapped = citation ? publicSource(citation) : null;
    if (!mapped) return null;
    if (!seenUrls.has(mapped.url)) { seenUrls.add(mapped.url); sources.push(mapped); }
  }
  if (sources.length === 0) return null;
  const uniquePublishers = new Set(sources.map((source) => source.sourceId));
  const summary: PublicResearchEvidenceSummary = {
    version: 1,
    status: "research_verified",
    affectedAspects: [{
      aspectId: decision.aspectId,
      label: ASPECT_REGISTRY[decision.aspectId].labelTr,
      finding: decision.status === "supported" ? "supported" : "explicit_absence",
      level: decision.status === "supported" ? decision.level : null,
      confidence: decision.confidence === "low" ? "low" : "medium",
      sourceCount: Math.min(3, uniquePublishers.size),
    }],
    sources: sources.slice(0, 3),
  };
  return decodePublicResearchEvidenceSummary(summary);
}
