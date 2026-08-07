import type { RecommendationMediaType, RecommendationProvider } from "../../../domain/types";
import type { RecommendationCandidateIdentity, SecondaryIdentityKind } from "../../../providers/types";
import type { ResearchScopeKind, ResearchVersionScope } from "../../domain/types";
import type { WikidataExternalIdentityCandidate } from "../types";

export const WIKIDATA_EXTERNAL_ID_REGISTRY_VERSION = "d7-r2a.1" as const;

export interface WikidataExternalIdPropertyEntry {
  registryKey: string;
  identitySource: { kind: "provider"; value: RecommendationProvider } | { kind: "secondary"; value: SecondaryIdentityKind };
  mediaTypes: readonly RecommendationMediaType[];
  propertyId: `P${number}` | null;
  externalIdNormalizer: (value: string) => string | null;
  queryEnabled: boolean;
  allowedScopeKinds: readonly ResearchScopeKind[];
  scopeExpectation: "exact_candidate_entity" | "exact_title_entity" | "work_entity" | "edition_entity";
  verificationSource: string | null;
  notes: string;
  priority: number;
}

const digits = (value: string): string | null => /^\d{1,18}$/.test(value.trim()) ? value.trim() : null;
const imdb = (value: string): string | null => /^tt\d{5,12}$/.test(value.trim()) ? value.trim() : null;
const openLibraryWork = (value: string): string | null => {
  const normalized = value.trim().replace(/^\/works\//, "");
  return /^OL[A-Za-z0-9]+W$/.test(normalized) ? normalized : null;
};
const openLibraryEdition = (value: string): string | null => /^OL[A-Za-z0-9]+M$/.test(value.trim()) ? value.trim() : null;

export const WIKIDATA_EXTERNAL_ID_PROPERTIES: readonly WikidataExternalIdPropertyEntry[] = [
  {
    registryKey: "anilist_anime", identitySource: { kind: "provider", value: "anilist" }, mediaTypes: ["anime"], propertyId: "P8729",
    externalIdNormalizer: digits, queryEnabled: true, allowedScopeKinds: ["work", "season"], scopeExpectation: "exact_candidate_entity",
    verificationSource: "https://www.wikidata.org/wiki/Property:P8729", notes: "Official AniList anime ID property entity.", priority: 10,
  },
  {
    registryKey: "anilist_manga", identitySource: { kind: "provider", value: "anilist" }, mediaTypes: ["manga", "manhwa", "manhua"], propertyId: "P8731",
    externalIdNormalizer: digits, queryEnabled: true, allowedScopeKinds: ["work"], scopeExpectation: "work_entity",
    verificationSource: "https://www.wikidata.org/wiki/Property:P8731", notes: "Official AniList manga ID property entity.", priority: 10,
  },
  {
    registryKey: "imdb", identitySource: { kind: "secondary", value: "imdb" }, mediaTypes: ["anime", "tv", "movie"], propertyId: "P345",
    externalIdNormalizer: imdb, queryEnabled: true, allowedScopeKinds: ["work", "installment"], scopeExpectation: "exact_title_entity",
    verificationSource: "https://www.wikidata.org/wiki/Property:P345", notes: "Official IMDb ID property entity; season scope is not inferred.", priority: 20,
  },
  {
    registryKey: "tmdb_movie", identitySource: { kind: "provider", value: "tmdb" }, mediaTypes: ["movie"], propertyId: "P4947",
    externalIdNormalizer: digits, queryEnabled: true, allowedScopeKinds: ["work", "installment"], scopeExpectation: "exact_title_entity",
    verificationSource: "https://www.wikidata.org/wiki/Property:P4947", notes: "Official TMDB movie ID property entity.", priority: 10,
  },
  {
    registryKey: "tmdb_tv", identitySource: { kind: "provider", value: "tmdb" }, mediaTypes: ["tv"], propertyId: "P4983",
    externalIdNormalizer: digits, queryEnabled: true, allowedScopeKinds: ["work"], scopeExpectation: "work_entity",
    verificationSource: "https://www.wikidata.org/wiki/Property:P4983", notes: "Official TMDB TV series ID property entity; season scope is disabled.", priority: 10,
  },
  {
    registryKey: "tvmaze", identitySource: { kind: "provider", value: "tvmaze" }, mediaTypes: ["tv"], propertyId: null,
    externalIdNormalizer: digits, queryEnabled: false, allowedScopeKinds: [], scopeExpectation: "work_entity",
    verificationSource: null, notes: "No locally verified official Wikidata property mapping; unresolved by policy.", priority: 50,
  },
  {
    registryKey: "openlibrary_work", identitySource: { kind: "secondary", value: "openlibrary_work" }, mediaTypes: ["book"], propertyId: "P648",
    externalIdNormalizer: openLibraryWork, queryEnabled: false, allowedScopeKinds: [], scopeExpectation: "work_entity",
    verificationSource: "https://www.wikidata.org/wiki/Property:P648", notes: "Official property, but work-path scope semantics remain disabled pending live contract verification.", priority: 50,
  },
  {
    registryKey: "openlibrary_edition", identitySource: { kind: "secondary", value: "openlibrary_edition" }, mediaTypes: ["book"], propertyId: null,
    externalIdNormalizer: openLibraryEdition, queryEnabled: false, allowedScopeKinds: [], scopeExpectation: "edition_entity",
    verificationSource: null, notes: "No distinct locally verified edition property mapping; unresolved by policy.", priority: 50,
  },
] as const;

export function validateWikidataExternalIdRegistry(): readonly string[] {
  const issues: string[] = [];
  const keys = new Set<string>();
  for (const entry of WIKIDATA_EXTERNAL_ID_PROPERTIES) {
    if (keys.has(entry.registryKey)) issues.push(`duplicate_registry_key:${entry.registryKey}`);
    keys.add(entry.registryKey);
    if (entry.queryEnabled && (!entry.propertyId || !/^P[1-9]\d*$/.test(entry.propertyId))) issues.push(`enabled_property_invalid:${entry.registryKey}`);
    if (entry.queryEnabled && entry.allowedScopeKinds.length === 0) issues.push(`enabled_scope_empty:${entry.registryKey}`);
    if (entry.queryEnabled && entry.verificationSource !== `https://www.wikidata.org/wiki/Property:${entry.propertyId}`) issues.push(`verification_source_mismatch:${entry.registryKey}`);
  }
  return issues;
}

function externalIdForEntry(identity: RecommendationCandidateIdentity, entry: WikidataExternalIdPropertyEntry): string | null {
  if (entry.identitySource.kind === "provider") {
    return identity.primaryProvider === entry.identitySource.value ? entry.externalIdNormalizer(identity.primaryExternalId) : null;
  }
  const secondary = identity.secondaryIds.find((item) => item.kind === entry.identitySource.value);
  return secondary ? entry.externalIdNormalizer(secondary.externalId) : null;
}

export function wikidataIdentityCandidates(input: { identity: RecommendationCandidateIdentity; versionScope: ResearchVersionScope }): readonly WikidataExternalIdentityCandidate[] {
  return WIKIDATA_EXTERNAL_ID_PROPERTIES
    .filter((entry) => entry.queryEnabled && entry.propertyId && (entry.mediaTypes as readonly RecommendationMediaType[]).includes(input.identity.mediaType) && (entry.allowedScopeKinds as readonly ResearchScopeKind[]).includes(input.versionScope.scopeKind))
    .flatMap((entry) => {
      const externalId = externalIdForEntry(input.identity, entry);
      return externalId && entry.propertyId ? [{ registryKey: entry.registryKey, propertyId: entry.propertyId, externalId, mediaType: input.identity.mediaType, scopeKey: input.versionScope.scopeKey }] : [];
    })
    .sort((left, right) => {
      const a = WIKIDATA_EXTERNAL_ID_PROPERTIES.find((entry) => entry.registryKey === left.registryKey)?.priority ?? 100;
      const b = WIKIDATA_EXTERNAL_ID_PROPERTIES.find((entry) => entry.registryKey === right.registryKey)?.priority ?? 100;
      return a - b || left.registryKey.localeCompare(right.registryKey);
    });
}

