import type { AspectId } from "../../domain/aspect-registry";
import type { ConstraintRole } from "../../domain/types";
import type { RecommendationCandidateIdentity } from "../../providers/types";
import { validatePersistedResearchCitation } from "../domain/citations";
import type { ResearchClaimLevel, ResearchVersionScope } from "../domain/types";
import { validateResearchVersionScope } from "../domain/version-scope";
import { selectGroundedResearchPassages, type PassageSelectionDocument } from "./coverage-selection";
import { researchSha256 } from "./hash";
import { normalizeResearchDocument } from "./normalizer";
import { segmentResearchDocument } from "./segmenter";
import type {
  GroundedResearchPacket,
  GroundedResearchPacketDocument,
  PassageBuildTelemetry,
  ResearchPacketDocumentInput,
  ResearchPassageSecurityFlag,
} from "./types";
import { RESEARCH_PACKET_HARD_MAX_CHARACTERS, RESEARCH_PASSAGE_POLICY_VERSION } from "./types";

export type ResearchPacketBuildResult =
  | { status: "packet_ready"; packet: GroundedResearchPacket; telemetry: PassageBuildTelemetry; warnings: readonly string[] }
  | { status: "passage_insufficient" | "security_rejected"; telemetry: PassageBuildTelemetry; warnings: readonly string[] };

function emptyTelemetry(): PassageBuildTelemetry {
  return { documentBytes: 0, normalizedCharacters: 0, segmentCount: 0, lexicalPassageCount: 0, coveragePassageCount: 0, injectionFlagCount: 0, packetCharacters: 0 };
}

export async function computeGroundedResearchPacketContentHash(packet: Pick<GroundedResearchPacket, "candidateIdentity" | "versionScope" | "aspectId" | "role" | "minimumLevel" | "documents" | "citations" | "passages" | "acquisitionPolicyVersion" | "passagePolicyVersion">): Promise<string> {
  return researchSha256(JSON.stringify({
    candidate: packet.candidateIdentity.canonicalKey, scope: packet.versionScope.scopeKey,
    aspectId: packet.aspectId, role: packet.role, minimumLevel: packet.minimumLevel ?? null,
    documents: packet.documents.map((document) => [document.documentId, document.contentHash, document.revisionId]),
    citations: packet.citations.map((citation) => [citation.citationId, citation.revisionId, citation.sourceContentHash]),
    passages: packet.passages.map((passage) => [passage.passageId, passage.textHash, passage.selectionReason]),
    acquisitionPolicyVersion: packet.acquisitionPolicyVersion, passagePolicyVersion: packet.passagePolicyVersion,
  }));
}

