import { decodeStrictUtf8 } from "../../network/response-limits";

interface WikipediaPageCodecBase {
  pageId: number;
  title: string;
  fullUrl?: string;
  revisionId: string;
  revisionTimestamp: string;
  wikidataEntityId: string;
  warnings: readonly string[];
}

export type WikipediaPageCodecResult = WikipediaPageCodecBase;
export interface WikipediaExtractCodecResult extends WikipediaPageCodecBase { extract: string }

function parseRoot(bytes: Uint8Array): Record<string, unknown> {
  let parsed: unknown;
  try { parsed = JSON.parse(decodeStrictUtf8(bytes)); } catch { throw new Error("wikipedia_json_invalid"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("wikipedia_json_object_required");
  const root = parsed as Record<string, unknown>;
  if (root.error && typeof root.error === "object") {
    const code = (root.error as Record<string, unknown>).code;
    throw new Error(typeof code === "string" ? `wikipedia_api_error:${code}` : "wikipedia_api_error");
  }
  return root;
}

function pageObject(bytes: Uint8Array): { root: Record<string, unknown>; page: Record<string, unknown> } {
  const root = parseRoot(bytes);
  const query = root.query;
  if (!query || typeof query !== "object" || Array.isArray(query)) throw new Error("wikipedia_query_missing");
  const pages = (query as Record<string, unknown>).pages;
  if (!Array.isArray(pages)) throw new Error("wikipedia_pages_missing");
  const validPages = pages.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  if (validPages.length !== 1) throw new Error("wikipedia_page_ambiguous");
  if (validPages[0].missing !== undefined || validPages[0].invalid !== undefined) throw new Error("wikipedia_page_missing");
  return { root, page: validPages[0] };
}

function decodeBase(bytes: Uint8Array, expectedEntityId: string): WikipediaPageCodecBase & { page: Record<string, unknown> } {
  const { root, page } = pageObject(bytes);
  const pageId = page.pageid;
  const title = page.title;
  if (!Number.isInteger(pageId) || (pageId as number) <= 0 || typeof title !== "string" || !title.trim() || title.length > 240) throw new Error("wikipedia_page_identity_invalid");
  const pageprops = page.pageprops;
  if (!pageprops || typeof pageprops !== "object" || Array.isArray(pageprops)) throw new Error("wikipedia_pageprops_missing");
  if (Object.hasOwn(pageprops, "disambiguation")) throw new Error("wikipedia_disambiguation_page");
  const wikibaseItem = (pageprops as Record<string, unknown>).wikibase_item;
  if (wikibaseItem !== expectedEntityId) throw new Error("wikipedia_wikidata_identity_mismatch");
  const revisions = page.revisions;
  if (!Array.isArray(revisions) || revisions.length < 1 || !revisions[0] || typeof revisions[0] !== "object") throw new Error("wikipedia_revision_missing");
  const revision = revisions[0] as Record<string, unknown>;
  const revid = revision.revid;
  const timestamp = revision.timestamp;
  if (!Number.isInteger(revid) || (revid as number) <= 0 || typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp))) throw new Error("wikipedia_revision_invalid");
  const warnings: string[] = [];
  const query = root.query as Record<string, unknown>;
  if (Array.isArray(query.redirects) && query.redirects.length > 0) warnings.push("wikipedia_canonical_redirect");
  if (Array.isArray(query.normalized) && query.normalized.length > 0) warnings.push("wikipedia_title_normalized");
  return {
    pageId: pageId as number,
    title: title.trim(),
    ...(typeof page.fullurl === "string" ? { fullUrl: page.fullurl } : {}),
    revisionId: String(revid), revisionTimestamp: timestamp, wikidataEntityId: expectedEntityId,
    warnings, page,
  };
}

export function decodeWikipediaPageResponse(bytes: Uint8Array, expectedEntityId: string): WikipediaPageCodecResult {
  const decoded = decodeBase(bytes, expectedEntityId);
  return {
    pageId: decoded.pageId, title: decoded.title, ...(decoded.fullUrl ? { fullUrl: decoded.fullUrl } : {}),
    revisionId: decoded.revisionId, revisionTimestamp: decoded.revisionTimestamp,
    wikidataEntityId: decoded.wikidataEntityId, warnings: decoded.warnings,
  };
}

export function decodeWikipediaExtractResponse(bytes: Uint8Array, expectedEntityId: string): WikipediaExtractCodecResult {
  const decoded = decodeBase(bytes, expectedEntityId);
  const extract = decoded.page.extract;
  if (typeof extract !== "string" || !extract.trim()) throw new Error("wikipedia_extract_missing");
  return {
    pageId: decoded.pageId, title: decoded.title, ...(decoded.fullUrl ? { fullUrl: decoded.fullUrl } : {}),
    revisionId: decoded.revisionId, revisionTimestamp: decoded.revisionTimestamp,
    wikidataEntityId: decoded.wikidataEntityId, warnings: decoded.warnings, extract: extract.trim(),
  };
}
