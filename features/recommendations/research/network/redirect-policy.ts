import { validateResearchRedirect, validateResearchUrl } from "../security/url-policy";
import type { ResearchSourceId } from "../domain/source-registry";
import { SecureResearchHttpError } from "./types";

export const RESEARCH_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
export const RESEARCH_MAX_REDIRECTS = 2;

export function resolveResearchRedirect(input: {
  sourceId: ResearchSourceId;
  fromUrl: string;
  location: string | undefined;
  visited: ReadonlySet<string>;
}): string {
  if (!input.location) throw new SecureResearchHttpError("redirect_rejected", "redirect_location_missing");
  let target: string;
  try {
    target = new URL(input.location, input.fromUrl).toString();
  } catch {
    throw new SecureResearchHttpError("redirect_rejected", "redirect_location_invalid");
  }
  const result = validateResearchRedirect({ fromUrl: input.fromUrl, toUrl: target, sourceId: input.sourceId });
  if (!result.ok) throw new SecureResearchHttpError("redirect_rejected", result.reason);
  if (input.visited.has(result.canonicalUrl)) throw new SecureResearchHttpError("redirect_rejected", "redirect_loop");
  return result.canonicalUrl;
}

export function canonicalResearchRequestUrl(sourceId: ResearchSourceId, url: string): string {
  const result = validateResearchUrl({ sourceId, url });
  if (!result.ok) throw new SecureResearchHttpError("security_rejected", result.reason);
  return result.canonicalUrl;
}

