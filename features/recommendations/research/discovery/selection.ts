import "server-only";

import type { ConstraintRole } from "../../domain/types";
import { readGroqWebDiscoveryEnvironment, type GroqWebDiscoveryEnvironment } from "./adapters/groq/config";
import { readOpenAiWebDiscoveryEnvironment, type OpenAiWebDiscoveryEnvironment } from "./adapters/openai/config";
import { readOpenRouterWebDiscoveryEnvironment, type OpenRouterWebDiscoveryEnvironment } from "./adapters/openrouter/config";
import { providerCanPerformHardResearch } from "./provider-registry";
import type { ResearchDiscoveryProviderId } from "./types";

export type ResearchDiscoverySelectionMode = "disabled" | ResearchDiscoveryProviderId | "auto";
export type ResearchDiscoveryProviderEnvironment =
  | OpenAiWebDiscoveryEnvironment
  | GroqWebDiscoveryEnvironment
  | OpenRouterWebDiscoveryEnvironment;

export interface ResearchDiscoverySelectionEnvironment {
  mode: ResearchDiscoverySelectionMode;
  currentAiProvider: ResearchDiscoveryProviderId | null;
  providers: Readonly<Record<ResearchDiscoveryProviderId, ResearchDiscoveryProviderEnvironment>>;
  warnings: readonly string[];
}

function providerId(value: string | undefined): ResearchDiscoveryProviderId | null {
  const normalized = value?.trim().toLowerCase();
  return normalized === "openai" || normalized === "groq" || normalized === "openrouter" ? normalized : null;
}

export function readResearchDiscoverySelectionEnvironment(env: NodeJS.ProcessEnv = process.env): ResearchDiscoverySelectionEnvironment {
  const configured = env.D7_RESEARCH_DISCOVERY_PROVIDER?.trim().toLowerCase() || "disabled";
  const validMode = configured === "disabled" || configured === "auto" || providerId(configured);
  const mode = validMode ? configured as ResearchDiscoverySelectionMode : "disabled";
  return {
    mode,
    currentAiProvider: providerId(env.AI_PROVIDER),
    providers: {
      openai: readOpenAiWebDiscoveryEnvironment(env),
      groq: readGroqWebDiscoveryEnvironment(env),
      openrouter: readOpenRouterWebDiscoveryEnvironment(env),
    },
    warnings: validMode ? [] : ["research_discovery_provider_invalid"],
  };
}

export function selectResearchDiscoveryProviders(
  environment: ResearchDiscoverySelectionEnvironment,
  role: ConstraintRole,
): readonly ResearchDiscoveryProviderId[] {
  if (environment.mode === "disabled") return [];
  if (environment.mode !== "auto") {
    return providerCanPerformHardResearch(environment.mode, role) ? [environment.mode] : [];
  }
  const enabled = (["openai", "groq", "openrouter"] as const).filter((id) =>
    environment.providers[id].valid && providerCanPerformHardResearch(id, role));
  if (!environment.currentAiProvider || !enabled.includes(environment.currentAiProvider)) return enabled;
  return [environment.currentAiProvider, ...enabled.filter((id) => id !== environment.currentAiProvider)];
}
