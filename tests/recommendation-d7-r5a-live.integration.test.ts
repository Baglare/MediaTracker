import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createVerifiedCandidateIdentity } from "@/features/recommendations/providers/candidate-identity";
import { resolveWikipediaPage } from "@/features/recommendations/research/adapters/wikipedia/page-resolver";
import { acquireResearchSources } from "@/features/recommendations/research/acquisition/orchestrator";
import { RESEARCH_ACQUISITION_POLICY_VERSION } from "@/features/recommendations/research/acquisition/types";
import { RESEARCH_POLICY_VERSION } from "@/features/recommendations/research/cache/key";
import { RESEARCH_SOURCE_REGISTRY_VERSION } from "@/features/recommendations/research/domain/source-registry";
import { createResearchVersionScope } from "@/features/recommendations/research/domain/version-scope";
import { buildGroundedEvidenceUnits } from "@/features/recommendations/research/extraction/domain/evidence-units";
import { extractGroundedResearch } from "@/features/recommendations/research/extraction/orchestration/service";
import { buildMinimizedGroundedModelInput } from "@/features/recommendations/research/extraction/prompt/input-builder";
import { SecureResearchHttpClientImpl } from "@/features/recommendations/research/network/secure-http-client";
import { normalizeResearchDocument } from "@/features/recommendations/research/passages/normalizer";
import { scorePassageLexicalRelevance } from "@/features/recommendations/research/passages/relevance";
import { segmentResearchDocument } from "@/features/recommendations/research/passages/segmenter";
import { researchDirectWikimediaSource } from "@/features/recommendations/research/orchestration/direct-source-research";
import { createGroundedExtractionRequest } from "@/features/recommendations/research/testing/extraction-fixtures";

const LIVE = process.env.D7_R5A_EVIDENCE_GAP_LIVE_SMOKE === "1"
  && process.env.MEDIA_TRACKER_WIKIMEDIA_RESEARCH_ENABLED === "1"
  && process.env.D7_RESEARCH_LIVE_SMOKE === "1"
  && process.env.D7_RESEARCH_EXTRACTION_PROVIDER === "groq"
  && process.env.D7_GROQ_GROUNDED_EXTRACTION_ENABLED === "1"
  && process.env.GROQ_RESEARCH_EXTRACTION_MODEL === "openai/gpt-oss-20b"
  && Boolean(process.env.GROQ_API_KEY)
  && Boolean(process.env.MEDIA_TRACKER_RESEARCH_USER_AGENT);

const AUDIT_TERMS = ["romantic feeling", "romantic feelings", "feelings for each other", "confess", "kiss", "love", "relationship"] as const;

function diagnostic(text: string) {
  const normalized = text.normalize("NFKC").toLocaleLowerCase("en");
  const sentences = normalized.match(/[^.!?]+[.!?]?/g) ?? [];
  const matching = sentences.filter((sentence) => AUDIT_TERMS.some((term) => sentence.includes(term)));
  const offsets = AUDIT_TERMS.flatMap((term) => {
    const output: number[] = [];
    let cursor = normalized.indexOf(term);
    while (cursor >= 0) { output.push(cursor); cursor = normalized.indexOf(term, cursor + term.length); }
    return output;
  }).sort((a, b) => a - b);
  const bucket = (offset: number | undefined) => offset === undefined ? "none" : `${Math.min(75, Math.floor((offset / Math.max(1, normalized.length)) * 4) * 25)}-${Math.min(100, Math.floor((offset / Math.max(1, normalized.length)) * 4) * 25 + 25)}%`;
  return { evidencePresent: offsets.length > 0, matchingSentenceCount: matching.length, firstOffsetBucket: bucket(offsets[0]), lastOffsetBucket: bucket(offsets.at(-1)) };
}

