"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AniListNormalizedResult } from "@/lib/anilist-types";
import type {
  GlobalSearchLibraryStatus,
  GlobalSearchResult,
} from "@/lib/global-search-types";
import type { OmdbNormalizedResult } from "@/lib/omdb-types";
import type { OpenLibraryNormalizedResult } from "@/lib/openlibrary-types";
import {
  getTvmazeSeasonNumber,
  getTvmazeShowExternalId,
  resolveAniListSeriesGroup,
} from "@/lib/series-group";
import type { TmdbNormalizedDetail } from "@/lib/tmdb-types";
import type { MediaItem } from "@/lib/types";
import type { TvmazeNormalizedDetail } from "@/lib/tvmaze-types";
import type { MediaCommands, QuickAddPayload } from "@/features/library/hooks/use-media-commands";
import {
  mapAniListResult,
  mapOmdbResult,
  mapOpenLibraryResult,
  mapTmdbResult,
  mapTvmazeDetail,
} from "@/features/discovery/domain/media-mappers";

interface UseDiscoveryControllerInput {
  mediaList: MediaItem[];
  commands: MediaCommands;
  commitMediaChanges: (next: MediaItem[], touched?: MediaItem[]) => void;
  preloadRelatedParts?: boolean;
}

function minimalTmdbDetail(item: GlobalSearchResult): TmdbNormalizedDetail {
  return {
    externalSource: "tmdb",
    externalId: item.externalId,
    type: "movie",
    title: item.title,
    overview: item.overview,
    releaseYear: item.releaseYear,
    coverUrl: item.coverUrl,
    totalProgress: 1,
    siteUrl: `https://www.themoviedb.org/movie/${item.externalId}`,
  };
}

