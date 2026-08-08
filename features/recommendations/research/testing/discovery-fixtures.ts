import { createVerifiedCandidateIdentity } from "../../providers/candidate-identity";
import { createResearchVersionScope } from "../domain/version-scope";
import type { ResearchDiscoveryRequest } from "../discovery/types";
import { RESEARCH_POLICY_VERSION } from "../cache/key";

export function steinsGateDiscoveryRequest(overrides: Partial<ResearchDiscoveryRequest> = {}): ResearchDiscoveryRequest {
  const candidateIdentity = createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: "9253", mediaType: "anime" });
  return {
    version: 1,
    candidateIdentity,
    versionScope: createResearchVersionScope({ identity: candidateIdentity, scopeKind: "work" }),
    titleSnapshot: "Steins;Gate",
    releaseYear: 2011,
    mediaType: "anime",
    aspectId: "romance",
    role: "must",
    minimumLevel: "significant",
    allowedSourceIds: ["wikipedia"],
    allowedDomains: ["wikipedia.org"],
    maxSources: 5,
    requestId: "d7-r2b-test",
    researchPolicyVersion: RESEARCH_POLICY_VERSION,
    ...overrides,
  };
}
