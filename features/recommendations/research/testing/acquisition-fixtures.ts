import { createVerifiedCandidateIdentity } from "../../providers/candidate-identity";
import { RESEARCH_POLICY_VERSION } from "../cache/key";
import { RESEARCH_SOURCE_REGISTRY_VERSION } from "../domain/source-registry";
import { createResearchVersionScope } from "../domain/version-scope";
import type { DiscoveredResearchSource } from "../discovery/types";
import { RESEARCH_ACQUISITION_POLICY_VERSION, type DirectResearchDocumentInput, type ResearchSourceAcquisitionRequest } from "../acquisition/types";
import { SYNTHETIC_RESEARCH_TEXT } from "./passage-fixtures";

export function r3aCandidateIdentity(externalId = "9253") {
  return createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: externalId, mediaType: "anime", secondaryIds: [{ kind: "anilist", externalId }] });
}

export function r3aWikimediaIdentity(scopeKey: string, qid = "Q123") {
  return {
    candidateCanonicalKey: r3aCandidateIdentity().canonicalKey,
    versionScopeKey: scopeKey,
    wikidataEntityId: qid,
    matchedPropertyId: "P8729",
    matchedExternalId: "9253",
    verificationStatus: "verified" as const,
    sitelinks: { enwiki: "Steins;Gate", trwiki: "Steins;Gate" },
    otherSitelinkKeys: [],
    entityRevisionId: "55",
    lastModified: "2026-08-08T00:00:00Z",
    resolvedAt: "2026-08-08T00:00:00Z",
    warnings: [],
  };
}

export function r3aDirectDocument(overrides: Partial<DirectResearchDocumentInput> = {}): DirectResearchDocumentInput {
  const contentHash = `sha256:${"a".repeat(64)}`;
  return {
    document: {
      documentId: "wikipedia:42:777:aaaaaaaaaaaaaaaa", sourceId: "wikipedia",
      canonicalUrl: "https://en.wikipedia.org/wiki/Steins%3BGate", revisionId: "777",
      fetchedAt: "2026-08-08T00:00:00Z", title: "Steins;Gate", boundedText: SYNTHETIC_RESEARCH_TEXT,
      contentHash, securityFlags: [], retention: "transient_only",
    },
    citation: {
      citationId: "wikipedia:42:777", sourceId: "wikipedia",
      canonicalUrl: "https://en.wikipedia.org/w/index.php?title=Steins%3BGate&oldid=777",
      revisionId: "777", accessedAt: "2026-08-08T00:00:00Z", sectionOrLocator: "Steins;Gate",
      sourceContentHash: contentHash, attribution: "Wikipedia contributors, Steins;Gate, revision 777",
      licenseClass: "cc_by_sa",
    },
    ...overrides,
  };
}

export function r3aDiscoveredSource(overrides: Partial<DiscoveredResearchSource> = {}): DiscoveredResearchSource {
  return {
    version: 1, sourceId: "wikipedia", canonicalUrl: "https://en.wikipedia.org/wiki/Steins%3BGate",
    hostname: "en.wikipedia.org", discoveryAdapter: "groq_compound_web_search", discoveryRank: 0,
    discoveredAt: "2026-08-08T00:00:00Z", queryFingerprint: `sha256:${"b".repeat(64)}`,
    sourceRegistryVersion: RESEARCH_SOURCE_REGISTRY_VERSION, warnings: [], ...overrides,
  };
}

export function r3aAcquisitionRequest(overrides: Partial<ResearchSourceAcquisitionRequest> = {}): ResearchSourceAcquisitionRequest {
  const candidateIdentity = r3aCandidateIdentity();
  const versionScope = createResearchVersionScope({ identity: candidateIdentity, scopeKind: "work" });
  return {
    version: 1, candidateIdentity, versionScope, wikimediaIdentity: r3aWikimediaIdentity(versionScope.scopeKey),
    aspectId: "romance", role: "must", minimumLevel: "significant",
    directDocuments: [r3aDirectDocument()], discoveredSources: [], maxDocuments: 2, maxPassages: 8,
    maxPacketCharacters: 10_000, requestId: "d7-r3a-test", researchPolicyVersion: RESEARCH_POLICY_VERSION,
    sourceRegistryVersion: RESEARCH_SOURCE_REGISTRY_VERSION, acquisitionPolicyVersion: RESEARCH_ACQUISITION_POLICY_VERSION,
    ...overrides,
  };
}

