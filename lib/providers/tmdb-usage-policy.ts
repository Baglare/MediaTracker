// Preparation only: live API access is still denied by release-policy.ts.
// Retention across offline/cloud/export copies is unresolved; no new saved metadata.
export const TMDB_PERSISTENCE_ENABLED = false;

export function assertTmdbPersistenceAllowed(): void {
  if (!TMDB_PERSISTENCE_ENABLED) throw new Error("tmdb_persistence_disabled");
}

function isTmdbSourceReference(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (/^(?:v2:)?tmdb(?:$|[:/_-])/i.test(value.trim())) return true;
  try {
    const hostname = new URL(value).hostname;
    return hostname === "themoviedb.org" || hostname.endsWith(".themoviedb.org");
  } catch { return false; }
}

// Read the provenance already carried by records, candidates and evidence.
// This is not proof of origin for unlabelled text or a replacement provenance schema.
export function hasTmdbProvenance(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasTmdbProvenance);
  const item = value as Record<string, unknown>;
  if (isTmdbSourceReference(item.sourceId) || isTmdbSourceReference(item.sourceReference)) return true;
  if (["source", "externalSource", "primaryProvider", "provider", "kind"].some((key) => item[key] === "tmdb")) return true;
  if (["id", "externalId", "libraryItemId", "canonicalKey", "key"].some((key) => (
    typeof item[key] === "string" && /^(?:v2:)?tmdb[:-]/.test(item[key])
  ))) return true;
  if (item.providerCoverage && typeof item.providerCoverage === "object" && "tmdb" in item.providerCoverage) return true;
  return ["identity", "candidateIdentity", "exactProviderIdentity", "globalSearch", "raw", "secondaryIds", "verificationEvidence", "rawEvidenceClaims", "metadata"].some((key) => hasTmdbProvenance(item[key]));
}

export function tmdbSourceUrl(externalId: string | undefined, type: "movie" | "tv"): string | undefined {
  return externalId && /^[1-9]\d*$/.test(externalId)
    ? `https://www.themoviedb.org/${type}/${externalId}`
    : undefined;
}
