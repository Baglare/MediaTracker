import type { ResearchEvidenceCacheEntry, ResearchEvidenceCacheKey } from "../domain/types";

export interface ResearchEvidenceCachePort {
  get(key: ResearchEvidenceCacheKey): Promise<ResearchEvidenceCacheEntry | null>;
  set(entry: ResearchEvidenceCacheEntry): Promise<boolean>;
  delete(key: ResearchEvidenceCacheKey): Promise<boolean>;
  invalidateByScope(scopeKey: string): Promise<number>;
  invalidateBySourceRevision(input: { sourceId: string; revisionId?: string }): Promise<number>;
}

