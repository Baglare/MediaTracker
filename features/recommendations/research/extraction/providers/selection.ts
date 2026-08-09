import "server-only";
import { getGroundedExtractionProviderEntry, GROUNDED_EXTRACTION_PROVIDER_REGISTRY } from "./registry";
import type { GroundedExtractionProviderId } from "../domain/types";

export type GroundedExtractionSelectionMode = "disabled" | GroundedExtractionProviderId | "auto";
export interface GroundedExtractionProviderConfiguration { enabled: boolean; key: string | null; model: string | null; modelSupported: boolean; valid: boolean; warnings: readonly string[] }
export interface GroundedExtractionSelectionEnvironment { mode: GroundedExtractionSelectionMode; providers: Readonly<Record<GroundedExtractionProviderId, GroundedExtractionProviderConfiguration>>; warnings: readonly string[] }

function providerId(value: string | undefined): GroundedExtractionProviderId | null { const v = value?.trim().toLowerCase(); return v === "groq" || v === "openai" || v === "openrouter" ? v : null; }
function config(provider: GroundedExtractionProviderId, env: NodeJS.ProcessEnv): GroundedExtractionProviderConfiguration {
  const entry = GROUNDED_EXTRACTION_PROVIDER_REGISTRY[provider];
  const enabled = env[entry.featureFlagEnv] === "1";
  const key = env[entry.requiredKeyEnv]?.trim() || null;
  const model = env[entry.requiredModelEnv]?.trim() || null;
  const modelSupported = model !== null && entry.allowedModels.includes(model);
  const warnings = [!enabled ? `${provider}_grounded_extraction_disabled` : null, !key ? `${provider}_grounded_extraction_key_missing` : null, !model ? `${provider}_grounded_extraction_model_missing` : !modelSupported ? `${provider}_grounded_extraction_model_unsupported` : null].filter((item): item is string => Boolean(item));
  return { enabled, key, model, modelSupported, valid: enabled && Boolean(key) && modelSupported, warnings };
}
export function readGroundedExtractionSelectionEnvironment(env: NodeJS.ProcessEnv = process.env): GroundedExtractionSelectionEnvironment {
  const configured = env.D7_RESEARCH_EXTRACTION_PROVIDER?.trim().toLowerCase() || "disabled";
  const mode = configured === "disabled" || configured === "auto" || providerId(configured) ? configured as GroundedExtractionSelectionMode : "disabled";
  return { mode, providers: { groq: config("groq", env), openai: config("openai", env), openrouter: config("openrouter", env) }, warnings: mode === configured ? [] : ["grounded_extraction_provider_invalid"] };
}
export function selectGroundedExtractionProviders(environment: GroundedExtractionSelectionEnvironment): readonly GroundedExtractionProviderId[] {
  if (environment.mode === "disabled") return [];
  if (environment.mode !== "auto") return getGroundedExtractionProviderEntry(environment.mode) ? [environment.mode] : [];
  return (["groq", "openai", "openrouter"] as const).filter((provider) => environment.providers[provider].valid).slice(0, 1);
}

