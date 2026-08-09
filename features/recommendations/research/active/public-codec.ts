import type { PublicResearchAspectEvidence, PublicResearchEvidenceSummary, PublicResearchSource } from "@/lib/ai/types";
import { ASPECT_REGISTRY } from "../../domain/aspect-registry";
import { validateResearchUrl } from "../security/url-policy";
import { getResearchSource } from "../domain/source-registry";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeAspect(value: unknown): PublicResearchAspectEvidence | null {
  if (!record(value) || typeof value.aspectId !== "string" || !Object.hasOwn(ASPECT_REGISTRY, value.aspectId)) return null;
  const aspectId = value.aspectId as keyof typeof ASPECT_REGISTRY;
  if (value.finding !== "supported" && value.finding !== "explicit_absence") return null;
  if (value.level !== null && value.level !== "incidental" && value.level !== "significant" && value.level !== "primary") return null;
  if (value.finding === "supported" && value.level === null) return null;
  if (value.finding === "explicit_absence" && value.level !== null) return null;
  if (value.confidence !== "low" && value.confidence !== "medium") return null;
  if (!Number.isInteger(value.sourceCount) || Number(value.sourceCount) < 1 || Number(value.sourceCount) > 3) return null;
  return { aspectId, label: ASPECT_REGISTRY[aspectId].labelTr, finding: value.finding, level: value.level, confidence: value.confidence, sourceCount: Number(value.sourceCount) };
}

function decodeSource(value: unknown): PublicResearchSource | null {
  if (!record(value) || typeof value.sourceId !== "string" || typeof value.url !== "string" || typeof value.attribution !== "string") return null;
  const source = getResearchSource(value.sourceId);
  const validatedUrl = validateResearchUrl({ sourceId: value.sourceId, url: value.url });
  if (!source?.enabled || !validatedUrl.ok || !value.attribution.trim() || value.attribution.length > 500) return null;
  const label = value.sourceId === "wikipedia" ? "Wikipedia" : value.sourceId === "wikidata" ? "Wikidata" : null;
  if (!label) return null;
  const publicUrl = new URL(validatedUrl.canonicalUrl);
  if (value.sourceId === "wikipedia") {
    const queryKeys = [...publicUrl.searchParams.keys()];
    if (
      publicUrl.pathname !== "/w/index.php"
      || queryKeys.some((key) => key !== "title" && key !== "oldid")
      || !publicUrl.searchParams.get("title")
      || !/^\d+$/.test(publicUrl.searchParams.get("oldid") ?? "")
    ) return null;
  } else if (publicUrl.search) {
    return null;
  }
  const accessedAt = typeof value.accessedAt === "string" && Number.isFinite(Date.parse(value.accessedAt)) ? value.accessedAt : undefined;
  return { sourceId: value.sourceId, label, url: validatedUrl.canonicalUrl, attribution: value.attribution.slice(0, 500), ...(accessedAt ? { accessedAt } : {}) };
}

export function decodePublicResearchEvidenceSummary(value: unknown): PublicResearchEvidenceSummary | null {
  if (!record(value) || value.version !== 1 || value.status !== "research_verified" || !Array.isArray(value.affectedAspects) || !Array.isArray(value.sources)) return null;
  if (value.affectedAspects.length < 1 || value.affectedAspects.length > 3 || value.sources.length < 1 || value.sources.length > 3) return null;
  const affectedAspects = value.affectedAspects.map(decodeAspect);
  const sources = value.sources.map(decodeSource);
  if (affectedAspects.some((item) => item === null) || sources.some((item) => item === null)) return null;
  const uniqueUrls = new Set((sources as PublicResearchSource[]).map((item) => item.url));
  if (uniqueUrls.size !== sources.length) return null;
  return { version: 1, status: "research_verified", affectedAspects: affectedAspects as PublicResearchAspectEvidence[], sources: sources as PublicResearchSource[] };
}

const FORBIDDEN_RESEARCH_FIELDS = ["claim", "claims", "citation", "citations", "packet", "passage", "passages", "unit", "units", "evidenceUnit", "evidenceUnits", "prompt", "modelOutput", "providerResponse", "provenance", "cacheStatus", "hypotheticalEffect"] as const;

export function sanitizeRecommendationResearchEvidence<T extends Record<string, unknown>>(value: T): T {
  const sanitized: Record<string, unknown> = { ...value };
  for (const field of FORBIDDEN_RESEARCH_FIELDS) delete sanitized[field];
  const researchEvidence = decodePublicResearchEvidenceSummary(value.researchEvidence);
  if (researchEvidence) sanitized.researchEvidence = researchEvidence;
  else delete sanitized.researchEvidence;
  return sanitized as T;
}
