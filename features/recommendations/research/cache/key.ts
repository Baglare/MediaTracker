import type { AspectId } from "../../domain/aspect-registry";
import { RESEARCH_SOURCE_REGISTRY_VERSION } from "../domain/source-registry";
import type { ResearchEvidenceCacheKey, ResearchVersionScope } from "../domain/types";

export const RESEARCH_POLICY_VERSION = "d7-r1.1" as const;
export const RESEARCH_EXTRACTION_POLICY_VERSION = "d7-r1.extract.1" as const;

export function buildResearchEvidenceCacheKey(input: {
  versionScope: ResearchVersionScope;
  aspectId: AspectId;
  researchPolicyVersion?: string;
  sourceRegistryVersion?: string;
  extractionPolicyVersion?: string;
}): ResearchEvidenceCacheKey {
  const researchPolicyVersion = input.researchPolicyVersion ?? RESEARCH_POLICY_VERSION;
  const sourceRegistryVersion = input.sourceRegistryVersion ?? RESEARCH_SOURCE_REGISTRY_VERSION;
  const extractionPolicyVersion = input.extractionPolicyVersion ?? RESEARCH_EXTRACTION_POLICY_VERSION;
  const components = [input.versionScope.scopeKey, input.aspectId, researchPolicyVersion, sourceRegistryVersion, extractionPolicyVersion];
  return {
    key: `research-evidence-cache:v1:${components.map(encodeURIComponent).join(":")}`,
    scopeKey: input.versionScope.scopeKey,
    aspectId: input.aspectId,
    researchPolicyVersion,
    sourceRegistryVersion,
    extractionPolicyVersion,
  };
}

