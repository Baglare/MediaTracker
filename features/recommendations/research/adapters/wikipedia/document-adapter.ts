import "server-only";

import { createHash } from "node:crypto";
import { validatePersistedResearchCitation, validateTransientResearchDocument } from "../../domain/citations";
import type { PersistedResearchCitation, TransientResearchDocument } from "../../domain/types";
import { inspectResearchContent } from "../../security/content-policy";
import { WIKIPEDIA_EXTRACT_RESPONSE_MAX_BYTES, WIKIPEDIA_EXTRACT_TEXT_MAX_BYTES } from "../../network/response-limits";
import type { SecureResearchHttpClient } from "../../network/types";
import type { ResolvedWikipediaPage } from "../types";
import { decodeWikipediaExtractResponse } from "./codec";

const PROJECT_HOSTS = { enwiki: "en.wikipedia.org", trwiki: "tr.wikipedia.org" } as const;

export function buildWikipediaExtractQueryUrl(page: ResolvedWikipediaPage): string {
  const url = new URL(`https://${PROJECT_HOSTS[page.wikiProject]}/w/api.php`);
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "info|pageprops|revisions|extracts");
  url.searchParams.set("inprop", "url");
  url.searchParams.set("rvprop", "ids|timestamp");
  url.searchParams.set("rvlimit", "1");
  url.searchParams.set("explaintext", "1");
  url.searchParams.set("pageids", String(page.pageId));
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  return url.toString();
}

function validatePlaintext(text: string): string {
  const normalized = text.normalize("NFC").replace(/\r\n?/g, "\n");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) throw new Error("wikipedia_extract_control_character");
  if (Buffer.byteLength(normalized, "utf8") > WIKIPEDIA_EXTRACT_TEXT_MAX_BYTES) throw new Error("wikipedia_extract_oversized");
  return normalized;
}

export async function fetchWikipediaDirectDocument(input: {
  page: ResolvedWikipediaPage;
  httpClient: SecureResearchHttpClient;
  userAgent: string;
  now?: () => Date;
  signal?: AbortSignal;
}): Promise<{ document: TransientResearchDocument; citation: PersistedResearchCitation }> {
  const response = await input.httpClient.request({
    sourceId: "wikipedia", url: buildWikipediaExtractQueryUrl(input.page), method: "GET",
    headers: { userAgent: input.userAgent, apiUserAgent: input.userAgent, accept: "application/json", acceptEncoding: "gzip, deflate" },
    timeoutMs: 3_500, maxResponseBytes: WIKIPEDIA_EXTRACT_RESPONSE_MAX_BYTES, acceptedContentTypes: ["application/json"],
    redirectPolicy: { mode: "manual", maxRedirects: 2 }, requestId: `wikipedia-document-${input.page.pageId}-${input.page.revisionId}`, maxAttempts: 2, signal: input.signal,
  });
  if (response.status !== 200) throw new Error(`wikipedia_extract_http_${response.status}`);
  const decoded = decodeWikipediaExtractResponse(response.body, input.page.wikidataEntityId);
  if (decoded.pageId !== input.page.pageId || decoded.revisionId !== input.page.revisionId) throw new Error("wikipedia_revision_changed");
  const boundedText = validatePlaintext(decoded.extract);
  const hashHex = createHash("sha256").update(boundedText, "utf8").digest("hex");
  const contentHash = `sha256:${hashHex}`;
  const fetchedAt = (input.now ?? (() => new Date()))().toISOString();
  const securityFlags = inspectResearchContent({ text: boundedText, language: input.page.language, supportedLanguages: ["en", "tr"], sourceIdentityMatches: true });
  const document: TransientResearchDocument = {
    documentId: `wikipedia:${input.page.pageId}:${input.page.revisionId}:${hashHex.slice(0, 16)}`,
    sourceId: "wikipedia", canonicalUrl: input.page.canonicalUrl, revisionId: input.page.revisionId,
    fetchedAt, title: decoded.title, boundedText, contentHash, securityFlags, retention: "transient_only",
  };
  const documentResult = validateTransientResearchDocument(document);
  if (!documentResult.ok) throw new Error(`wikipedia_document_invalid:${documentResult.issues.map((issue) => issue.code).join(",")}`);
  const citation: PersistedResearchCitation = {
    citationId: `wikipedia:${input.page.pageId}:${input.page.revisionId}`,
    sourceId: "wikipedia", canonicalUrl: input.page.revisionUrl, revisionId: input.page.revisionId,
    accessedAt: fetchedAt, sectionOrLocator: decoded.title, sourceContentHash: contentHash,
    attribution: `Wikipedia contributors, “${decoded.title}”, revision ${input.page.revisionId}, accessed ${fetchedAt}`,
    licenseClass: "cc_by_sa",
  };
  const citationResult = validatePersistedResearchCitation(citation);
  if (!citationResult.ok) throw new Error(`wikipedia_citation_invalid:${citationResult.issues.map((issue) => issue.code).join(",")}`);
  return { document, citation };
}
