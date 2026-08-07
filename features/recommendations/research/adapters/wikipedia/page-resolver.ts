import "server-only";

import { validateResearchUrl } from "../../security/url-policy";
import { WIKIPEDIA_API_JSON_MAX_BYTES } from "../../network/response-limits";
import type { SecureResearchHttpClient } from "../../network/types";
import type { ResolvedWikimediaIdentity, ResolvedWikipediaPage, WikipediaLanguagePolicy } from "../types";
import { decodeWikipediaPageResponse } from "./codec";

const PROJECTS = {
  enwiki: { language: "en" as const, host: "en.wikipedia.org" },
  trwiki: { language: "tr" as const, host: "tr.wikipedia.org" },
};

export const DEFAULT_WIKIPEDIA_LANGUAGE_POLICY: WikipediaLanguagePolicy = { preferredProjects: ["enwiki", "trwiki"] };

export function selectVerifiedWikipediaSitelink(input: {
  identity: ResolvedWikimediaIdentity;
  policy?: WikipediaLanguagePolicy;
}): { project: "enwiki" | "trwiki"; title: string } | null {
  for (const project of input.policy?.preferredProjects ?? DEFAULT_WIKIPEDIA_LANGUAGE_POLICY.preferredProjects) {
    const title = input.identity.sitelinks[project];
    if (title) return { project, title };
  }
  return null;
}

export function buildWikipediaPageQueryUrl(project: "enwiki" | "trwiki", title: string): string {
  if (!title.trim() || title.length > 240) throw new Error("wikipedia_sitelink_title_invalid");
  const url = new URL(`https://${PROJECTS[project].host}/w/api.php`);
  url.searchParams.set("action", "query");
  url.searchParams.set("prop", "info|pageprops|revisions");
  url.searchParams.set("inprop", "url");
  url.searchParams.set("rvprop", "ids|timestamp");
  url.searchParams.set("rvlimit", "1");
  url.searchParams.set("redirects", "1");
  url.searchParams.set("titles", title);
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  return url.toString();
}

export async function resolveWikipediaPage(input: {
  identity: ResolvedWikimediaIdentity;
  httpClient: SecureResearchHttpClient;
  userAgent: string;
  languagePolicy?: WikipediaLanguagePolicy;
  signal?: AbortSignal;
}): Promise<{ status: "resolved"; page: ResolvedWikipediaPage } | { status: "unavailable" | "security_rejected" | "budget_exhausted"; warnings: readonly string[] }> {
  const sitelink = selectVerifiedWikipediaSitelink({ identity: input.identity, policy: input.languagePolicy });
  if (!sitelink) return { status: "unavailable", warnings: ["wikipedia_sitelink_unavailable"] };
  const project = PROJECTS[sitelink.project];
  try {
    const response = await input.httpClient.request({
      sourceId: "wikipedia", url: buildWikipediaPageQueryUrl(sitelink.project, sitelink.title), method: "GET",
      headers: { userAgent: input.userAgent, apiUserAgent: input.userAgent, accept: "application/json", acceptEncoding: "gzip, deflate" },
      timeoutMs: 3_500, maxResponseBytes: WIKIPEDIA_API_JSON_MAX_BYTES, acceptedContentTypes: ["application/json"],
      redirectPolicy: { mode: "manual", maxRedirects: 2 }, requestId: `wikipedia-page-${input.identity.wikidataEntityId}`, maxAttempts: 2, signal: input.signal,
    });
    if (response.status !== 200) return { status: "unavailable", warnings: [`wikipedia_page_http_${response.status}`] };
    const decoded = decodeWikipediaPageResponse(response.body, input.identity.wikidataEntityId);
    const fallbackUrl = `https://${project.host}/wiki/${encodeURIComponent(decoded.title.replace(/ /g, "_"))}`;
    const canonical = validateResearchUrl({ sourceId: "wikipedia", url: decoded.fullUrl ?? fallbackUrl });
    if (!canonical.ok) return { status: "security_rejected", warnings: [canonical.reason] };
    const revisionUrl = new URL(`https://${project.host}/w/index.php`);
    revisionUrl.searchParams.set("title", decoded.title);
    revisionUrl.searchParams.set("oldid", decoded.revisionId);
    const revision = validateResearchUrl({ sourceId: "wikipedia", url: revisionUrl.toString() });
    if (!revision.ok) return { status: "security_rejected", warnings: [revision.reason] };
    return {
      status: "resolved",
      page: {
        sourceId: "wikipedia", wikiProject: sitelink.project, language: project.language,
        wikidataEntityId: input.identity.wikidataEntityId, canonicalTitle: decoded.title,
        pageId: decoded.pageId, revisionId: decoded.revisionId, revisionTimestamp: decoded.revisionTimestamp,
        canonicalUrl: canonical.canonicalUrl, revisionUrl: revision.canonicalUrl, warnings: decoded.warnings,
      },
    };
  } catch (error) {
    if (input.signal?.aborted) return { status: "budget_exhausted", warnings: ["direct_source_budget_exhausted"] };
    const message = error instanceof Error ? error.message : "wikipedia_page_adapter_failure";
    return { status: message.includes("security") ? "security_rejected" : "unavailable", warnings: [message] };
  }
}
