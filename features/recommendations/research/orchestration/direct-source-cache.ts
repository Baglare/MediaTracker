import type { ResolvedWikimediaIdentity, ResolvedWikipediaPage } from "../adapters/types";
import { WIKIDATA_EXTERNAL_ID_REGISTRY_VERSION } from "../adapters/wikidata/external-id-registry";

export const WIKIMEDIA_IDENTITY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const WIKIPEDIA_PAGE_METADATA_CACHE_TTL_MS = 15 * 60 * 1000;

interface CacheRecord<T> { value: T; expiresAt: number }

export class BoundedMetadataCache<T> {
  private readonly entries = new Map<string, CacheRecord<T>>();
  private readonly pending = new Map<string, Promise<T>>();

  constructor(private readonly maxEntries = 128, private readonly now: () => number = Date.now) {}

  get(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) { this.entries.delete(key); return null; }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) return;
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value as string);
  }

  async getOrLoad(key: string, loader: () => Promise<T>, ttlMs: number): Promise<{ value: T; source: "cache" | "coalesced" | "loaded" }> {
    const cached = this.get(key);
    if (cached) return { value: cached, source: "cache" };
    const active = this.pending.get(key);
    if (active) return { value: await active, source: "coalesced" };
    const pending = loader().then((value) => { this.set(key, value, ttlMs); return value; }).finally(() => this.pending.delete(key));
    this.pending.set(key, pending);
    return { value: await pending, source: "loaded" };
  }
}

export function wikimediaIdentityCacheKey(scopeKey: string, mappingFingerprint: string): string {
  return `wikimedia-identity:${WIKIDATA_EXTERNAL_ID_REGISTRY_VERSION}:${scopeKey}:${encodeURIComponent(mappingFingerprint)}`;
}

export function wikipediaPageMetadataCacheKey(identity: ResolvedWikimediaIdentity, project: string): string {
  return `wikipedia-page:v1:${identity.versionScopeKey}:${identity.wikidataEntityId}:${project}`;
}

export function wikipediaDiscoveredPageMetadataCacheKey(identity: ResolvedWikimediaIdentity, project: string, title: string): string {
  return `wikipedia-page:v1:discovered:${identity.versionScopeKey}:${identity.wikidataEntityId}:${project}:${encodeURIComponent(title.normalize("NFKC"))}`;
}

export const wikimediaIdentityCache = new BoundedMetadataCache<ResolvedWikimediaIdentity>();
export const wikipediaPageMetadataCache = new BoundedMetadataCache<ResolvedWikipediaPage>();
