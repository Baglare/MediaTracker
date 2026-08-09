import type { GroundedExtractionProviderId } from "../domain/types";
import { GROUNDED_EXTRACTION_MAX_RESPONSE_BYTES } from "../domain/types";

export type GroundedExtractionResponseContractStatus = "stable" | "beta" | "partial";
export interface GroundedExtractionProviderEntry {
  providerId: GroundedExtractionProviderId;
  enabledByDefault: false;
  requiredKeyEnv: string;
  requiredModelEnv: string;
  featureFlagEnv: string;
  liveSmokeFlagEnv: string;
  endpointClass: "responses" | "chat_completions";
  supportsStrictJsonSchema: true;
  supportsNoTools: true;
  supportsStoreFalse: boolean;
  responseContractStatus: GroundedExtractionResponseContractStatus;
  allowedModels: readonly string[];
  timeoutMs: number;
  maxResponseBytes: number;
  persistencePolicy: "response_ephemeral_only";
  warnings: readonly string[];
}

export const GROUNDED_EXTRACTION_PROVIDER_REGISTRY_VERSION = "d7-r3b-provider-registry.1" as const;
export const GROUNDED_EXTRACTION_PROVIDER_REGISTRY: Readonly<Record<GroundedExtractionProviderId, GroundedExtractionProviderEntry>> = {
  groq: { providerId: "groq", enabledByDefault: false, requiredKeyEnv: "GROQ_API_KEY", requiredModelEnv: "GROQ_RESEARCH_EXTRACTION_MODEL", featureFlagEnv: "D7_GROQ_GROUNDED_EXTRACTION_ENABLED", liveSmokeFlagEnv: "D7_GROQ_GROUNDED_EXTRACTION_LIVE_SMOKE", endpointClass: "chat_completions", supportsStrictJsonSchema: true, supportsNoTools: true, supportsStoreFalse: false, responseContractStatus: "stable", allowedModels: ["openai/gpt-oss-20b", "openai/gpt-oss-120b"], timeoutMs: 6_000, maxResponseBytes: GROUNDED_EXTRACTION_MAX_RESPONSE_BYTES, persistencePolicy: "response_ephemeral_only", warnings: ["groq_reasoning_not_consumed"] },
  openai: { providerId: "openai", enabledByDefault: false, requiredKeyEnv: "OPENAI_API_KEY", requiredModelEnv: "OPENAI_RESEARCH_EXTRACTION_MODEL", featureFlagEnv: "D7_OPENAI_GROUNDED_EXTRACTION_ENABLED", liveSmokeFlagEnv: "D7_OPENAI_GROUNDED_EXTRACTION_LIVE_SMOKE", endpointClass: "responses", supportsStrictJsonSchema: true, supportsNoTools: true, supportsStoreFalse: true, responseContractStatus: "stable", allowedModels: ["gpt-5.4-mini", "gpt-5.4-mini-2026-03-17", "gpt-5.4"], timeoutMs: 6_000, maxResponseBytes: GROUNDED_EXTRACTION_MAX_RESPONSE_BYTES, persistencePolicy: "response_ephemeral_only", warnings: [] },
  openrouter: { providerId: "openrouter", enabledByDefault: false, requiredKeyEnv: "OPENROUTER_API_KEY", requiredModelEnv: "OPENROUTER_RESEARCH_EXTRACTION_MODEL", featureFlagEnv: "D7_OPENROUTER_GROUNDED_EXTRACTION_ENABLED", liveSmokeFlagEnv: "D7_OPENROUTER_GROUNDED_EXTRACTION_LIVE_SMOKE", endpointClass: "chat_completions", supportsStrictJsonSchema: true, supportsNoTools: true, supportsStoreFalse: false, responseContractStatus: "partial", allowedModels: ["openai/gpt-5.4-mini", "openai/gpt-5-mini"], timeoutMs: 6_000, maxResponseBytes: GROUNDED_EXTRACTION_MAX_RESPONSE_BYTES, persistencePolicy: "response_ephemeral_only", warnings: ["openrouter_endpoint_structured_output_support_may_vary"] },
};

export function getGroundedExtractionProviderEntry(value: string): GroundedExtractionProviderEntry | null {
  return value === "groq" || value === "openai" || value === "openrouter" ? GROUNDED_EXTRACTION_PROVIDER_REGISTRY[value] : null;
}

