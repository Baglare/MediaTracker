// ============================================
// Provider Seçici
// ============================================
// AI_PROVIDER env'ine göre aktif provider'ı seçer (varsayılan: mock).

import { AiProvider } from "./types";
import { mockProvider } from "./providers/mock-provider";
import { geminiProvider } from "./providers/gemini-provider";
import { groqProvider, openrouterProvider } from "./providers/openai-compatible-provider";

const PROVIDERS: Record<string, AiProvider> = {
  mock: mockProvider,
  gemini: geminiProvider,
  openrouter: openrouterProvider,
  groq: groqProvider,
};

export function getProvider(): AiProvider {
  const name = (process.env.AI_PROVIDER || "mock").toLowerCase();
  return PROVIDERS[name] || mockProvider;
}

export function getProviderSequence(): AiProvider[] {
  const name = (process.env.AI_PROVIDER || "mock").toLowerCase();
  if (name === "auto") {
    return [geminiProvider, openrouterProvider, groqProvider, mockProvider];
  }
  return [PROVIDERS[name] || mockProvider];
}

export { mockProvider };
