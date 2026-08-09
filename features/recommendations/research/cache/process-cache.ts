import "server-only";

import { MemoryResearchEvidenceCache } from "./memory-cache";
import { RESEARCH_EVIDENCE_CACHE_MAX_ENTRIES } from "./policy";

export const processResearchEvidenceCache = new MemoryResearchEvidenceCache(RESEARCH_EVIDENCE_CACHE_MAX_ENTRIES);
