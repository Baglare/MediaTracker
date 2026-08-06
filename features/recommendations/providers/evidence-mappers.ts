import {
  aspectIdsForProviderTaxonomyValue,
  findAspectByAlias,
  normalizeAspectAlias,
} from "../domain/aspect-registry";
import type { AspectId, RecommendationProvider } from "../domain/types";
import type { RawProviderEvidenceClaim } from "./types";

export type MappedRawEvidenceClaim = RawProviderEvidenceClaim;

function exactRegistryAspects(value: string): AspectId[] {
  const ids = new Set<AspectId>();
  const tr = findAspectByAlias(value, "tr");
  const en = findAspectByAlias(value, "en");
  if (tr) ids.add(tr);
  if (en) ids.add(en);
  return [...ids];
}

function claimId(provider: RecommendationProvider, kind: string, field: string, value: string): string {
  return `${provider}:${kind}:${field}:${normalizeAspectAlias(value).replace(/\s+/g, "_") || "unknown"}`;
}

export function mapProviderGenreClaims(
  provider: RecommendationProvider,
  genres: readonly string[] | undefined,
  reliability: number,
): MappedRawEvidenceClaim[] {
  return (genres ?? []).filter(Boolean).map((genre) => ({
    id: claimId(provider, "genre", "genres", genre), sourceKind: "provider_genre",
    scope: "candidate_metadata", provider, field: "genres", value: genre,
    normalizedValue: normalizeAspectAlias(genre), reliability,
    explanation: "Provider genre etiketi; aspect merkeziyeti değildir.",
    mappedAspectIds: exactRegistryAspects(genre),
  }));
}

export function mapProviderKeywordClaims(
  provider: RecommendationProvider,
  keywords: readonly { id?: number | string; name: string }[] | undefined,
  reliability: number,
): MappedRawEvidenceClaim[] {
  return (keywords ?? []).filter((item) => item.name.trim()).map((item) => ({
    id: `${claimId(provider, "keyword", "keywords", item.name)}:${item.id ?? "-"}`,
    sourceKind: "provider_keyword", scope: "candidate_metadata", provider,
    field: "keywords", value: item.name, normalizedValue: normalizeAspectAlias(item.name), reliability,
    explanation: "Provider keyword sinyali; aspect strength değildir.",
    mappedAspectIds: exactRegistryAspects(item.name),
  }));
}

export function mapProviderSubjectClaims(
  provider: RecommendationProvider,
  subjects: readonly string[] | undefined,
  reliability: number,
): MappedRawEvidenceClaim[] {
  return (subjects ?? []).filter((subject) => subject.trim()).map((subject) => ({
    id: claimId(provider, "subject", "subjects", subject),
    sourceKind: "provider_keyword", scope: "candidate_metadata", provider,
    field: "subjects", value: subject, normalizedValue: normalizeAspectAlias(subject), reliability,
    explanation: "Provider subject sinyali; exact genre veya aspect strength değildir.",
    mappedAspectIds: exactRegistryAspects(subject),
  }));
}

export function mapAniListTagClaims(
  tags: readonly { name: string; rank?: number; category?: string; isGeneralSpoiler?: boolean; isMediaSpoiler?: boolean }[] | undefined,
): MappedRawEvidenceClaim[] {
  return (tags ?? []).filter((tag) => tag.name.trim()).map((tag) => ({
    id: claimId("anilist", "tag", "tags", tag.name), sourceKind: "provider_tag_rank",
    scope: "candidate_metadata", provider: "anilist", field: "tags", value: tag.name,
    normalizedValue: normalizeAspectAlias(tag.name), reliability: 0.9,
    explanation: `AniList tag rank=${tag.rank ?? "unknown"}; rank merkeziyet garantisi değildir.`,
    mappedAspectIds: [...new Set([
      ...exactRegistryAspects(tag.name),
      ...aspectIdsForProviderTaxonomyValue("anilist", "ranked_tag", tag.name),
    ])],
    spoiler: Boolean(tag.isGeneralSpoiler || tag.isMediaSpoiler),
  }));
}

export function mapProviderMetadataClaim(input: {
  provider: RecommendationProvider; field: string; value: string | number | boolean; reliability: number;
}): MappedRawEvidenceClaim {
  return {
    id: claimId(input.provider, "metadata", input.field, String(input.value)),
    sourceKind: "provider_metadata", scope: "candidate_metadata", provider: input.provider,
    field: input.field, value: input.value, normalizedValue: typeof input.value === "string" ? normalizeAspectAlias(input.value) : input.value,
    reliability: input.reliability, explanation: "Objektif provider metadata alanı.", mappedAspectIds: [],
  };
}
