import type { CandidateProviderEvidenceSnapshot } from "./types";
import { PROVIDER_EVIDENCE_SCHEMA_VERSION } from "./types";

export const PROVIDER_EVIDENCE_CACHE_MAX_ENTRIES = 256;
export const PROVIDER_EVIDENCE_DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

export function providerEvidenceCacheKey(input: {
  provider: string; mediaType: string; externalId: string; schemaVersion?: number;
}): string {
  return `${input.provider}:${input.mediaType}:${input.externalId}:${input.schemaVersion ?? PROVIDER_EVIDENCE_SCHEMA_VERSION}`;
}

function isSnapshot(value: unknown): value is CandidateProviderEvidenceSnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CandidateProviderEvidenceSnapshot>;
  const containsOwnerData = (current: unknown): boolean => {
    if (!current || typeof current !== "object") return false;
    if (Array.isArray(current)) return current.some(containsOwnerData);
    const forbiddenKeys = new Set(["ownerId", "userId", "userRating", "favorite", "progress", "personalNotes", "feedback"]);
    return Object.entries(current).some(([key, nested]) => forbiddenKeys.has(key) || containsOwnerData(nested));
  };
  return item.schemaVersion === PROVIDER_EVIDENCE_SCHEMA_VERSION
    && Boolean(item.candidateIdentity?.verified)
    && typeof item.candidateIdentity?.canonicalKey === "string"
    && item.objectiveMetadata?.mediaType === item.candidateIdentity?.mediaType
    && Array.isArray(item.rawEvidenceClaims)
    && !item.rawEvidenceClaims.some((claim) => claim.sourceKind === "user_feedback")
    && !containsOwnerData(item)
    && Array.isArray(item.missingFields)
    && Array.isArray(item.warnings)
    && typeof item.fetchedAt === "string";
}

interface CacheRecord { snapshot: CandidateProviderEvidenceSnapshot; expiresAt: number }

export class ProviderEvidenceCache {
  private readonly entries = new Map<string, CacheRecord>();
  private readonly pending = new Map<string, Promise<CandidateProviderEvidenceSnapshot>>();

  constructor(
    private readonly maxEntries = PROVIDER_EVIDENCE_CACHE_MAX_ENTRIES,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): CandidateProviderEvidenceSnapshot | null {
    const record = this.entries.get(key);
    if (!record) return null;
    if (record.expiresAt <= this.now() || !isSnapshot(record.snapshot)) {
      this.entries.delete(key);
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, record);
    return { ...record.snapshot, cacheStatus: "hit" };
  }

  set(key: string, snapshot: CandidateProviderEvidenceSnapshot, ttlMs = PROVIDER_EVIDENCE_DEFAULT_TTL_MS): boolean {
    if (!isSnapshot(snapshot) || !Number.isFinite(ttlMs) || ttlMs <= 0) return false;
    this.entries.delete(key);
    this.entries.set(key, { snapshot: { ...snapshot, cacheStatus: "refreshed" }, expiresAt: this.now() + ttlMs });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value as string);
    return true;
  }

  async getOrLoad(
    key: string,
    loader: () => Promise<CandidateProviderEvidenceSnapshot>,
    ttlMs = PROVIDER_EVIDENCE_DEFAULT_TTL_MS,
  ): Promise<CandidateProviderEvidenceSnapshot> {
    const cached = this.get(key);
    if (cached) return cached;
    const active = this.pending.get(key);
    if (active) return active;
    const pending = loader().then((snapshot) => {
      if (!isSnapshot(snapshot)) throw new Error("provider_evidence_snapshot_invalid");
      this.set(key, snapshot, ttlMs);
      return { ...snapshot, cacheStatus: "miss" as const };
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, pending);
    return pending;
  }

  get size(): number { return this.entries.size; }
}

export const providerEvidenceCache = new ProviderEvidenceCache();
export { isSnapshot as isCandidateProviderEvidenceSnapshot };
