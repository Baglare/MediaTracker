import {
  isReleaseEligible,
  resolveTvSeasonIdentity,
  selectReleaseAgenda,
  selectReleaseEventsForMedia,
  sortReleaseEvents,
  type ReleaseAgenda,
  type ReleaseEvent,
  type ReleaseProviderContext,
} from "@/features/calendar/domain/release-calendar";
import {
  createReleaseCacheEntry,
  currentReleaseCacheEntry,
  isReleaseCacheEntryStale,
  upsertReleaseCacheEntry,
  writeReleaseCalendarCache,
  type ReleaseCalendarCache,
  type ReleaseCacheEntry,
} from "@/features/calendar/data/release-cache";
import {
  releaseProviderForMedia,
  type AutomaticReleaseProviderSet,
  type ReleaseFetchError,
  ReleaseProviderError,
} from "@/features/calendar/providers/release-providers";
import {
  buildHiddenProviderEventKey,
  decodeMediaReleaseCalendarData,
  isProviderReleaseEventHidden,
  manualReleaseEventsForMedia,
} from "@/features/calendar/domain/manual-release-calendar";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import type { PersonalStorageLike } from "@/lib/personal-data-storage";
import type { MediaItem } from "@/lib/types";

export interface ReleaseRefreshFailure {
  mediaRecordId: string;
  provider: "tvmaze" | "anilist" | "tmdb" | "cache";
  error: ReleaseFetchError;
}

export interface ReleaseRefreshResult {
  cache: ReleaseCalendarCache;
  failures: ReleaseRefreshFailure[];
  refreshedRecordIds: string[];
  writeFailed: boolean;
}

interface RefreshTask {
  item: MediaItem;
  provider: ReturnType<typeof releaseProviderForMedia>;
}

export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  limit: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 3));
  const results = new Array<R>(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(safeLimit, values.length) }, () => run()),
  );
  return results;
}

function safeFailure(error: unknown): ReleaseFetchError {
  if (error instanceof ReleaseProviderError) return error.detail;
  return {
    code: "invalid_payload",
    message: "Release provider sonucu doğrulanamadı.",
  };
}

export async function refreshReleaseCalendarCache(input: {
  scope: LocalOwnerScope;
  items: readonly MediaItem[];
  cache: ReleaseCalendarCache;
  providers: AutomaticReleaseProviderSet;
  force?: boolean;
  nowMs?: number;
  storage?: PersonalStorageLike;
}): Promise<ReleaseRefreshResult> {
  const nowMs = input.nowMs ?? Date.now();
  const tasks: RefreshTask[] = [];
  for (const item of input.items) {
    if (!isReleaseEligible(item)) continue;
    const provider = releaseProviderForMedia(item, input.providers);
    if (!provider) continue;
    const current = currentReleaseCacheEntry(input.cache, item);
    if (input.force || !current || isReleaseCacheEntryStale(current, nowMs)) {
      tasks.push({ item, provider });
    }
  }

  const taskResults = await mapWithConcurrency(tasks, 3, async ({ item, provider }) => {
    if (!provider) return null;
    const resolvedSeason = item.type === "tv"
      ? resolveTvSeasonIdentity(item)
      : null;
    const context: ReleaseProviderContext = {
      media: item,
      seasonIdentity: resolvedSeason?.status === "resolved"
        ? resolvedSeason.value
        : undefined,
    };
    try {
      const payload = await provider.fetchEvents({
        mediaRecordId: item.id,
        mediaIdentityKey: item.identity?.key,
        seasonIdentity: context.seasonIdentity,
      });
      const decoded = provider.normalize(payload, context);
      if (decoded.some((result) => result.status === "invalid")) {
        throw new ReleaseProviderError({
          code: "invalid_payload",
          message: "Normalize edilen release event codec doğrulamasını geçemedi.",
        });
      }
      const events = decoded.flatMap((result) =>
        result.status === "valid" ? [result.value] : []);
      return {
        ok: true as const,
        entry: createReleaseCacheEntry({
          item,
          provider: provider.id as "tvmaze" | "anilist" | "tmdb",
          events,
          fetchedAtMs: nowMs,
        }),
      };
    } catch (error) {
      return {
        ok: false as const,
        failure: {
          mediaRecordId: item.id,
          provider: provider.id as "tvmaze" | "anilist" | "tmdb",
          error: safeFailure(error),
        },
      };
    }
  });

  let nextCache = input.cache;
  const failures: ReleaseRefreshFailure[] = [];
  const refreshedRecordIds: string[] = [];
  for (const result of taskResults) {
    if (!result) continue;
    if (!result.ok) {
      failures.push(result.failure);
      continue;
    }
    nextCache = upsertReleaseCacheEntry(nextCache, result.entry);
    refreshedRecordIds.push(result.entry.mediaRecordId);
  }
  if (refreshedRecordIds.length === 0) {
    return { cache: input.cache, failures, refreshedRecordIds, writeFailed: false };
  }
  const write = writeReleaseCalendarCache(input.scope, nextCache, input.storage);
  if (!write.ok) {
    return {
      cache: input.cache,
      failures: [
        ...failures,
        {
          mediaRecordId: "cache",
          provider: "cache",
          error: { code: "invalid_payload", message: write.message },
        },
      ],
      refreshedRecordIds: [],
      writeFailed: true,
    };
  }
  return { cache: nextCache, failures, refreshedRecordIds, writeFailed: false };
}

