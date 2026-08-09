import "server-only";

export const D7_RESEARCH_SHADOW_FLAG = "D7_RESEARCH_SHADOW_ENABLED" as const;
export const D7_RESEARCH_EVIDENCE_CACHE_FLAG = "D7_RESEARCH_EVIDENCE_CACHE_ENABLED" as const;

export function isGroundedResearchShadowEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment[D7_RESEARCH_SHADOW_FLAG] === "1";
}

export function isResearchEvidenceCacheEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment[D7_RESEARCH_EVIDENCE_CACHE_FLAG] === "1";
}
