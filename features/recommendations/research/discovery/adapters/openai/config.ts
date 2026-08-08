import "server-only";

const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;

export interface OpenAiWebDiscoveryEnvironment {
  enabled: boolean;
  liveSmokeEnabled: boolean;
  apiKey: string | null;
  model: string | null;
  explicitResearchModel: boolean;
  valid: boolean;
  warnings: readonly string[];
}

export function readOpenAiWebDiscoveryEnvironment(env: NodeJS.ProcessEnv = process.env): OpenAiWebDiscoveryEnvironment {
  const enabled = env.D7_OPENAI_WEB_DISCOVERY_ENABLED === "1";
  const liveSmokeEnabled = env.D7_OPENAI_WEB_DISCOVERY_LIVE_SMOKE === "1";
  const apiKey = env.OPENAI_API_KEY?.trim() || null;
  const explicitResearchModel = Boolean(env.OPENAI_RESEARCH_MODEL?.trim());
  const configuredModel = env.OPENAI_RESEARCH_MODEL?.trim() || env.OPENAI_MODEL?.trim() || null;
  const model = configuredModel && MODEL_PATTERN.test(configuredModel) ? configuredModel : null;
  const warnings: string[] = [];
  if (!enabled) warnings.push("openai_web_discovery_disabled");
  if (!apiKey) warnings.push("openai_api_key_missing");
  if (!model) warnings.push("openai_research_model_invalid");
  return { enabled, liveSmokeEnabled, apiKey, model, explicitResearchModel, valid: enabled && Boolean(apiKey) && Boolean(model), warnings };
}
