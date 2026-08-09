import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { acquireResearchSources } from "@/features/recommendations/research/acquisition/orchestrator";
import { RESEARCH_ACQUISITION_POLICY_VERSION } from "@/features/recommendations/research/acquisition/types";
import { RESEARCH_POLICY_VERSION } from "@/features/recommendations/research/cache/key";
import { RESEARCH_SOURCE_REGISTRY_VERSION } from "@/features/recommendations/research/domain/source-registry";
import { createResearchVersionScope } from "@/features/recommendations/research/domain/version-scope";
import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import { isMeaningfulWikimediaUserAgent } from "@/features/recommendations/research/network/environment";
import { SecureResearchHttpClientImpl } from "@/features/recommendations/research/network/secure-http-client";
import { researchDirectWikimediaSource } from "@/features/recommendations/research/orchestration/direct-source-research";

const USER_AGENT = process.env.MEDIA_TRACKER_RESEARCH_USER_AGENT;
const LIVE = process.env.D7_RESEARCH_LIVE_SMOKE === "1"
  && process.env.MEDIA_TRACKER_WIKIMEDIA_RESEARCH_ENABLED === "1"
  && isMeaningfulWikimediaUserAgent(USER_AGENT);

describe.skipIf(!LIVE)("D7-R3A conditional Wikimedia packet live", () => {
  it("Steins;Gate exact direct document'tan revision-bound transient passage packet üretir", async () => {
    const candidateIdentity = createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: "9253", mediaType: "anime", secondaryIds: [{ kind: "anilist", externalId: "9253" }] });
    const versionScope = createResearchVersionScope({ identity: candidateIdentity, scopeKind: "work" });
    const httpClient = new SecureResearchHttpClientImpl();
    const direct = await researchDirectWikimediaSource({ identity: candidateIdentity, versionScope, httpClient, environment: process.env });
    expect(direct.status, `Controlled R2A failure: ${direct.status} ${direct.warnings.join(",")}`).toBe("document_ready");
    if (direct.status !== "document_ready" || !direct.wikimediaIdentity) throw new Error("r3a_live_direct_document_unavailable");
    const result = await acquireResearchSources({
      version: 1, candidateIdentity, versionScope, wikimediaIdentity: direct.wikimediaIdentity,
      aspectId: "romance", role: "must", minimumLevel: "significant",
      directDocuments: [{ document: direct.documents[0], citation: direct.citations[0] }], discoveredSources: [],
      maxDocuments: 2, maxPassages: 8, maxPacketCharacters: 10_000, requestId: `d7-r3a-live-${Date.now()}`,
      researchPolicyVersion: RESEARCH_POLICY_VERSION, sourceRegistryVersion: RESEARCH_SOURCE_REGISTRY_VERSION,
      acquisitionPolicyVersion: RESEARCH_ACQUISITION_POLICY_VERSION,
    }, { httpClient, environment: process.env });
    expect(result.status, `Controlled R3A failure: ${result.status} ${result.warnings.join(",")}`).toBe("packet_ready");
    expect(result.packet?.documents.length).toBeGreaterThan(0);
    expect(result.packet?.citations.length).toBeGreaterThan(0);
    expect(result.packet?.passages.length).toBeGreaterThan(0);
    expect(result.packet?.retention).toBe("transient_only");
    expect(result.packet?.passages.every((passage) => passage.text.length > 0 && passage.text.length <= 1_500)).toBe(true);
    expect(result.packet).not.toHaveProperty("claims");
    expect(result.packet).not.toHaveProperty("decision");
  }, 20_000);
});
