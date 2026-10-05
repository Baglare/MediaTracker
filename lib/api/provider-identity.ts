const SAFE_USER_AGENT = /^[\x20-\x7E]{8,256}$/;
// Deployment identity contract, not a general-purpose email validator.
const IDENTIFIED_USER_AGENT = /^MediaTracker\/\d+(?:\.\d+){0,2} \([A-Za-z0-9]+(?:[._+-][A-Za-z0-9]+)*@[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*(?:\.[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)*\.[A-Za-z]{2,63}\)$/;

export function isValidProviderUserAgent(value: unknown): value is string {
  return typeof value === "string" && SAFE_USER_AGENT.test(value) && IDENTIFIED_USER_AGENT.test(value);
}

export function providerUserAgent(value = process.env.MEDIA_TRACKER_PROVIDER_USER_AGENT): string | null {
  return isValidProviderUserAgent(value) ? value : null;
}
