import type { AspectId, ConstraintRole, RecommendationMediaType } from "../../domain/types";
import type { ResearchClaimLevel, ResearchVersionScope } from "../domain/types";
import type {
  ResearchDiscoveryAdapterId,
  ResearchDiscoveryProviderId,
  ResearchDiscoveryTelemetry,
} from "./types";

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
  providerId: ResearchDiscoveryProviderId;
  status: SearchDiscoveryPortStatus;
  rawUrlSignals: readonly SearchDiscoveryUrl[];
  telemetry: ResearchDiscoveryTelemetry;
  warnings: readonly string[];
}

export interface SearchDiscoveryPort {
  readonly providerId: ResearchDiscoveryProviderId;
  readonly adapterId: ResearchDiscoveryAdapterId;
  discover(input: SearchDiscoveryPortRequest): Promise<SearchDiscoveryPortResult>;
}
