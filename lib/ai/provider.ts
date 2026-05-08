// ============================================
// Provider Seçici
// ============================================
// AI_PROVIDER env'ine göre aktif provider'ı seçer (varsayılan: mock).

import { AiProvider } from "./types";
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

export function getProvider(): AiProvider {
  const name = (process.env.AI_PROVIDER || "mock").toLowerCase();
  return PROVIDERS[name] || mockProvider;
}

export function getProviderSequence(settings?: { useOpenAIProvider?: boolean }): AiProvider[] {
  const name = (process.env.AI_PROVIDER || "mock").toLowerCase();
  if (name === "auto") {
    return settings?.useOpenAIProvider
      ? [openaiProvider, geminiProvider, openrouterProvider, groqProvider, mockProvider]
      : [geminiProvider, openrouterProvider, groqProvider, mockProvider];
  }
  return [PROVIDERS[name] || mockProvider];
}

export { mockProvider };
