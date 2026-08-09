import "server-only";

export const D7_RESEARCH_SHADOW_FLAG = "D7_RESEARCH_SHADOW_ENABLED" as const;
export const D7_RESEARCH_EVIDENCE_CACHE_FLAG = "D7_RESEARCH_EVIDENCE_CACHE_ENABLED" as const;
export const D7_RESEARCH_ROLLOUT_MODE_FLAG = "D7_RESEARCH_ROLLOUT_MODE" as const;
export const D7_RESEARCH_PUBLIC_CITATIONS_FLAG = "D7_RESEARCH_PUBLIC_CITATIONS_ENABLED" as const;

export type ResearchRolloutMode = "disabled" | "shadow" | "active";

export interface ResearchRolloutConfig {
  mode: ResearchRolloutMode;
  source: "default" | "rollout_mode" | "legacy_shadow";
  conflict: boolean;
  warnings: readonly string[];
}

export function resolveResearchRolloutConfig(environment: NodeJS.ProcessEnv = process.env): ResearchRolloutConfig {
  const configured = environment[D7_RESEARCH_ROLLOUT_MODE_FLAG];
  const legacyShadow = environment[D7_RESEARCH_SHADOW_FLAG] === "1";
  if (configured === "active" && legacyShadow) return { mode: "disabled", source: "rollout_mode", conflict: true, warnings: ["research_rollout_active_legacy_shadow_conflict"] };
  if (configured === "disabled" || configured === "shadow" || configured === "active") return { mode: configured, source: "rollout_mode", conflict: false, warnings: [] };
  if (configured !== undefined && configured !== "") return { mode: "disabled", source: "rollout_mode", conflict: true, warnings: ["research_rollout_mode_invalid"] };
  if (legacyShadow) return { mode: "shadow", source: "legacy_shadow", conflict: false, warnings: ["research_rollout_legacy_shadow"] };
  return { mode: "disabled", source: "default", conflict: false, warnings: [] };
}

export function isGroundedResearchShadowEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return resolveResearchRolloutConfig(environment).mode === "shadow";
}

export function isResearchEvidenceCacheEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment[D7_RESEARCH_EVIDENCE_CACHE_FLAG] === "1";
}

export function isPublicResearchCitationEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment[D7_RESEARCH_PUBLIC_CITATIONS_FLAG] === "1";
}

export function resolveResearchRolloutExecution(environment: NodeJS.ProcessEnv = process.env): ResearchRolloutConfig & {
  activeResearchAllowed: boolean;
  publicCitationsEnabled: boolean;
} {
  const rollout = resolveResearchRolloutConfig(environment);
  const publicCitationsEnabled = isPublicResearchCitationEnabled(environment);
  return {
    ...rollout,
    activeResearchAllowed: rollout.mode === "active" && publicCitationsEnabled && !rollout.conflict,
    publicCitationsEnabled,
    warnings: [...rollout.warnings, ...(rollout.mode === "active" && !publicCitationsEnabled ? ["research_active_public_citations_required"] : [])],
  };
}
