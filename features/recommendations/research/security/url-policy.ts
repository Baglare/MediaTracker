import { getResearchSource } from "../domain/source-registry";

export const RESEARCH_URL_MAX_LENGTH = 2048;

export type ResearchUrlRejectionReason =
  | "url_invalid"
  | "url_too_long"
  | "https_required"
  | "userinfo_forbidden"
  | "non_default_port_forbidden"
  | "ip_literal_forbidden"
  | "local_host_forbidden"
  | "unicode_or_punycode_host_forbidden"
  | "source_not_found"
  | "source_disabled"
  | "host_not_allowlisted";

export type ResearchUrlPolicyResult =
  | { ok: true; canonicalUrl: string; normalizedHost: string; sourceId: string }
  | { ok: false; reason: ResearchUrlRejectionReason };

function isIpLiteral(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, "");
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(bare) || bare.includes(":");
}

function suspiciousHost(hostname: string): boolean {
  return hostname.split(".").some((label) => label.startsWith("xn--")) || /[^\x00-\x7F]/.test(hostname);
}

export function validateResearchUrl(input: { url: string; sourceId: string }): ResearchUrlPolicyResult {
  if (typeof input.url !== "string" || input.url.length === 0) return { ok: false, reason: "url_invalid" };
  if (input.url.length > RESEARCH_URL_MAX_LENGTH) return { ok: false, reason: "url_too_long" };
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return { ok: false, reason: "url_invalid" };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "https_required" };
  if (parsed.username || parsed.password) return { ok: false, reason: "userinfo_forbidden" };
  if (parsed.port && parsed.port !== "443") return { ok: false, reason: "non_default_port_forbidden" };
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (isIpLiteral(hostname)) return { ok: false, reason: "ip_literal_forbidden" };
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return { ok: false, reason: "local_host_forbidden" };
  if (suspiciousHost(hostname)) return { ok: false, reason: "unicode_or_punycode_host_forbidden" };
  const source = getResearchSource(input.sourceId);
  if (!source) return { ok: false, reason: "source_not_found" };
  if (!source.enabled) return { ok: false, reason: "source_disabled" };
  if (!source.allowedHosts.includes(hostname)) return { ok: false, reason: "host_not_allowlisted" };
  parsed.hostname = hostname;
  parsed.hash = "";
  if (parsed.port === "443") parsed.port = "";
  return { ok: true, canonicalUrl: parsed.toString(), normalizedHost: hostname, sourceId: source.sourceId };
}

export function validateResearchRedirect(input: { fromUrl: string; toUrl: string; sourceId: string }): ResearchUrlPolicyResult {
  const from = validateResearchUrl({ url: input.fromUrl, sourceId: input.sourceId });
  if (!from.ok) return from;
  return validateResearchUrl({ url: input.toUrl, sourceId: input.sourceId });
}

