import type { ResearchDocumentSecurityFlag, TransientResearchDocument } from "../domain/types";

export const RESEARCH_DOCUMENT_MAX_TEXT_LENGTH = 24_000;
export const RESEARCH_DOCUMENT_MAX_TITLE_LENGTH = 240;

const PROMPT_INJECTION_PATTERN = /(?:ignore|disregard|override).{0,40}(?:instruction|prompt|system)|(?:system|assistant|developer)\s*:/i;
const HTML_OR_SCRIPT_PATTERN = /<\/?(?:script|style|iframe|form|html|body|svg)\b|javascript:/i;

export function inspectResearchContent(input: {
  text: string;
  language?: string;
  supportedLanguages?: readonly string[];
  sourceIdentityMatches?: boolean;
}): readonly ResearchDocumentSecurityFlag[] {
  const flags = new Set<ResearchDocumentSecurityFlag>();
  if (input.text.length > RESEARCH_DOCUMENT_MAX_TEXT_LENGTH) flags.add("oversized_content");
  if (PROMPT_INJECTION_PATTERN.test(input.text)) flags.add("prompt_injection_detected");
  if (HTML_OR_SCRIPT_PATTERN.test(input.text)) flags.add("script_or_html_detected");
  if (input.language && input.supportedLanguages && !input.supportedLanguages.includes(input.language)) flags.add("unsupported_language");
  if (input.sourceIdentityMatches === false) flags.add("source_identity_mismatch");
  return [...flags].sort();
}

export function researchDocumentClaimEligible(document: TransientResearchDocument): boolean {
  return document.retention === "transient_only"
    && document.boundedText.length > 0
    && document.boundedText.length <= RESEARCH_DOCUMENT_MAX_TEXT_LENGTH
    && document.title.length > 0
    && document.title.length <= RESEARCH_DOCUMENT_MAX_TITLE_LENGTH
    && document.securityFlags.length === 0;
}

