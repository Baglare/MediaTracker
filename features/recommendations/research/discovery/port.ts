import type { AspectId, ConstraintRole, RecommendationMediaType } from "../../domain/types";
import type { ResearchClaimLevel, ResearchVersionScope } from "../domain/types";
import type { ResearchDiscoveryTelemetry } from "./types";

export interface SearchDiscoveryPortRequest {
  queries: readonly string[];
  allowedDomains: readonly string[];
  maxSources: number;
  requestId: string;
  candidate: {
    title: string;
    releaseYear?: number;
    mediaType: RecommendationMediaType;
    versionScope: ResearchVersionScope;
  };
  aspect: {
    aspectId: AspectId;
    role: ConstraintRole;
    minimumLevel?: Exclude<ResearchClaimLevel, null>;
  };
  signal?: AbortSignal;
}

export interface SearchDiscoveryUrl {
  url: string;
  rank: number;
  actionId?: string;
}

export type SearchDiscoveryPortStatus = "completed" | "unavailable" | "budget_exhausted" | "response_invalid";

export interface SearchDiscoveryPortResult {
  status: SearchDiscoveryPortStatus;
  urls: readonly SearchDiscoveryUrl[];
  telemetry: ResearchDiscoveryTelemetry;
  warnings: readonly string[];
}

export interface SearchDiscoveryPort {
  readonly adapterId: "openai_web_search";
  discover(input: SearchDiscoveryPortRequest): Promise<SearchDiscoveryPortResult>;
}
