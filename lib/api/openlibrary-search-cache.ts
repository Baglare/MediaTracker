import "server-only";
import { createHash } from "node:crypto";
import type { OpenLibraryNormalizedResult } from "@/lib/openlibrary-types";

export const OPEN_LIBRARY_SEARCH_CACHE_MAX_ENTRIES = 64;
export const OPEN_LIBRARY_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
type SearchPayload = { results: OpenLibraryNormalizedResult[]; totalFound: number };
const entries = new Map<string, { payload: SearchPayload; expiresAt: number }>();

export function openLibrarySearchCacheKey(query: string): string {
  // Reduces plaintext retention; this digest does not promise query secrecy.
  return `openlibrary:search:v1:${createHash("sha256").update(query.trim()).digest("hex")}`;
}

export function getOpenLibrarySearchCache(key: string): SearchPayload | undefined {
  const now = Date.now();
  for (const [entryKey, entry] of entries) if (entry.expiresAt <= now) entries.delete(entryKey);
  const entry = entries.get(key);
  if (!entry) return undefined;
  entries.delete(key);
  entries.set(key, entry);
  return entry.payload;
}

export function setOpenLibrarySearchCache(key: string, payload: SearchPayload): void {
  if (!payload.results.length) return;
  entries.delete(key);
  entries.set(key, { payload, expiresAt: Date.now() + OPEN_LIBRARY_SEARCH_CACHE_TTL_MS });
  while (entries.size > OPEN_LIBRARY_SEARCH_CACHE_MAX_ENTRIES) entries.delete(entries.keys().next().value!);
}
