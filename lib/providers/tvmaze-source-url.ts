import { safeExternalUrl } from "@/lib/safe-external-url";

/** Show provenance only; season records point to their parent show. */
export function tvmazeSourceUrl(input: {
  externalSource?: unknown;
  externalId?: unknown;
  siteUrl?: unknown;
}): string | undefined {
  if (input.externalSource !== "tvmaze") return undefined;
  const id = typeof input.externalId === "string" && input.externalId.length <= 48
    ? /^([1-9]\d{0,14})(?:-season-[1-9]\d{0,5})?$/.exec(input.externalId)?.[1]
    : undefined;
  const existing = typeof input.siteUrl === "string" && input.siteUrl.length <= 2048
    && !input.siteUrl.includes("\\") ? safeExternalUrl(input.siteUrl) : undefined;
  if (existing) {
    const url = new URL(existing);
    const show = /^\/shows\/([1-9]\d{0,14})(?:\/[a-zA-Z0-9_-]+)?\/?$/.exec(url.pathname);
    if (url.protocol === "https:" && url.hostname === "www.tvmaze.com"
      && !url.port && !url.search && !url.hash && show && (!id || show[1] === id)) {
      return url.href;
    }
  }
  return id ? `https://www.tvmaze.com/shows/${id}` : undefined;
}
