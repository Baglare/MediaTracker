import type { ResearchEvidenceCacheEntry, ResearchEvidenceCacheKey } from "../domain/types";
import type { GroundedExtractionProvenance } from "../extraction/domain/types";

export type ResearchEvidenceCacheValue = ResearchEvidenceCacheEntry & {
  extractionProvenance?: GroundedExtractionProvenance;
};

export type ResearchEvidenceCacheLookupStatus = "hit" | "miss" | "expired";

export interface ResearchEvidenceCacheLookupResult {
  status: ResearchEvidenceCacheLookupStatus;
  entry: ResearchEvidenceCacheValue | null;
}

export interface ResearchEvidenceCachePort {
  get(key: ResearchEvidenceCacheKey): Promise<ResearchEvidenceCacheValue | null>;
  lookup?(key: ResearchEvidenceCacheKey): Promise<ResearchEvidenceCacheLookupResult>;
  set(entry: ResearchEvidenceCacheValue): Promise<boolean>;
  delete(key: ResearchEvidenceCacheKey): Promise<boolean>;
  invalidateByScope(scopeKey: string): Promise<number>;
  invalidateBySourceRevision(input: { sourceId: string; revisionId?: string }): Promise<number>;
}
