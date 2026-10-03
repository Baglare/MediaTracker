// External links are navigation, not HTML. Reject active schemes even for
// legacy/imported local records; React escaping alone is not a URL policy.
export function safeExternalUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || /[\u0000-\u0020\u007f]/.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}
