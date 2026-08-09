import type { OwnProfileHeroData, OwnProfileSummary } from "./profile-summary";

export const OWN_PROFILE_CACHE_TTL_MS = 4 * 60 * 1000;
export const OWN_PROFILE_SESSION_CACHE_VERSION = 1 as const;

type Resource = "summary" | "hero";
type CachedValue = OwnProfileSummary | OwnProfileHeroData;
type Entry = { value: CachedValue; fetchedAt: number; expiresAt: number };

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<CachedValue>>();

function key(ownerId: string, resource: Resource): string {
  return `${ownerId}:${resource}`;
}

function sessionKey(ownerId: string, resource: Resource): string {
  return `mediaTracker:ownProfile:v${OWN_PROFILE_SESSION_CACHE_VERSION}:${ownerId}:${resource}`;
}

function readSession(ownerId: string, resource: Resource, now: number): Entry | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(sessionKey(ownerId, resource));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { version?: unknown; ownerId?: unknown; resource?: unknown; value?: unknown; fetchedAt?: unknown; expiresAt?: unknown };
    if (parsed.version !== OWN_PROFILE_SESSION_CACHE_VERSION || parsed.ownerId !== ownerId || parsed.resource !== resource || typeof parsed.fetchedAt !== "number" || typeof parsed.expiresAt !== "number" || parsed.expiresAt <= now || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
      window.sessionStorage.removeItem(sessionKey(ownerId, resource));
      return undefined;
    }
    return { value: parsed.value as CachedValue, fetchedAt: parsed.fetchedAt, expiresAt: parsed.expiresAt };
  } catch { return undefined; }
}

function writeSession(ownerId: string, resource: Resource, entry: Entry): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(sessionKey(ownerId, resource), JSON.stringify({ version: OWN_PROFILE_SESSION_CACHE_VERSION, ownerId, resource, ...entry }));
  } catch { /* Session cache is an optional performance layer. */ }
}

function readOwnProfileCacheAt<T extends CachedValue>(
  ownerId: string,
  resource: Resource,
  now: number,
): T | undefined {
  const cacheKey = key(ownerId, resource);
  let entry = cache.get(cacheKey);
  if (entry && entry.expiresAt <= now) { cache.delete(cacheKey); entry = undefined; }
  entry ??= readSession(ownerId, resource, now);
  if (entry) cache.set(cacheKey, entry);
  return entry?.value as T | undefined;
}

export function readOwnProfileCache<T extends CachedValue>(
  ownerId: string,
  resource: Resource,
): T | undefined {
  return readOwnProfileCacheAt<T>(ownerId, resource, Date.now());
}

export async function loadOwnProfileCache<T extends CachedValue>(args: {
  ownerId: string;
  resource: Resource;
  fetcher: () => Promise<T>;
  force?: boolean;
  now?: number;
}): Promise<T> {
  const cacheKey = key(args.ownerId, args.resource);
  const now = args.now ?? Date.now();
  const cachedValue = readOwnProfileCacheAt<T>(args.ownerId, args.resource, now);
  const cached = cache.get(cacheKey);
  if (!args.force && cachedValue && cached && cached.expiresAt > now) {
    return cached.value as T;
  }
  const running = inFlight.get(cacheKey);
  if (running) return running as Promise<T>;

  const request = args.fetcher().then((value) => {
    const fetchedAt = args.now ?? Date.now();
    const entry = { value, fetchedAt, expiresAt: fetchedAt + OWN_PROFILE_CACHE_TTL_MS };
    cache.set(cacheKey, entry);
    writeSession(args.ownerId, args.resource, entry);
    return value;
  }).finally(() => {
    inFlight.delete(cacheKey);
  });
  inFlight.set(cacheKey, request);
  return request;
}

export function updateOwnProfileCache(
  ownerId: string,
  patch: Partial<OwnProfileHeroData>,
): void {
  const now = Date.now();
  for (const resource of ["summary", "hero"] as const) {
    const cacheKey = key(ownerId, resource);
    const current = cache.get(cacheKey)?.value ?? {};
    const entry = { value: { ...current, ...patch }, fetchedAt: now, expiresAt: now + OWN_PROFILE_CACHE_TTL_MS };
    cache.set(cacheKey, entry);
    writeSession(ownerId, resource, entry);
  }
}

export function invalidateOwnProfileCache(ownerId: string, resource?: Resource): void {
  if (resource) {
    cache.delete(key(ownerId, resource));
    if (typeof window !== "undefined") window.sessionStorage.removeItem(sessionKey(ownerId, resource));
    return;
  }
  cache.delete(key(ownerId, "summary"));
  cache.delete(key(ownerId, "hero"));
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(sessionKey(ownerId, "summary"));
    window.sessionStorage.removeItem(sessionKey(ownerId, "hero"));
  }
}

export function resetOwnProfileCacheForTests(): void {
  cache.clear();
  inFlight.clear();
}
