import { RESEARCH_SOURCE_REGISTRY_VERSION } from "../domain/source-registry";
import type { DiscoveredResearchSource } from "../discovery/types";
import { validateResearchUrl } from "../security/url-policy";

export interface WikipediaArticleTarget {
  source: DiscoveredResearchSource;
  canonicalUrl: string;
  project: "enwiki" | "trwiki";
  language: "en" | "tr";
  title: string;
}

const HOST_POLICY = {
  "en.wikipedia.org": { project: "enwiki" as const, language: "en" as const },
  "tr.wikipedia.org": { project: "trwiki" as const, language: "tr" as const },
};

export type WikipediaArticleUrlResult =
  | { ok: true; value: WikipediaArticleTarget }
  | { ok: false; reason: string };

export function parseDiscoveredWikipediaArticleUrl(source: DiscoveredResearchSource): WikipediaArticleUrlResult {
  if (source.sourceId !== "wikipedia" || source.sourceRegistryVersion !== RESEARCH_SOURCE_REGISTRY_VERSION) return { ok: false, reason: "source_registry_version_or_id_mismatch" };
  const validated = validateResearchUrl({ url: source.canonicalUrl, sourceId: "wikipedia" });
  if (!validated.ok) return { ok: false, reason: validated.reason };
  const parsed = new URL(validated.canonicalUrl);
  if (parsed.search) return { ok: false, reason: "wikipedia_article_query_forbidden" };
  const project = HOST_POLICY[validated.normalizedHost as keyof typeof HOST_POLICY];
  if (!project) return { ok: false, reason: "wikipedia_language_host_disabled" };
  if (!parsed.pathname.startsWith("/wiki/") || parsed.pathname.length <= "/wiki/".length) return { ok: false, reason: "wikipedia_article_path_invalid" };
  let title: string;
  try { title = decodeURIComponent(parsed.pathname.slice("/wiki/".length)).replace(/_/g, " ").normalize("NFKC").trim(); }
  catch { return { ok: false, reason: "wikipedia_article_title_encoding_invalid" }; }
  if (!title || title.length > 240 || /[\u0000-\u001f\u007f]/u.test(title)) return { ok: false, reason: "wikipedia_article_title_invalid" };
  return { ok: true, value: { source, canonicalUrl: validated.canonicalUrl, ...project, title } };
}