export async function buildGroundedResearchPacket(input: {
  candidateIdentity: RecommendationCandidateIdentity;
  versionScope: ResearchVersionScope;
  aspectId: AspectId;
  role: ConstraintRole;
  minimumLevel?: Exclude<ResearchClaimLevel, null>;
  documents: readonly ResearchPacketDocumentInput[];
  maxPassages: number;
  maxPacketCharacters: number;
  acquisitionPolicyVersion: string;
  now?: () => Date;
}): Promise<ResearchPacketBuildResult> {
  const telemetry = emptyTelemetry();
  const warnings = new Set<string>();
  if (!validateResearchVersionScope({ identity: input.candidateIdentity, scope: input.versionScope }).ok) {
    return { status: "security_rejected", telemetry, warnings: ["packet_scope_identity_mismatch"] };
  }
  if (input.maxPassages < 1 || input.maxPassages > 8 || input.maxPacketCharacters < 250 || input.maxPacketCharacters > RESEARCH_PACKET_HARD_MAX_CHARACTERS) {
    return { status: "security_rejected", telemetry, warnings: ["packet_budget_invalid"] };
  }

  const packetDocuments: GroundedResearchPacketDocument[] = [];
  const selectionDocuments: PassageSelectionDocument[] = [];
  const citationByDocument = new Map<string, ResearchPacketDocumentInput["citation"]>();
  for (const [documentIndex, document] of input.documents.entries()) {
    telemetry.documentBytes += new TextEncoder().encode(document.text).byteLength;
    const citation = validatePersistedResearchCitation(document.citation);
    if (!citation.ok || document.citation.revisionId !== document.revisionId || document.citation.sourceContentHash === undefined) {
      warnings.add("packet_citation_relation_invalid");
      continue;
    }
    try {
      const normalized = await normalizeResearchDocument({ text: document.text, title: document.title });
      const segments = segmentResearchDocument(normalized.text);
      telemetry.normalizedCharacters += normalized.text.length;
      telemetry.segmentCount += segments.length;
      telemetry.injectionFlagCount += segments.reduce((total, segment) => total + segment.securityFlags.length, 0);
      normalized.securityFlags.forEach((flag) => warnings.add(flag));
      packetDocuments.push({
        documentId: document.documentId, sourceId: document.sourceId, canonicalUrl: document.canonicalUrl,
        language: document.language, wikidataEntityId: document.wikidataEntityId, pageId: document.pageId,
        revisionId: document.revisionId, title: document.title, contentHash: normalized.contentHash,
        normalizedCharacterCount: normalized.text.length, securityFlags: normalized.securityFlags, retention: "transient_only",
      });
      selectionDocuments.push({
        documentIndex, documentId: document.documentId, citationId: document.citation.citationId,
        sourceId: document.sourceId, language: document.language, pageId: document.pageId,
        revisionId: document.revisionId, segments,
      });
      citationByDocument.set(document.documentId, document.citation);
    } catch (error) {
      warnings.add(error instanceof Error ? error.message : "packet_document_normalization_failed");
    }
  }
  if (packetDocuments.length === 0) return { status: "security_rejected", telemetry, warnings: [...warnings] };

  const passages = await selectGroundedResearchPassages({
    aspectId: input.aspectId, documents: selectionDocuments,
    maxPassages: input.maxPassages, maxCharacters: input.maxPacketCharacters,
  });
  telemetry.packetCharacters = passages.reduce((total, passage) => total + passage.text.length, 0);
  telemetry.lexicalPassageCount = passages.filter((passage) => passage.selectionReason === "lexical_relevance").length;
  telemetry.coveragePassageCount = passages.length - telemetry.lexicalPassageCount;
  if (passages.length === 0) return { status: "passage_insufficient", telemetry, warnings: [...warnings] };

  const includedDocumentIds = new Set(passages.map((passage) => passage.documentId));
  const documents = packetDocuments.filter((document) => includedDocumentIds.has(document.documentId));
  const citations = documents.map((document) => citationByDocument.get(document.documentId)).filter((citation): citation is NonNullable<typeof citation> => Boolean(citation));
  const securityFlags = [...new Set<ResearchPassageSecurityFlag>([
    ...documents.flatMap((document) => document.securityFlags),
    ...passages.flatMap((passage) => passage.securityFlags),
  ])].sort();
  const packetContentHash = await computeGroundedResearchPacketContentHash({
    candidateIdentity: input.candidateIdentity, versionScope: input.versionScope, aspectId: input.aspectId,
    role: input.role, ...(input.minimumLevel ? { minimumLevel: input.minimumLevel } : {}),
    documents, citations, passages, acquisitionPolicyVersion: input.acquisitionPolicyVersion,
    passagePolicyVersion: RESEARCH_PASSAGE_POLICY_VERSION,
  });
  const packet: GroundedResearchPacket = {
    version: 1, candidateIdentity: input.candidateIdentity, versionScope: input.versionScope,
    aspectId: input.aspectId, role: input.role, ...(input.minimumLevel ? { minimumLevel: input.minimumLevel } : {}),
    documents, citations, passages, sourceCount: documents.length,
    publisherCount: new Set(documents.map((document) => document.sourceId)).size,
    packetContentHash, createdAt: (input.now ?? (() => new Date()))().toISOString(), retention: "transient_only",
    warnings: [...warnings], securityFlags, acquisitionPolicyVersion: input.acquisitionPolicyVersion,
    passagePolicyVersion: RESEARCH_PASSAGE_POLICY_VERSION,
  };
  return { status: "packet_ready", packet, telemetry, warnings: [...warnings] };
}
