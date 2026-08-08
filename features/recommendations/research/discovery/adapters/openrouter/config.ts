import "server-only";

export const OPENROUTER_RESEARCH_MODEL_ALLOWLIST = ["openai/gpt-5.2", "openai/o4-mini"] as const;
export type OpenRouterResearchModel = (typeof OPENROUTER_RESEARCH_MODEL_ALLOWLIST)[number];

export interface OpenRouterWebDiscoveryEnvironment {
  enabled: boolean;
  liveSmokeEnabled: boolean;
  apiKey: string | null;
  model: OpenRouterResearchModel | null;
  valid: boolean;
  warnings: readonly string[];
}

export function readOpenRouterWebDiscoveryEnvironment(env: NodeJS.ProcessEnv = process.env): OpenRouterWebDiscoveryEnvironment {
  const enabled = env.D7_OPENROUTER_WEB_DISCOVERY_ENABLED === "1";
  const liveSmokeEnabled = env.D7_OPENROUTER_WEB_DISCOVERY_LIVE_SMOKE === "1";
  const apiKey = env.OPENROUTER_API_KEY?.trim() || null;
  const configuredModel = env.OPENROUTER_RESEARCH_MODEL?.trim() || null;
  const model = OPENROUTER_RESEARCH_MODEL_ALLOWLIST.find((item) => item === configuredModel) ?? null;
  const warnings: string[] = [];
  if (!enabled) warnings.push("openrouter_web_discovery_disabled");
  if (!apiKey) warnings.push("openrouter_api_key_missing");
  if (!model) warnings.push("openrouter_research_model_not_allowlisted");
  warnings.push("openrouter_responses_server_tool_beta", "openrouter_search_engine_forced_to_exa");
  return { enabled, liveSmokeEnabled, apiKey, model, valid: enabled && Boolean(apiKey) && Boolean(model), warnings };
}