export function useDiscoveryController({
  mediaList,
  commands,
  commitMediaChanges,
  preloadRelatedParts = false,
}: UseDiscoveryControllerInput) {
  const [tvmazeDetails, setTvmazeDetails] = useState<Record<string, TvmazeNormalizedDetail>>({});

  const itemsByTvmazeShow = useMemo(() => {
    const values = new Map<string, MediaItem[]>();
    for (const item of mediaList) {
      const showId = getTvmazeShowExternalId(item);
      if (!showId) continue;
      values.set(showId, [...(values.get(showId) ?? []), item]);
    }
    return values;
  }, [mediaList]);

  const isInLibrary = useCallback(
    (source: string, externalId: string) =>
      source === "tvmaze"
        ? itemsByTvmazeShow.has(externalId)
        : mediaList.some(
            (item) => item.externalSource === source && item.externalId === externalId,
          ),
    [itemsByTvmazeShow, mediaList],
  );

  const ensureTvmazeDetail = useCallback(
    async (showId: string) => {
      const cached = tvmazeDetails[showId];
      if (cached) return cached;
      const response = await fetch(`/api/tvmaze/details?id=${encodeURIComponent(showId)}`);
      const detail = (await response.json().catch(() => null)) as TvmazeNormalizedDetail | null;
      if (!response.ok || !detail) throw new Error("TVmaze detay verisi alınamadı");
      setTvmazeDetails((current) => current[showId] ? current : { ...current, [showId]: detail });
      return detail;
    },
    [tvmazeDetails],
  );

  const missingTvmazeSeasons = useCallback(
    (detail: TvmazeNormalizedDetail) => {
      const { seasonItems } = mapTvmazeDetail(detail);
      if (!seasonItems) return [];
      const existing = new Set(
        (itemsByTvmazeShow.get(detail.externalId) ?? [])
          .map(getTvmazeSeasonNumber)
          .filter((value): value is number => typeof value === "number"),
      );
      return seasonItems.filter(
        (item) => typeof item.seasonNumber === "number" && !existing.has(item.seasonNumber),
      );
    },
    [itemsByTvmazeShow],
  );

  const openTvmazePicker = useCallback(
    (detail: TvmazeNormalizedDetail, relatedOnly = false) => {
      const { singleItem, seasonItems } = mapTvmazeDetail(detail);
      if (!seasonItems) {
        if (relatedOnly || isInLibrary("tvmaze", detail.externalId)) return false;
        commands.openQuickAdd({ singleItem, seasonItems: null });
        return true;
      }
      const existingNumbers = new Set(
        (itemsByTvmazeShow.get(detail.externalId) ?? [])
          .map(getTvmazeSeasonNumber)
          .filter((value): value is number => typeof value === "number"),
      );
      const lockedSeasonIds = seasonItems
        .filter(
          (item) =>
            typeof item.seasonNumber === "number" && existingNumbers.has(item.seasonNumber),
        )
        .map((item) => item.id);
      if (relatedOnly && lockedSeasonIds.length === seasonItems.length) return false;
      const payload: QuickAddPayload = {
        singleItem,
        seasonItems,
        lockedSeasonIds: lockedSeasonIds.length > 0 ? lockedSeasonIds : undefined,
        preferredMode: "seasons",
        forceSeasonSelection: relatedOnly,
      };
      commands.openQuickAdd(payload);
      return true;
    },
    [commands, isInLibrary, itemsByTvmazeShow],
  );

  const addTvmaze = useCallback(
    (detail: TvmazeNormalizedDetail, options?: { relatedOnly?: boolean }) => {
      if (!options?.relatedOnly && isInLibrary("tvmaze", detail.externalId)) return;
      openTvmazePicker(detail, options?.relatedOnly ?? false);
    },
    [isInLibrary, openTvmazePicker],
  );

  const addOpenLibrary = useCallback(
    (result: OpenLibraryNormalizedResult) => {
      if (!isInLibrary("openlibrary", result.externalId)) {
        commands.openQuickAdd({ singleItem: mapOpenLibraryResult(result), seasonItems: null });
      }
    },
    [commands, isInLibrary],
  );

  const addAniList = useCallback(
    (result: AniListNormalizedResult) => {
      if (isInLibrary("anilist", result.externalId)) return;
      const item = mapAniListResult(result);
      const resolution = resolveAniListSeriesGroup(item, mediaList);
      Object.assign(item, resolution.newItemSeriesPatch);
      if (resolution.existingPatches.length > 0) {
        const patches = new Map(resolution.existingPatches.map((entry) => [entry.itemId, entry.fields]));
        const touched: MediaItem[] = [];
        const next = mediaList.map((existing) => {
          const patch = patches.get(existing.id);
          if (!patch) return existing;
          const updated = { ...existing };
          if (!updated.seriesGroupId && patch.seriesGroupId) updated.seriesGroupId = patch.seriesGroupId;
          if (!updated.seriesGroupTitle && patch.seriesGroupTitle) updated.seriesGroupTitle = patch.seriesGroupTitle;
          if (!updated.seriesRelationType && patch.seriesRelationType) updated.seriesRelationType = patch.seriesRelationType;
          if (updated.orderIndex === undefined && patch.orderIndex !== undefined) updated.orderIndex = patch.orderIndex;
          touched.push(updated);
          return updated;
        });
        commitMediaChanges(next, touched);
      }
      commands.openQuickAdd({ singleItem: item, seasonItems: null });
    },
    [commands, commitMediaChanges, isInLibrary, mediaList],
  );

  const addOmdb = useCallback(
    (result: OmdbNormalizedResult) => {
      if (!isInLibrary("omdb", result.externalId)) {
        commands.openQuickAdd({ singleItem: mapOmdbResult(result), seasonItems: null });
      }
    },
    [commands, isInLibrary],
  );

  const addTmdb = useCallback(
    (result: TmdbNormalizedDetail) => {
      if (!isInLibrary("tmdb", result.externalId)) {
        commands.openQuickAdd({ singleItem: mapTmdbResult(result), seasonItems: null });
      }
    },
    [commands, isInLibrary],
  );

  const addFromGlobalSearch = useCallback(
    async (item: GlobalSearchResult, options?: { relatedOnly?: boolean }) => {
      try {
        if (item.source === "tvmaze") {
          addTvmaze(await ensureTvmazeDetail(item.externalId), options);
        } else if (item.source === "anilist") {
          let detail = item.raw as AniListNormalizedResult;
          const response = await fetch(`/api/anilist/details?id=${encodeURIComponent(item.externalId)}`).catch(() => null);
          if (response?.ok) {
            const body = (await response.json()) as { result?: AniListNormalizedResult };
            if (body.result) detail = body.result;
          }
          addAniList(detail);
        } else if (item.source === "openlibrary") {
          addOpenLibrary(item.raw as OpenLibraryNormalizedResult);
        } else if (item.source === "omdb") {
          const response = await fetch(`/api/omdb/details?id=${encodeURIComponent(item.externalId)}`);
          const detail = (await response.json().catch(() => null)) as OmdbNormalizedResult | null;
          if (!response.ok || !detail) throw new Error("OMDb detay verisi alınamadı");
          addOmdb(detail);
        } else if (item.source === "tmdb") {
          let detail: TmdbNormalizedDetail | null = null;
          const response = await fetch(`/api/tmdb/details?id=${encodeURIComponent(item.externalId)}`).catch(() => null);
          if (response?.ok) {
            const body = (await response.json()) as { result?: TmdbNormalizedDetail };
            detail = body.result ?? null;
          }
          addTmdb(detail ?? minimalTmdbDetail(item));
        }
      } catch (error) {
        console.error("Global search ekleme hatası:", error);
        window.alert("Ekleme sırasında bir hata oluştu. Lütfen tekrar deneyin.");
      }
    },
    [addAniList, addOmdb, addOpenLibrary, addTmdb, addTvmaze, ensureTvmazeDetail],
  );

  const addMissingTvmazeParts = useCallback(
    async (itemOrId: MediaItem | string) => {
      const showId = typeof itemOrId === "string" ? itemOrId : getTvmazeShowExternalId(itemOrId);
      if (!showId) return false;
      return openTvmazePicker(await ensureTvmazeDetail(showId), true);
    },
    [ensureTvmazeDetail, openTvmazePicker],
  );

  const getLibraryStatus = useCallback(
    async (item: GlobalSearchResult): Promise<GlobalSearchLibraryStatus> => {
      let present = isInLibrary(item.source, item.externalId);
      if (
        !present &&
        item.type === "movie" &&
        (item.source === "tmdb" || item.source === "omdb") &&
        item.releaseYear
      ) {
        const title = item.title.trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");
        present = mediaList.some(
          (media) =>
            media.type === "movie" &&
            media.releaseYear === item.releaseYear &&
            (media.externalSource === "tmdb" || media.externalSource === "omdb") &&
            media.title.trim().toLocaleLowerCase("tr").replace(/\s+/g, " ") === title,
        );
      }
      if (item.source !== "tvmaze" || !present) {
        return { isInLibrary: present, hasAddableParts: false };
      }
      const detail = await ensureTvmazeDetail(item.externalId);
      const count = missingTvmazeSeasons(detail).length;
      return {
        isInLibrary: true,
        hasAddableParts: count > 0,
        actionLabel: "Sezon Ekle",
        missingCount: count,
      };
    },
    [ensureTvmazeDetail, isInLibrary, mediaList, missingTvmazeSeasons],
  );

  const resolveRelatedAction = useCallback(
    (item: MediaItem) => {
      const showId = getTvmazeShowExternalId(item);
      if (!showId) return { canAdd: false, label: "Parça Ekle" };
      const detail = tvmazeDetails[showId];
      return {
        canAdd: detail ? missingTvmazeSeasons(detail).length > 0 : false,
        label: "Sezon Ekle",
      };
    },
    [missingTvmazeSeasons, tvmazeDetails],
  );

  useEffect(() => {
    if (!preloadRelatedParts) return;
    const pending: number[] = [];
    for (const showId of itemsByTvmazeShow.keys()) {
      if (tvmazeDetails[showId]) continue;
      pending.push(
        window.setTimeout(() => {
          void ensureTvmazeDetail(showId).catch(() => undefined);
        }, 0),
      );
    }
    return () => pending.forEach(window.clearTimeout);
  }, [ensureTvmazeDetail, itemsByTvmazeShow, preloadRelatedParts, tvmazeDetails]);

  return {
    isInLibrary,
    addTvmaze,
    addAniList,
    addOpenLibrary,
    addFromGlobalSearch,
    addMissingTvmazeParts,
    getLibraryStatus,
    resolveRelatedAction,
  };
}
