const SAFE_USER_AGENT = /^[\x20-\x7E]{8,256}$/;

export function providerUserAgent(value = process.env.MEDIA_TRACKER_PROVIDER_USER_AGENT): string | null {
  const normalized = value?.trim();
  return normalized && SAFE_USER_AGENT.test(normalized) ? normalized : null;
}