describe.skipIf(!LIVE)("D7-R5A bounded evidence-gap acceptance", () => {
  it("exact revision full extract evidence'ını passage/unit üzerinden grounded significant claim'e taşır", async () => {
    const identity = createVerifiedCandidateIdentity({ primaryProvider: "anilist", primaryExternalId: "9253", mediaType: "anime", secondaryIds: [{ kind: "anilist", externalId: "9253" }] });
    const versionScope = createResearchVersionScope({ identity, scopeKind: "work" });
    const httpClient = new SecureResearchHttpClientImpl();
    const direct = await researchDirectWikimediaSource({ identity, versionScope, httpClient, environment: process.env });
    expect(direct.status).toBe("document_ready");
    if (direct.status !== "document_ready" || !direct.wikimediaIdentity) throw new Error("r5a_direct_unavailable");
    const page = await resolveWikipediaPage({ identity: direct.wikimediaIdentity, httpClient, userAgent: process.env.MEDIA_TRACKER_RESEARCH_USER_AGENT as string });
    expect(page.status).toBe("resolved");
    if (page.status !== "resolved") throw new Error("r5a_page_unavailable");

    expect(direct.documents[0].revisionId).toBe(page.page.revisionId);
    const normalized = await normalizeResearchDocument({ text: direct.documents[0].boundedText, title: direct.documents[0].title });
    const documentEvidence = diagnostic(normalized.text);
    const segments = segmentResearchDocument(normalized.text);
    const relevantSegments = segments.filter((segment) => diagnostic(segment.text).evidencePresent);
    const lexicalSegments = relevantSegments.filter((segment) => scorePassageLexicalRelevance({ text: segment.text, aspectId: "romance" }).score > 0);
    expect(documentEvidence.evidencePresent).toBe(true);
    expect(relevantSegments.length).toBeGreaterThan(0);
    expect(lexicalSegments.length).toBeGreaterThan(0);

    const acquired = await acquireResearchSources({ version: 1, candidateIdentity: identity, versionScope, wikimediaIdentity: direct.wikimediaIdentity, aspectId: "romance", role: "must", minimumLevel: "significant", directDocuments: [{ document: direct.documents[0], citation: direct.citations[0] }], discoveredSources: [], maxDocuments: 2, maxPassages: 8, maxPacketCharacters: 10_000, requestId: `d7-r5a-acquire-${Date.now()}`, researchPolicyVersion: RESEARCH_POLICY_VERSION, sourceRegistryVersion: RESEARCH_SOURCE_REGISTRY_VERSION, acquisitionPolicyVersion: RESEARCH_ACQUISITION_POLICY_VERSION }, { httpClient, environment: process.env });
    expect(acquired.status).toBe("packet_ready");
    if (acquired.status !== "packet_ready") throw new Error("r5a_packet_unavailable");
    const relevantPassages = acquired.packet.passages.filter((passage) => diagnostic(passage.text).evidencePresent);
    expect(relevantPassages.length).toBeGreaterThan(0);
    const request = await createGroundedExtractionRequest({ packet: acquired.packet, requestId: `d7-r5a-extract-${Date.now()}` });
    const units = await buildGroundedEvidenceUnits({ packet: acquired.packet, maxUnits: request.maxEvidenceUnits });
    const relevantUnits = units.eligibleUnits.filter((unit) => diagnostic(unit.text).evidencePresent);
    expect(relevantUnits.length).toBeGreaterThan(0);
    const modelInput = buildMinimizedGroundedModelInput({ request, units: units.eligibleUnits });
    expect(relevantUnits.every((unit) => modelInput.evidenceUnits.some((item) => item.unitId === unit.unitId))).toBe(true);

    const extraction = await extractGroundedResearch(request, { environment: process.env });
    console.info(`[D7-R5A live] anilist=9253 qid=${direct.wikimediaIdentity.wikidataEntityId} sitelink=enwiki title=${page.page.canonicalTitle} page=${page.page.pageId} revision=${page.page.revisionId} scope=work chars=${normalized.text.length} evidence=${documentEvidence.evidencePresent} matches=${documentEvidence.matchingSentenceCount} first_bucket=${documentEvidence.firstOffsetBucket} last_bucket=${documentEvidence.lastOffsetBucket} truncation=${normalized.text.length >= 23_900 ? "possible_at_bound" : "not_observed"} segments=${segments.length} relevant_segments=${relevantSegments.length} lexical_segments=${lexicalSegments.length} selected_relevant=${relevantPassages.length} eligible_units=${units.eligibleUnits.length} relevant_units=${relevantUnits.length} model_units=${modelInput.evidenceUnits.length} extraction=${extraction.status} warnings=${extraction.warnings.join(",") || "none"} assessments=${extraction.assessments.length} claims=${extraction.claims.length} decision=${extraction.decision?.status ?? "none"} level=${extraction.decision?.level ?? "none"}`);
    expect(extraction.status).toBe("claims_extracted");
    expect(extraction.assessments.some((assessment) => assessment.finding === "supports_presence" && assessment.evidenceUnitIds.some((unitId) => relevantUnits.some((unit) => unit.unitId === unitId)))).toBe(true);
    expect(extraction.claims.length).toBeGreaterThan(0);
    expect(extraction.decision).toMatchObject({ status: "supported", level: expect.stringMatching(/significant|primary/), confidence: expect.stringMatching(/low|medium/) });
    expect(extraction).not.toHaveProperty("rawResponse");
    expect(JSON.stringify(extraction)).not.toMatch(/boundedText|passageId.*text|provider response/i);
  }, 25_000);
});
