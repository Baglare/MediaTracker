// ============================================
// Provider Seçici
// ============================================
// AI_PROVIDER env'ine göre aktif provider'ı seçer (varsayılan: mock).

import { AiProvider } from "./types";
import { mockProvider } from "./providers/mock-provider";
import { geminiProvider } from "./providers/gemini-provider";

export function getProvider(): AiProvider {
  const name = (process.env.AI_PROVIDER || "mock").toLowerCase();
  if (name === "gemini") return geminiProvider;
  return mockProvider;
}

export { mockProvider };
