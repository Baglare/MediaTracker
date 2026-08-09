import type { ResolvedWikimediaIdentity } from "../adapters/types";
import { validatePersistedResearchCitation, validateTransientResearchDocument } from "../domain/citations";
import type { DirectResearchDocumentInput } from "./types";

const DOCUMENT_ID = /^wikipedia:(\d+):(\d+):[a-f0-9]{16}$/;
const CITATION_ID = /^wikipedia:(\d+):(\d+)$/;
const QID = /^Q[1-9]\d*$/;

export type DirectDocumentResolution =
  | { ok: true; pageId: number; revisionId: string; language: "en" | "tr"; wikidataEntityId: string }
  | { ok: false; reason: string };

export function validateResolvedWikimediaScope(input: {
  identity: ResolvedWikimediaIdentity;
  candidateCanonicalKey: string;
  versionScopeKey: string;
}): boolean {
  return input.identity.verificationStatus === "verified"
    && input.identity.candidateCanonicalKey === input.candidateCanonicalKey
    && input.identity.versionScopeKey === input.versionScopeKey
    && QID.test(input.identity.wikidataEntityId);
}

export function resolveDirectResearchDocument(input: {
  value: DirectResearchDocumentInput;
  wikimediaIdentity: ResolvedWikimediaIdentity;
}): DirectDocumentResolution {
  const documentValidation = validateTransientResearchDocument(input.value.document);
  const citationValidation = validatePersistedResearchCitation(input.value.citation);
  if (!documentValidation.ok || !citationValidation.ok) return { ok: false, reason: "direct_document_or_citation_invalid" };
  const documentMatch = DOCUMENT_ID.exec(input.value.document.documentId);
  const citationMatch = CITATION_ID.exec(input.value.citation.citationId);
  if (!documentMatch || !citationMatch) return { ok: false, reason: "direct_document_identity_metadata_invalid" };
  const pageId = Number(documentMatch[1]);
  const revisionId = documentMatch[2];
  if (citationMatch[1] !== documentMatch[1] || citationMatch[2] !== revisionId
    || input.value.document.revisionId !== revisionId || input.value.citation.revisionId !== revisionId
    || input.value.document.sourceId !== input.value.citation.sourceId
    || input.value.citation.sourceContentHash !== input.value.document.contentHash) {
    return { ok: false, reason: "direct_document_citation_relation_invalid" };
  }
  const hostname = new URL(input.value.document.canonicalUrl).hostname;
  const language = hostname === "en.wikipedia.org" ? "en" : hostname === "tr.wikipedia.org" ? "tr" : null;
  if (!language) return { ok: false, reason: "direct_document_language_host_invalid" };
  return { ok: true, pageId, revisionId, language, wikidataEntityId: input.wikimediaIdentity.wikidataEntityId };
}

export function researchDocumentRevisionKey(input: { sourceId: string; pageId: number; revisionId: string }): string {
  return `${input.sourceId}:${input.pageId}:${input.revisionId}`;
}

