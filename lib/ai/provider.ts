// ============================================
// Provider Seçici
// ============================================
// AI_PROVIDER env'ine göre aktif provider'ı seçer (varsayılan: mock).

import type { AiEngineProvider, AiPlanningProviderPolicyStatus, AiProvider } from "./types";
import { mockProvider } from "./providers/mock-provider";
import { geminiProvider } from "./providers/gemini-provider";
import { groqProvider, openaiProvider, openrouterProvider } from "./providers/openai-compatible-provider";

const PROVIDERS: Record<string, AiProvider> = {
  mock: mockProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
  openrouter: openrouterProvider,
  groq: groqProvider,
};

const FIXED_PROVIDER_NAMES = new Set(["openai", "gemini", "openrouter", "groq"]);

export function getPlanningProviderPolicy(
  settings?: { useOpenAIProvider?: boolean },
  configuredProvider = process.env.AI_PROVIDER,
): AiPlanningProviderPolicyStatus {
  const name = (configuredProvider || "mock").trim().toLowerCase();
  if (name === "auto") {
    return {
      providerPolicyMode: "auto",
      openAiPreferenceApplied: settings?.useOpenAIProvider === true,
    };
  }
  if (FIXED_PROVIDER_NAMES.has(name)) {
    return {
      providerPolicyMode: "fixed",
      configuredPlanningProvider: name as AiEngineProvider,
      openAiPreferenceApplied: false,
    };
  }
  return {
    providerPolicyMode: "mock",
    configuredPlanningProvider: "mock",
    openAiPreferenceApplied: false,
  };
}

export function getProvider(): AiProvider {
  const name = (process.env.AI_PROVIDER || "mock").toLowerCase();
  return PROVIDERS[name] || mockProvider;
}

export function getProviderSequence(
  settings?: { useOpenAIProvider?: boolean },
  configuredProvider = process.env.AI_PROVIDER,
): AiProvider[] {
  const name = (configuredProvider || "mock").toLowerCase();
  const policy = getPlanningProviderPolicy(settings, name);
  if (policy.providerPolicyMode === "auto") {
    return policy.openAiPreferenceApplied
      ? [openaiProvider, geminiProvider, openrouterProvider, groqProvider, mockProvider]
      : [geminiProvider, openrouterProvider, groqProvider, mockProvider];
  }
  return [PROVIDERS[policy.configuredPlanningProvider ?? "mock"] || mockProvider];
}

export { mockProvider };
