import type { ConstraintRole } from "../../domain/types";
import type { ResearchDiscoveryProviderId } from "./types";

export type DiscoveryResponseContractStatus = "stable" | "beta" | "partial" | "unsupported";
export type DiscoveryUnderlyingSearchVendor = "openai" | "tavily" | "exa" | "native_or_unknown";

export interface ResearchDiscoveryProviderEntry {
  providerId: ResearchDiscoveryProviderId;
  enabledByDefault: false;
  serverFeatureFlag: string;
  requiredKeyEnv: string;
  requiredModelEnv: string;
  supportsHardDomainAllowlist: boolean;
  returnsUnderlyingUrls: boolean;
  returnsCitations: boolean;
  responseContractStatus: DiscoveryResponseContractStatus;
  persistencePolicy: "ephemeral_only";
  underlyingSearchVendor: DiscoveryUnderlyingSearchVendor;
  permittedRoles: readonly ConstraintRole[];
  warnings: readonly string[];
}

export const RESEARCH_DISCOVERY_PROVIDER_REGISTRY_VERSION = "d7-r2c-provider-registry-v1" as const;

export const RESEARCH_DISCOVERY_PROVIDER_REGISTRY: Readonly<Record<ResearchDiscoveryProviderId, ResearchDiscoveryProviderEntry>> = {
  openai: {
    providerId: "openai",
    enabledByDefault: false,
    serverFeatureFlag: "D7_OPENAI_WEB_DISCOVERY_ENABLED",
    requiredKeyEnv: "OPENAI_API_KEY",
    requiredModelEnv: "OPENAI_RESEARCH_MODEL",
    supportsHardDomainAllowlist: true,
    returnsUnderlyingUrls: true,
    returnsCitations: true,
    responseContractStatus: "stable",
    persistencePolicy: "ephemeral_only",
    underlyingSearchVendor: "openai",
    permittedRoles: ["must", "avoid", "prefer"],
    warnings: [],
  },
  groq: {
    providerId: "groq",
    enabledByDefault: false,
    serverFeatureFlag: "D7_GROQ_WEB_DISCOVERY_ENABLED",
    requiredKeyEnv: "GROQ_API_KEY",
    requiredModelEnv: "GROQ_RESEARCH_MODEL",
    supportsHardDomainAllowlist: true,
    returnsUnderlyingUrls: true,
    returnsCitations: true,
    responseContractStatus: "stable",
    persistencePolicy: "ephemeral_only",
    underlyingSearchVendor: "tavily",
    permittedRoles: ["must", "avoid", "prefer"],
    warnings: ["groq_search_results_are_tavily_ephemeral_metadata"],
  },
  openrouter: {
    providerId: "openrouter",
    enabledByDefault: false,
    serverFeatureFlag: "D7_OPENROUTER_WEB_DISCOVERY_ENABLED",
    requiredKeyEnv: "OPENROUTER_API_KEY",
    requiredModelEnv: "OPENROUTER_RESEARCH_MODEL",
    supportsHardDomainAllowlist: true,
    returnsUnderlyingUrls: true,
    returnsCitations: true,
    responseContractStatus: "beta",
    persistencePolicy: "ephemeral_only",
    underlyingSearchVendor: "exa",
    permittedRoles: ["must", "avoid", "prefer"],
    warnings: ["openrouter_responses_server_tool_beta", "openrouter_search_engine_forced_to_exa"],
  },
};

export function getResearchDiscoveryProviderEntry(value: string): ResearchDiscoveryProviderEntry | null {
  return value === "openai" || value === "groq" || value === "openrouter"
    ? RESEARCH_DISCOVERY_PROVIDER_REGISTRY[value]
    : null;
}

export function providerCanPerformHardResearch(providerId: ResearchDiscoveryProviderId, role: ConstraintRole): boolean {
  const entry = RESEARCH_DISCOVERY_PROVIDER_REGISTRY[providerId];
  return entry.supportsHardDomainAllowlist
    && entry.returnsUnderlyingUrls
    && entry.responseContractStatus !== "unsupported"
    && entry.permittedRoles.includes(role);
}
