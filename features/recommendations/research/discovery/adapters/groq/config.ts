import "server-only";

export const GROQ_RESEARCH_MODEL_ALLOWLIST = ["groq/compound", "groq/compound-mini"] as const;
export type GroqResearchModel = (typeof GROQ_RESEARCH_MODEL_ALLOWLIST)[number];

export interface GroqWebDiscoveryEnvironment {
  enabled: boolean;
  liveSmokeEnabled: boolean;
  apiKey: string | null;
  model: GroqResearchModel | null;
  valid: boolean;
  warnings: readonly string[];
}

export function readGroqWebDiscoveryEnvironment(env: NodeJS.ProcessEnv = process.env): GroqWebDiscoveryEnvironment {
  const enabled = env.D7_GROQ_WEB_DISCOVERY_ENABLED === "1";
  const liveSmokeEnabled = env.D7_GROQ_WEB_DISCOVERY_LIVE_SMOKE === "1";
  const apiKey = env.GROQ_API_KEY?.trim() || null;
  const configuredModel = env.GROQ_RESEARCH_MODEL?.trim() || null;
  const model = GROQ_RESEARCH_MODEL_ALLOWLIST.find((item) => item === configuredModel) ?? null;
  const warnings: string[] = [];
  if (!enabled) warnings.push("groq_web_discovery_disabled");
  if (!apiKey) warnings.push("groq_api_key_missing");
  if (!model) warnings.push("groq_research_model_not_allowlisted");
  return { enabled, liveSmokeEnabled, apiKey, model, valid: enabled && Boolean(apiKey) && Boolean(model), warnings };
}
