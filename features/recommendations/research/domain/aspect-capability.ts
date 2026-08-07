import { ASPECT_IDS, ASPECT_REGISTRY, type AspectId } from "../../domain/aspect-registry";
import type { AspectResearchCapability, AspectResearchMode, StructuredResearchDecision } from "./types";

function structuredDecision(id: AspectId): StructuredResearchDecision {
  const entry = ASPECT_REGISTRY[id];
  if (entry.defaultEvidenceStrategy === "exact_taxonomy") return entry.semanticVerifier === "not_required" ? "sufficient" : "partial";
  if (entry.defaultEvidenceStrategy === "ranked_tag") return "partial";
  return "unavailable";
}

function researchMode(id: AspectId): AspectResearchMode {
  const entry = ASPECT_REGISTRY[id];
  if (entry.semanticVerifier === "required_for_hard_decision") return "required_for_hard_decision";
  if (entry.defaultEvidenceStrategy === "exact_taxonomy" && entry.semanticVerifier === "not_required") return "none";
  return "fallback";
}

function capability(id: AspectId): AspectResearchCapability {
  const entry = ASPECT_REGISTRY[id];
  const mode = researchMode(id);
  return {
    aspectId: id,
    structuredDecision: structuredDecision(id),
    researchMode: mode,
    researchValue: entry.defaultEvidenceStrategy === "exact_taxonomy" && entry.semanticVerifier === "not_required" ? "presence" : "centrality",
    allowedSourceClasses: mode === "none" ? ["structured_knowledge"] : ["structured_knowledge", "encyclopedia"],
    canResearchMust: mode !== "none" && mode !== "unsupported",
    canResearchAvoid: mode !== "none" && mode !== "unsupported",
    canResearchPrefer: mode !== "none" && mode !== "unsupported",
    riskLevel: entry.mustSafety === "unsafe" || entry.semanticVerifier === "required_for_hard_decision" ? "high" : entry.mustSafety === "conditional" ? "medium" : "low",
    limitationReason: entry.limitationNoteTr ?? "Research yalnız exact identity ve izinli direct source ile yapılır.",
  };
}

export const ASPECT_RESEARCH_CAPABILITIES = Object.fromEntries(
  ASPECT_IDS.map((id) => [id, capability(id)]),
) as Readonly<Record<AspectId, AspectResearchCapability>>;

export function getAspectResearchCapability(aspectId: AspectId): AspectResearchCapability {
  return ASPECT_RESEARCH_CAPABILITIES[aspectId];
}

export function validateAspectResearchCapabilities(): { ok: true; value: typeof ASPECT_RESEARCH_CAPABILITIES } | { ok: false; issues: string[] } {
  const keys = Object.keys(ASPECT_RESEARCH_CAPABILITIES);
  const issues: string[] = [];
  if (keys.length !== ASPECT_IDS.length) issues.push("research_capability_count_mismatch");
  for (const id of ASPECT_IDS) {
    const item = ASPECT_RESEARCH_CAPABILITIES[id];
    if (!item || item.aspectId !== id) issues.push(`research_capability_missing:${id}`);
    if (item && item.limitationReason.trim().length === 0) issues.push(`research_capability_limitation_missing:${id}`);
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: ASPECT_RESEARCH_CAPABILITIES };
}

export function aspectResearchCapabilityDistribution(): Record<"none" | "fallback" | "required" | "unsupported", number> {
  const distribution = { none: 0, fallback: 0, required: 0, unsupported: 0 };
  for (const item of Object.values(ASPECT_RESEARCH_CAPABILITIES)) {
    if (item.researchMode === "required_for_hard_decision") distribution.required += 1;
    else distribution[item.researchMode] += 1;
  }
  return distribution;
}
