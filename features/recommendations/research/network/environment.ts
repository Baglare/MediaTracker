import "server-only";

export interface WikimediaResearchEnvironment {
  adapterEnabled: boolean;
  liveSmokeEnabled: boolean;
  userAgent: string | null;
  valid: boolean;
  warnings: readonly string[];
}

export function isMeaningfulWikimediaUserAgent(value: string | undefined): value is string {
  if (!value || value.length < 20 || value.length > 240 || /[\r\n\0]/.test(value)) return false;
  const hasClientVersion = /^[A-Za-z][A-Za-z0-9_.-]{2,50}\/\d+(?:\.\d+){1,3}\s+\(/.test(value);
  const hasContact = /(?:https:\/\/[^\s)]+|mailto:[^\s)]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i.test(value);
  return hasClientVersion && hasContact;
}

export function readWikimediaResearchEnvironment(env: NodeJS.ProcessEnv = process.env): WikimediaResearchEnvironment {
  const adapterEnabled = env.MEDIA_TRACKER_WIKIMEDIA_RESEARCH_ENABLED === "1";
  const liveSmokeEnabled = env.D7_RESEARCH_LIVE_SMOKE === "1";
  const rawUserAgent = env.MEDIA_TRACKER_RESEARCH_USER_AGENT?.trim();
  const validUserAgent = isMeaningfulWikimediaUserAgent(rawUserAgent);
  const warnings: string[] = [];
  if (!adapterEnabled) warnings.push("wikimedia_research_disabled");
  if (!validUserAgent) warnings.push("wikimedia_user_agent_invalid");
  return { adapterEnabled, liveSmokeEnabled, userAgent: validUserAgent ? rawUserAgent : null, valid: adapterEnabled && validUserAgent, warnings };
}

