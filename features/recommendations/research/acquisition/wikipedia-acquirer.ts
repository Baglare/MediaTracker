import "server-only";

import { fetchWikipediaDirectDocument } from "../adapters/wikipedia/document-adapter";
import { resolveWikipediaPageByTitle } from "../adapters/wikipedia/page-resolver";
import type { ResolvedWikimediaIdentity } from "../adapters/types";
import type { SecureResearchHttpClient } from "../network/types";
import {
  WIKIPEDIA_PAGE_METADATA_CACHE_TTL_MS,
  wikipediaDiscoveredPageMetadataCacheKey,
  wikipediaPageMetadataCache,
} from "../orchestration/direct-source-cache";
import type { DirectResearchDocumentInput } from "./types";
import { parseDiscoveredWikipediaArticleUrl, type WikipediaArticleTarget } from "./wikipedia-url";
import type { DiscoveredResearchSource } from "../discovery/types";

export type DiscoveredWikipediaAcquisition =
  | { status: "acquired"; target: WikipediaArticleTarget; direct: DirectResearchDocumentInput; pageId: number; language: "en" | "tr"; pageCache: "cache" | "coalesced" | "loaded"; warnings: readonly string[] }
  | { status: "source_policy_blocked" | "source_identity_mismatch" | "adapter_unavailable" | "security_rejected" | "budget_exhausted"; warnings: readonly string[] };

export async function acquireDiscoveredWikipediaSource(input: {
  source: DiscoveredResearchSource;
  wikimediaIdentity: ResolvedWikimediaIdentity;
  httpClient: SecureResearchHttpClient;
  userAgent: string;
  now?: () => Date;
  signal?: AbortSignal;
}): Promise<DiscoveredWikipediaAcquisition> {
  const parsed = parseDiscoveredWikipediaArticleUrl(input.source);
  if (!parsed.ok) return { status: "source_policy_blocked", warnings: [parsed.reason] };
  try {
    const cacheKey = wikipediaDiscoveredPageMetadataCacheKey(input.wikimediaIdentity, parsed.value.project, parsed.value.title);
    const cached = await wikipediaPageMetadataCache.getOrLoad(cacheKey, async () => {
      const resolved = await resolveWikipediaPageByTitle({
        identity: input.wikimediaIdentity, project: parsed.value.project, title: parsed.value.title,
        httpClient: input.httpClient, userAgent: input.userAgent, signal: input.signal,
      });
      if (resolved.status !== "resolved") throw Object.assign(new Error(`wikipedia_${resolved.status}`), { pageResolution: resolved });
      return resolved.page;
    }, WIKIPEDIA_PAGE_METADATA_CACHE_TTL_MS);
    const direct = await fetchWikipediaDirectDocument({
      page: cached.value, httpClient: input.httpClient, userAgent: input.userAgent,
      now: input.now, signal: input.signal,
    });
    return {
      status: "acquired", target: parsed.value, direct, pageId: cached.value.pageId,
      language: cached.value.language, pageCache: cached.source,
      warnings: [...cached.value.warnings, ...direct.document.securityFlags],
    };
  } catch (error) {
    if (input.signal?.aborted) return { status: "budget_exhausted", warnings: ["research_acquisition_budget_exhausted"] };
    const tagged = error as { pageResolution?: { status?: string; warnings?: readonly string[] } };
    const warnings = [...(tagged.pageResolution?.warnings ?? []), error instanceof Error ? error.message : "wikipedia_acquisition_failed"];
    if (warnings.some((warning) => /wikidata_identity_mismatch/.test(warning))) return { status: "source_identity_mismatch", warnings };
    if (warnings.some((warning) => /security_rejected|control_character|oversized|script_or_html|citation_invalid|document_invalid/.test(warning))) return { status: "security_rejected", warnings };
    return { status: tagged.pageResolution?.status === "budget_exhausted" ? "budget_exhausted" : "adapter_unavailable", warnings };
  }
}

