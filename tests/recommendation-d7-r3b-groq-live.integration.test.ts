import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { acquireResearchSources } from "@/features/recommendations/research/acquisition/orchestrator";
import { RESEARCH_ACQUISITION_POLICY_VERSION } from "@/features/recommendations/research/acquisition/types";
import { RESEARCH_POLICY_VERSION } from "@/features/recommendations/research/cache/key";
import { RESEARCH_SOURCE_REGISTRY_VERSION } from "@/features/recommendations/research/domain/source-registry";
import { createResearchVersionScope } from "@/features/recommendations/research/domain/version-scope";
import { extractGroundedResearch } from "@/features/recommendations/research/extraction/orchestration/service";
import { isMeaningfulWikimediaUserAgent } from "@/features/recommendations/research/network/environment";
import { SecureResearchHttpClientImpl } from "@/features/recommendations/research/network/secure-http-client";
import { researchDirectWikimediaSource } from "@/features/recommendations/research/orchestration/direct-source-research";
import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import { createGroundedExtractionRequest } from "@/features/recommendations/research/testing/extraction-fixtures";

const GROQ_LIVE = process.env.D7_RESEARCH_EXTRACTION_PROVIDER === "groq"
  && process.env.D7_GROQ_GROUNDED_EXTRACTION_ENABLED === "1"
  && process.env.D7_GROQ_GROUNDED_EXTRACTION_LIVE_SMOKE === "1"
  && Boolean(process.env.GROQ_API_KEY)
  && process.env.GROQ_RESEARCH_EXTRACTION_MODEL === "openai/gpt-oss-20b";

const WIKIMEDIA_LIVE = process.env.D7_RESEARCH_LIVE_SMOKE === "1"
  && process.env.MEDIA_TRACKER_WIKIMEDIA_RESEARCH_ENABLED === "1"
  && isMeaningfulWikimediaUserAgent(process.env.MEDIA_TRACKER_RESEARCH_USER_AGENT);

describe.skipIf(!GROQ_LIVE)("D7-R3B conditional Groq grounded extraction live", () => {
  it("synthetic grounded packet strict/citation-bound claim üretir", async () => {
    const request = await createGroundedExtractionRequest({ requestId: `d7-r3b-groq-live-${Date.now()}` });
    const result = await extractGroundedResearch(request);
    expect(result.status, `Controlled Groq extraction failure: ${result.status} ${result.warnings.join(",")}`).toBe("claims_extracted");
    expect(result).toMatchObject({ providerId: "groq", modelId: "openai/gpt-oss-20b", decision: { status: "supported", level: "significant" }, provenance: { packetContentHash: request.packet.packetContentHash } });
    expect(result.claims.length).toBeGreaterThan(0);
    expect(result.claims.every((claim) => claim.citationIds.length > 0 && claim.citationIds.every((citationId) => request.packet.citations.some((citation) => citation.citationId === citationId)))).toBe(true);
    expect(result.assessments.every((assessment) => assessment.evidenceUnitIds.length > 0)).toBe(true);
    expect(result).not.toHaveProperty("rawResponse");
    expect(result).not.toHaveProperty("reasoning");
  }, 15_000);

  it.skipIf(!WIKIMEDIA_LIVE)("real Steins;Gate R3A packet only yields schema/grounding-valid controlled result", async () => {
    const candidateIdentity = createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: "9253", mediaType: "anime", secondaryIds: [{ kind: "anilist", externalId: "9253" }] });
    const versionScope = createResearchVersionScope({ identity: candidateIdentity, scopeKind: "work" });
    const httpClient = new SecureResearchHttpClientImpl();
    const direct = await researchDirectWikimediaSource({ identity: candidateIdentity, versionScope, httpClient, environment: process.env });
    expect(direct.status).toBe("document_ready");
    if (direct.status !== "document_ready" || !direct.wikimediaIdentity) throw new Error("r3b_live_direct_document_unavailable");
    const acquired = await acquireResearchSources({ version: 1, candidateIdentity, versionScope, wikimediaIdentity: direct.wikimediaIdentity, aspectId: "romance", role: "must", minimumLevel: "significant", directDocuments: [{ document: direct.documents[0], citation: direct.citations[0] }], discoveredSources: [], maxDocuments: 2, maxPassages: 8, maxPacketCharacters: 10_000, requestId: `d7-r3b-real-acquire-${Date.now()}`, researchPolicyVersion: RESEARCH_POLICY_VERSION, sourceRegistryVersion: RESEARCH_SOURCE_REGISTRY_VERSION, acquisitionPolicyVersion: RESEARCH_ACQUISITION_POLICY_VERSION }, { httpClient, environment: process.env });
    expect(acquired.status).toBe("packet_ready");
    if (acquired.status !== "packet_ready") throw new Error("r3b_live_packet_unavailable");
    const request = await createGroundedExtractionRequest({ packet: acquired.packet, requestId: `d7-r3b-real-extract-${Date.now()}` });
    const result = await extractGroundedResearch(request);
    console.info(`[D7-R3B live] real_result=${result.status} assessments=${result.assessments.length} claims=${result.claims.length}`);
    expect(["claims_extracted", "no_claims_extracted"], `Controlled real-packet extraction result: ${result.status} ${result.warnings.join(",")}`).toContain(result.status);
    expect(result.providerId).toBe("groq");
    expect(result.assessments.every((assessment) => assessment.evidenceUnitIds.every((unitId) => /^sha256:[a-f0-9]{64}$/.test(unitId)))).toBe(true);
    expect(result).not.toHaveProperty("rawResponse");
    expect(result).not.toHaveProperty("reasoning");
  }, 25_000);
});
