import type { OwnProfileHeroData, OwnProfileSummary } from "./profile-summary";

export const OWN_PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

type Resource = "summary" | "hero";
type CachedValue = OwnProfileSummary | OwnProfileHeroData;
type Entry = { value: CachedValue; fetchedAt: number };

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<CachedValue>>();

function key(ownerId: string, resource: Resource): string {
  return `${ownerId}:${resource}`;
}

export function readOwnProfileCache<T extends CachedValue>(
  ownerId: string,
  resource: Resource,
): T | undefined {
  return cache.get(key(ownerId, resource))?.value as T | undefined;
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
  const cached = cache.get(cacheKey);
  if (!args.force && cached && now - cached.fetchedAt < OWN_PROFILE_CACHE_TTL_MS) {
    return cached.value as T;
  }
  const running = inFlight.get(cacheKey);
  if (running) return running as Promise<T>;

  const request = args.fetcher().then((value) => {
    cache.set(cacheKey, { value, fetchedAt: args.now ?? Date.now() });
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
    cache.set(cacheKey, { value: { ...current, ...patch }, fetchedAt: now });
  }
}

export function invalidateOwnProfileCache(ownerId: string, resource?: Resource): void {
  if (resource) {
    cache.delete(key(ownerId, resource));
    return;
  }
  cache.delete(key(ownerId, "summary"));
  cache.delete(key(ownerId, "hero"));
}

export function resetOwnProfileCacheForTests(): void {
  cache.clear();
  inFlight.clear();
}
