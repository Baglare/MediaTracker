import type { ResearchEvidenceCacheKey } from "../domain/types";
import { researchCachePolicyClass, validateResearchEvidenceCacheEntry } from "./policy";
import type { ResearchEvidenceCacheLookupResult, ResearchEvidenceCachePort, ResearchEvidenceCacheValue } from "./port";

interface MemoryRecord {
  entry: ResearchEvidenceCacheValue;
  expiresAtMs: number;
}

export class MemoryResearchEvidenceCache implements ResearchEvidenceCachePort {
  private readonly entries = new Map<string, MemoryRecord>();

  constructor(
    private readonly maxEntries = 256,
    private readonly now: () => number = Date.now,
  ) {}

  async lookup(key: ResearchEvidenceCacheKey): Promise<ResearchEvidenceCacheLookupResult> {
    const record = this.entries.get(key.key);
    if (!record) return { status: "miss", entry: null };
    if (record.expiresAtMs <= this.now()) {
      this.entries.delete(key.key);
      return { status: "expired", entry: null };
    }
    this.entries.delete(key.key);
    this.entries.set(key.key, record);
    return { status: "hit", entry: structuredClone({ ...record.entry, cacheStatus: "fresh" }) };
  }

  async get(key: ResearchEvidenceCacheKey): Promise<ResearchEvidenceCacheValue | null> {
    return (await this.lookup(key)).entry;
  }

  async set(entry: ResearchEvidenceCacheValue): Promise<boolean> {
    if (!validateResearchEvidenceCacheEntry(entry).ok || researchCachePolicyClass(entry) === "not_cacheable") return false;
    this.entries.delete(entry.key.key);
    this.entries.set(entry.key.key, { entry: structuredClone({ ...entry, cacheStatus: "refreshed" }), expiresAtMs: Date.parse(entry.expiresAt) });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value as string);
    return true;
  }

  async delete(key: ResearchEvidenceCacheKey): Promise<boolean> {
    return this.entries.delete(key.key);
  }

  async invalidateByScope(scopeKey: string): Promise<number> {
    let removed = 0;
    for (const [key, record] of this.entries) {
      if (record.entry.key.scopeKey === scopeKey) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  async invalidateBySourceRevision(input: { sourceId: string; revisionId?: string }): Promise<number> {
    let removed = 0;
    for (const [key, record] of this.entries) {
      const matches = record.entry.citations.some((citation) => citation.sourceId === input.sourceId && (input.revisionId === undefined || citation.revisionId === input.revisionId));
      if (matches) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  get size(): number {
    return this.entries.size;
  }
}
