import { safeExternalUrl } from "@/lib/safe-external-url";

const KEY = /^\/(?:works\/OL[1-9]\d{0,14}W|books\/OL[1-9]\d{0,14}M)$(?![\s\S])/;

/** Exact Work/edition provenance; never echoes an arbitrary provider URL. */
export function openLibrarySourceUrl(input: {
  externalSource?: unknown; externalId?: unknown; siteUrl?: unknown;
}): string | undefined {
  if (input.externalSource !== "openlibrary") return undefined;
  const key = typeof input.externalId === "string" && input.externalId.length <= 48 && KEY.test(input.externalId)
    ? input.externalId : undefined;
  const existing = typeof input.siteUrl === "string" && input.siteUrl.length <= 256
    && !input.siteUrl.includes("\\") ? safeExternalUrl(input.siteUrl) : undefined;
  if (existing) {
    const url = new URL(existing);
    if (url.protocol === "https:" && url.hostname === "openlibrary.org" && !url.port
      && !url.search && !url.hash && KEY.test(url.pathname) && (!key || key === url.pathname)) return url.href;
  }
  return key ? `https://openlibrary.org${key}` : undefined;
}
