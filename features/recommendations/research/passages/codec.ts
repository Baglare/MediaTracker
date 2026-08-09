import type { RecommendationDecodeResult, RecommendationDomainIssue } from "../../domain/types";
import { validatePersistedResearchCitation } from "../domain/citations";
import { validateResearchVersionScope } from "../domain/version-scope";
import type { GroundedResearchPacket } from "./types";
import { RESEARCH_PACKET_HARD_MAX_CHARACTERS, RESEARCH_PASSAGE_HARD_MAX_CHARACTERS, RESEARCH_PASSAGE_POLICY_VERSION } from "./types";

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

function issue(code: string, path: string, message: string): RecommendationDomainIssue { return { code, path, message }; }

export function validateGroundedResearchPacket(packet: GroundedResearchPacket): RecommendationDecodeResult<GroundedResearchPacket> {
  const issues: RecommendationDomainIssue[] = [];
  const allowed = new Set([
    "version", "candidateIdentity", "versionScope", "aspectId", "role", "minimumLevel", "documents", "citations",
    "passages", "sourceCount", "publisherCount", "packetContentHash", "createdAt", "retention", "warnings",
    "securityFlags", "acquisitionPolicyVersion", "passagePolicyVersion",
  ]);
  for (const key of Object.keys(packet)) if (!allowed.has(key)) issues.push(issue("research_packet_unknown_field", key, "Packet bilinmeyen alan kabul etmez."));
  if (packet.version !== 1 || packet.retention !== "transient_only" || packet.passagePolicyVersion !== RESEARCH_PASSAGE_POLICY_VERSION) issues.push(issue("research_packet_contract_invalid", "$", "Packet version/policy/retention geçersiz."));
  if (!validateResearchVersionScope({ identity: packet.candidateIdentity, scope: packet.versionScope }).ok) issues.push(issue("research_packet_scope_invalid", "versionScope", "Packet exact identity scope taşımalıdır."));
  if (!HASH_PATTERN.test(packet.packetContentHash) || !Number.isFinite(Date.parse(packet.createdAt))) issues.push(issue("research_packet_metadata_invalid", "$", "Packet hash/time metadata geçersiz."));
  if (packet.sourceCount !== packet.documents.length || packet.publisherCount !== new Set(packet.documents.map((document) => document.sourceId)).size) issues.push(issue("research_packet_count_invalid", "$", "Packet source/publisher sayıları türetilmiş değerlerle eşleşmelidir."));
  const citations = new Map(packet.citations.map((citation) => [citation.citationId, citation]));
  for (const citation of packet.citations) if (!validatePersistedResearchCitation(citation).ok) issues.push(issue("research_packet_citation_invalid", "citations", "Packet citation metadata geçersiz."));
  let characters = 0;
  for (const [index, passage] of packet.passages.entries()) {
    characters += passage.text.length;
    if (!passage.text || passage.text.length > RESEARCH_PASSAGE_HARD_MAX_CHARACTERS || passage.endOffset - passage.startOffset !== passage.text.length) issues.push(issue("research_passage_bounds_invalid", `passages.${index}`, "Passage text ve offset sınırları uyuşmalıdır."));
    if (!HASH_PATTERN.test(passage.passageId) || !HASH_PATTERN.test(passage.textHash) || passage.retention !== "transient_only") issues.push(issue("research_passage_metadata_invalid", `passages.${index}`, "Passage ID/hash/retention geçersiz."));
    const citation = citations.get(passage.citationId);
    if (!citation || citation.revisionId !== passage.revisionId) issues.push(issue("research_passage_citation_mismatch", `passages.${index}.citationId`, "Passage revision-bound citation'a bağlanmalıdır."));
    const document = packet.documents.find((item) => item.documentId === passage.documentId);
    if (!document || document.pageId !== passage.pageId || document.revisionId !== passage.revisionId) issues.push(issue("research_passage_document_mismatch", `passages.${index}.documentId`, "Passage exact document/page/revision'a bağlanmalıdır."));
  }
  if (characters > RESEARCH_PACKET_HARD_MAX_CHARACTERS) issues.push(issue("research_packet_characters_oversized", "passages", "Packet character hard limit'i aşamaz."));
  if (Object.hasOwn(packet as object, "claims") || Object.hasOwn(packet as object, "decision")) issues.push(issue("research_packet_semantic_output_forbidden", "$", "R3A packet claim/decision taşımaz."));
  return issues.length > 0 ? { ok: false, issues } : { ok: true, value: packet };
}

