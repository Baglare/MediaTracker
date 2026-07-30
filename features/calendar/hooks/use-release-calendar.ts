"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildReleaseMediaFingerprint,
  discardQuarantinedReleaseCacheCurrent,
  emptyReleaseCalendarCache,
  isReleaseCacheEntryStale,
  readReleaseCalendarCache,
  type ReleaseCalendarCache,
} from "@/features/calendar/data/release-cache";
import {
  createReleaseProviders,
} from "@/features/calendar/providers/release-providers";
import {
  buildReleaseAgendaView,
  cacheEntriesForMedia,
  refreshReleaseCalendarCache,
  type ReleaseAgendaView,
  type ReleaseRefreshFailure,
} from "@/features/calendar/services/release-calendar-service";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import type { MediaItem } from "@/lib/types";

function localToday(nowMs: number): string {
  const now = new Date(nowMs);
  return [
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

const EMPTY_AGENDA: ReleaseAgendaView = {
  today: [],
  next7Days: [],
  next30Days: [],
  later: [],
  tba: [],
};

interface OwnedReleaseState {
  ownerScope: string;
  cache: ReleaseCalendarCache;
  refreshing: boolean;
  loading: boolean;
  failures: ReleaseRefreshFailure[];
  observedAt: number;
  timeZone?: string;
}

export interface UseReleaseCalendarResult {
  agenda: ReleaseAgendaView;
  loading: boolean;
  refreshing: boolean;
  stale: boolean;
  partialError: boolean;
  failures: ReleaseRefreshFailure[];
  lastUpdated?: string;
  refresh: () => Promise<void>;
}

export function useReleaseCalendar(input: {
  ownerScope: LocalOwnerScope | null;
  mediaList: readonly MediaItem[];
  libraryReady: boolean;
}): UseReleaseCalendarResult {
  const [state, setState] = useState<OwnedReleaseState | null>(null);
  const generationRef = useRef(0);
  const scopeRef = useRef(input.ownerScope);
  const mediaFingerprint = useMemo(
    () => input.mediaList.map(buildReleaseMediaFingerprint).sort().join("|"),
    [input.mediaList],
  );

  const load = useCallback(async (force: boolean, requestedGeneration?: number) => {
    const generation = requestedGeneration ?? ++generationRef.current;
    await Promise.resolve();
    if (generation !== generationRef.current) return;
    const scope = scopeRef.current;
    if (!scope || !input.libraryReady) return;
    const observedAt = Date.now();
    const locale = typeof navigator === "undefined" ? undefined : navigator.language;
    let timeZone: string | undefined;
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      timeZone = undefined;
    }
    const providers = createReleaseProviders({ locale });
    const read = readReleaseCalendarCache(scope);
    if (read.status === "corrupt" && read.quarantineKey) {
      discardQuarantinedReleaseCacheCurrent(scope, read.quarantineKey);
    }
    const cache = read.status === "valid" ? read.data : emptyReleaseCalendarCache();
    if (generation !== generationRef.current || scopeRef.current?.key !== scope.key) return;
    const entries = cacheEntriesForMedia(input.mediaList, cache);
    const hasCachedData = entries.some((entry) => entry.events.length > 0);
    setState({
      ownerScope: scope.key,
      cache,
      refreshing: true,
      loading: !hasCachedData,
      observedAt,
      timeZone,
      failures: read.status === "corrupt"
        ? [{
            mediaRecordId: "cache",
            provider: "cache",
            error: { code: "invalid_payload", message: read.message },
          }]
        : [],
    });
    const refreshed = await refreshReleaseCalendarCache({
      scope,
      items: input.mediaList,
      cache,
      providers,
      force,
    });
    if (generation !== generationRef.current || scopeRef.current?.key !== scope.key) return;
    setState({
      ownerScope: scope.key,
      cache: refreshed.cache,
      refreshing: false,
      loading: false,
      observedAt: Date.now(),
      timeZone,
      failures: refreshed.failures,
    });
  }, [input.libraryReady, input.mediaList]);

  useEffect(() => {
    scopeRef.current = input.ownerScope;
    const generation = ++generationRef.current;
    if (input.ownerScope && input.libraryReady) void load(false, generation);
    return () => {
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [input.ownerScope, input.libraryReady, mediaFingerprint, load]);

  const visible = state?.ownerScope === input.ownerScope?.key ? state : null;
  const nowMs = visible?.observedAt ?? 0;
  const agenda = visible
    ? buildReleaseAgendaView({
        items: input.mediaList,
        cache: visible.cache,
        today: localToday(nowMs),
        timeZone: visible.timeZone,
        nowMs,
      })
    : EMPTY_AGENDA;
  const entries = visible ? cacheEntriesForMedia(input.mediaList, visible.cache) : [];
  const lastUpdated = entries
    .map((entry) => entry.fetchedAt)
    .sort()
    .at(-1);
  const refresh = useCallback(async () => {
    await load(true);
  }, [load]);

  return {
    agenda,
    loading: Boolean(input.ownerScope && input.libraryReady && (!visible || visible.loading)),
    refreshing: visible?.refreshing ?? false,
    stale: entries.some((entry) => isReleaseCacheEntryStale(entry, nowMs)),
    partialError: (visible?.failures.length ?? 0) > 0,
    failures: visible?.failures ?? [],
    lastUpdated,
    refresh,
  };
}