export interface ReleaseAgendaViewItem {
  event: ReleaseEvent;
  media: MediaItem;
  stale: boolean;
  fetchedAt: string;
}

export interface HiddenProviderReleaseViewItem {
  key: string;
  media: MediaItem;
  event?: ReleaseEvent;
  stale: boolean;
}

export type ReleaseMediaFilter = "tv" | "anime" | "movie";

export function filterReleaseCalendarViewItems(
  items: readonly ReleaseAgendaViewItem[],
  filters: readonly ReleaseMediaFilter[],
): ReleaseAgendaViewItem[] {
  const selected = new Set(filters);
  return items.filter((item) => selected.has(item.media.type as ReleaseMediaFilter));
}

export interface ReleaseAgendaView {
  today: ReleaseAgendaViewItem[];
  next7Days: ReleaseAgendaViewItem[];
  next30Days: ReleaseAgendaViewItem[];
  later: ReleaseAgendaViewItem[];
  tba: ReleaseAgendaViewItem[];
}

export function buildReleaseCalendarViewItems(input: {
  items: readonly MediaItem[];
  cache: ReleaseCalendarCache;
  nowMs?: number;
}): ReleaseAgendaViewItem[] {
  const nowMs = input.nowMs ?? Date.now();
  const visibleItems: ReleaseAgendaViewItem[] = [];
  for (const media of input.items) {
    if (!isReleaseEligible(media)) continue;
    for (const event of manualReleaseEventsForMedia(media)) {
      const updatedAt = media.releaseCalendar?.manualEvents
        .find((entry) => entry.id === event.id)?.updatedAt ?? new Date(0).toISOString();
      visibleItems.push({ event, media, stale: false, fetchedAt: updatedAt });
    }
    const entry = currentReleaseCacheEntry(input.cache, media);
    if (!entry) continue;
    const stale = isReleaseCacheEntryStale(entry, nowMs);
    for (const event of selectReleaseEventsForMedia(media, entry.events)) {
      if (isProviderReleaseEventHidden(media, event)) continue;
      visibleItems.push({ event, media, stale, fetchedAt: entry.fetchedAt });
    }
  }
  const order = new Map(
    sortReleaseEvents(visibleItems.map(({ event }) => event))
      .map((event, index) => [event, index]),
  );
  return visibleItems.sort(
    (left, right) => (order.get(left.event) ?? 0) - (order.get(right.event) ?? 0),
  );
}

export function buildHiddenProviderReleaseViewItems(input: {
  items: readonly MediaItem[];
  cache: ReleaseCalendarCache;
  nowMs?: number;
}): HiddenProviderReleaseViewItem[] {
  const nowMs = input.nowMs ?? Date.now();
  const results: HiddenProviderReleaseViewItem[] = [];
  for (const media of input.items) {
    const releaseData = decodeMediaReleaseCalendarData(media.releaseCalendar, media.id).value;
    if (releaseData.hiddenProviderEventKeys.length === 0) continue;
    const entry = currentReleaseCacheEntry(input.cache, media);
    const eventsByKey = new Map(
      (entry?.events ?? []).flatMap((event) => {
        const key = buildHiddenProviderEventKey(event);
        return key ? [[key, event] as const] : [];
      }),
    );
    for (const key of releaseData.hiddenProviderEventKeys) {
      results.push({
        key,
        media,
        event: eventsByKey.get(key),
        stale: entry ? isReleaseCacheEntryStale(entry, nowMs) : false,
      });
    }
  }
  return results.sort((left, right) =>
    left.media.title.localeCompare(right.media.title, "tr")
    || left.key.localeCompare(right.key, "en"));
}

export function buildReleaseAgendaFromViewItems(input: {
  items: readonly ReleaseAgendaViewItem[];
  today: string;
  timeZone?: string;
}): ReleaseAgendaView {
  const byEvent = new Map(input.items.map((item) => [item.event, item]));
  const agenda: ReleaseAgenda = selectReleaseAgenda(
    input.items.map(({ event }) => event),
    input.today,
    { timeZone: input.timeZone },
  );
  const map = (events: ReleaseEvent[]) =>
    events.flatMap((event) => {
      const view = byEvent.get(event);
      return view ? [view] : [];
    });
  return {
    today: map(agenda.today),
    next7Days: map(agenda.next7Days),
    next30Days: map(agenda.next30Days),
    later: map(agenda.later),
    tba: map(agenda.tba),
  };
}

export function buildReleaseAgendaView(input: {
  items: readonly MediaItem[];
  cache: ReleaseCalendarCache;
  today: string;
  timeZone?: string;
  nowMs?: number;
}): ReleaseAgendaView {
  return buildReleaseAgendaFromViewItems({
    items: buildReleaseCalendarViewItems(input),
    today: input.today,
    timeZone: input.timeZone,
  });
}

export function cacheEntriesForMedia(
  items: readonly MediaItem[],
  cache: ReleaseCalendarCache,
): ReleaseCacheEntry[] {
  return items.flatMap((item) => {
    const entry = currentReleaseCacheEntry(cache, item);
    return entry ? [entry] : [];
  });
}
