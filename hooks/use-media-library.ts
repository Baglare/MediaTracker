"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mockMediaList } from "@/lib/mock-media";
import {
  loadScopedMediaList,
  loadScopedProgressLogs,
  saveScopedLibrarySnapshot,
  type LocalDatasetOrigin,
  type StorageWriteResult,
} from "@/lib/storage";
import {
  materializeDemoDatasetMutation,
  resolveLibraryHydration,
  type LibraryIntegrity,
} from "@/lib/library-hydration";
import { decodeMediaItems, decodeProgressLogs } from "@/lib/local-data-codec";
import {
  enqueueMediaDelete,
  enqueueMediaUpsert,
  enqueueProgressLog,
  enqueueOwnedSnapshotSyncPlan,
  setOwnerScope as setSyncOwnerScope,
} from "@/lib/sync-manager";
import {
  assignUnscopedLibraryToUser,
  deferUnscopedOwnership,
  keepExistingUserLibrary,
  keepUnscopedLibraryAsGuest,
  prepareScopedLibrary,
  type LocalOwnershipCandidate,
  type OwnershipActionResult,
} from "@/lib/local-data-ownership";
import {
  isCurrentOwnerGeneration,
  isHydratedOwnerVisible,
  resolveLocalOwnerScope,
  type LocalOwnerScope,
} from "@/lib/local-owner-scope";
import {
  getIncrementAmount,
  getProgressLabel,
  getProgressUnit,
  getStatusLabel,
  isMovieLike,
} from "@/lib/progress";
import type { MediaItem, MediaType, ProgressLog } from "@/lib/types";
import { withMediaClassification } from "@/lib/types";
import { withInferredSeriesGroup } from "@/lib/series-group";
import {
  cacheSocialActivityPreferences,
  flushSocialOutbox,
  loadRecommendationLinks,
  queueMediaSocialEvents,
  queueRecommendationProgress,
  sendSocialOutboxItem,
} from "@/lib/social/local-social";
import { DEFAULT_ACTIVITY_PREFERENCES, type SocialPreferences } from "@/lib/social/interactions";
import { flushXpOutbox, queueXpMediaState, sendXpOutboxBatch } from "@/lib/xp/outbox";

type ProgressAction = "increment" | "complete" | "manual_adjust" | "added";

interface ProgressLogInput {
  mediaId: string;
  mediaTitle: string;
  mediaType: MediaType;
  action: ProgressAction;
  amount: number;
  previousProgress: number;
  newProgress: number;
  detail?: string;
}

function appendProgressLog(
  progressLogs: ProgressLog[],
  args: ProgressLogInput,
): { logs: ProgressLog[]; persistedLog: ProgressLog } {
  const nowIso = new Date().toISOString();
  const nextLog: ProgressLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    mediaId: args.mediaId,
    mediaTitle: args.mediaTitle,
    mediaType: args.mediaType,
    action: args.action,
    detail: args.detail,
    amount: args.amount,
    unit: getProgressUnit(args.mediaType),
    previousProgress: args.previousProgress,
    newProgress: args.newProgress,
    createdAt: nowIso,
  };

  const mergeable = args.action === "increment" || args.action === "manual_adjust";
  if (mergeable) {
    const last = [...progressLogs].reverse().find((log) => log.mediaId === args.mediaId);
    const canMerge =
      last
      && last.action === args.action
      && last.newProgress === args.previousProgress
      && Date.now() - new Date(last.createdAt).getTime() < 60 * 60 * 1000;
    if (canMerge && last) {
      const merged: ProgressLog = {
        ...last,
        amount: last.amount + args.amount,
        newProgress: args.newProgress,
        createdAt: nowIso,
        detail: args.detail ?? last.detail,
      };
      return {
        logs: progressLogs.map((log) => log.id === merged.id ? merged : log),
        persistedLog: merged,
      };
    }
  }

  return { logs: [...progressLogs, nextLog], persistedLog: nextLog };
}

export function useMediaLibrary(userId: string | null | undefined) {
  const scope = useMemo(() => resolveLocalOwnerScope(userId), [userId]);
  const scopeKey = scope?.key ?? null;
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [progressLogs, setProgressLogs] = useState<ProgressLog[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [libraryIntegrity, setLibraryIntegrity] = useState<LibraryIntegrity>("pending");
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storageReadStatuses, setStorageReadStatuses] = useState({
    media: "missing",
    progressLogs: "missing",
  });
  const [datasetOrigin, setDatasetOrigin] = useState<LocalDatasetOrigin>("user");
  const [hydratedScopeKey, setHydratedScopeKey] = useState<string | null>(null);
  const [ownershipCandidate, setOwnershipCandidate] = useState<LocalOwnershipCandidate | null>(null);
  const [deferredOwnershipCandidate, setDeferredOwnershipCandidate] =
    useState<LocalOwnershipCandidate | null>(null);
  const [hydrationNonce, setHydrationNonce] = useState(0);
  const mediaRef = useRef<MediaItem[]>([]);
  const logsRef = useRef<ProgressLog[]>([]);
  const integrityRef = useRef<LibraryIntegrity>("pending");
  const scopeRef = useRef<LocalOwnerScope | null>(scope);
  const originRef = useRef<LocalDatasetOrigin>("user");
  const hydrationGenerationRef = useRef(0);

  const applyPersistedSnapshot = useCallback((
    nextMedia: MediaItem[],
    nextLogs: ProgressLog[],
  ): StorageWriteResult => {
    const activeScope = scopeRef.current;
    if (integrityRef.current !== "valid" || !activeScope) {
      const result: StorageWriteResult = {
        ok: false,
        code: "storage_unavailable",
        message: "Kütüphane verisi güvenli biçimde yüklenmeden değişiklik yapılamaz.",
        recoverable: true,
      };
      setStorageError(result.message);
      return result;
    }
    const nextOrigin = originRef.current === "demo" ? "user" : originRef.current;
    const persistedMedia = originRef.current === "demo"
      ? materializeDemoDatasetMutation(mockMediaList, nextMedia)
      : nextMedia;
    const result = saveScopedLibrarySnapshot(
      activeScope,
      persistedMedia,
      nextLogs,
      nextOrigin,
    );
    if (!result.ok) {
      setStorageError(result.message);
      return result;
    }
    mediaRef.current = persistedMedia;
    logsRef.current = nextLogs;
    originRef.current = nextOrigin;
    setMediaList(persistedMedia);
    setProgressLogs(nextLogs);
    setDatasetOrigin(nextOrigin);
    setStorageError(null);
    return result;
  }, []);

  useEffect(() => {
    const generation = ++hydrationGenerationRef.current;
    scopeRef.current = scope;
    mediaRef.current = [];
    logsRef.current = [];
    integrityRef.current = "pending";
    setSyncOwnerScope(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- owner switch must hide stale data before hydration.
    setMediaList([]);
    setProgressLogs([]);
    setLibraryIntegrity("pending");
    setHydratedScopeKey(null);
    setIsLoaded(false);
    setOwnershipCandidate(null);
    setDeferredOwnershipCandidate(null);
    if (!scope) return;

    void Promise.resolve().then(() => {
      const prepared = prepareScopedLibrary(scope);
      if (!isCurrentOwnerGeneration(generation, hydrationGenerationRef.current)) return;
      const hydration = resolveLibraryHydration({
        media: prepared.media,
        progressLogs: prepared.progressLogs,
        demoItems: mockMediaList,
        allowDemoData: scope.kind === "guest",
      });
      let integrity: LibraryIntegrity = hydration.integrity;
      let error = hydration.integrity === "valid" ? "" : hydration.issues.join(" ");

      if (hydration.integrity === "valid" && hydration.requiresInitialWrite) {
        const initialWrite = saveScopedLibrarySnapshot(
          scope,
          hydration.mediaItems,
          hydration.progressLogs,
          hydration.datasetOrigin,
        );
        if (!initialWrite.ok) {
          integrity = "storage_unavailable";
          error = initialWrite.message;
        }
      }
      if (!isCurrentOwnerGeneration(generation, hydrationGenerationRef.current)) return;
      const safeMedia = integrity === "valid" ? hydration.mediaItems : [];
      const safeLogs = integrity === "valid" ? hydration.progressLogs : [];
      mediaRef.current = safeMedia;
      logsRef.current = safeLogs;
      integrityRef.current = integrity;
      originRef.current = hydration.datasetOrigin;
      setMediaList(safeMedia);
      setProgressLogs(safeLogs);
      setDatasetOrigin(hydration.datasetOrigin);
      setLibraryIntegrity(integrity);
      setStorageError(error || null);
      setStorageReadStatuses({
        media: hydration.mediaReadStatus,
        progressLogs: hydration.progressReadStatus,
      });
      setOwnershipCandidate(prepared.ownershipCandidate ?? null);
      setDeferredOwnershipCandidate(prepared.deferredCandidate ?? null);
      setHydratedScopeKey(scope.key);
      setIsLoaded(true);
      setSyncOwnerScope(integrity === "valid" ? scope : null);
    });
    return () => {
      hydrationGenerationRef.current += 1;
      setSyncOwnerScope(null);
    };
  }, [hydrationNonce, scope]);

  useEffect(() => {
    const reload = () => {
      if (!scope || hydratedScopeKey !== scope.key) return;
      const mediaRead = loadScopedMediaList(scope);
      const logsRead = loadScopedProgressLogs(scope);
      if (
        (mediaRead.status !== "valid" && mediaRead.status !== "empty")
        || (logsRead.status !== "valid" && logsRead.status !== "empty")
      ) {
        return;
      }
      const nextMedia = mediaRead.data ?? [];
      const nextLogs = logsRead.data ?? [];
      mediaRef.current = nextMedia;
      logsRef.current = nextLogs;
      setMediaList(nextMedia);
      setProgressLogs(nextLogs);
    };
    window.addEventListener("media-tracker:local-library-changed", reload);
    return () => window.removeEventListener("media-tracker:local-library-changed", reload);
  }, [hydratedScopeKey, scope]);

  useEffect(() => {
    if (
      !userId
      || libraryIntegrity !== "valid"
      || datasetOrigin === "demo"
      || hydratedScopeKey !== scopeKey
    ) return;
    void flushXpOutbox(userId, sendXpOutboxBatch);
    const flush = () => { void flushXpOutbox(userId, sendXpOutboxBatch); };
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [datasetOrigin, hydratedScopeKey, libraryIntegrity, scopeKey, userId]);

  useEffect(() => {
    if (
      !userId
      || libraryIntegrity !== "valid"
      || datasetOrigin === "demo"
      || hydratedScopeKey !== scopeKey
    ) return;
    let active = true;
    fetch("/api/social/preferences", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("social_preferences_unavailable");
        return response.json() as Promise<SocialPreferences>;
      })
      .then((preferences) => {
        if (!active) return;
        cacheSocialActivityPreferences(
          userId,
          preferences.configured,
          preferences.activity ?? DEFAULT_ACTIVITY_PREFERENCES,
        );
        return flushSocialOutbox(userId, sendSocialOutboxItem);
      })
      .catch(() => undefined);
    const flush = () => { void flushSocialOutbox(userId, sendSocialOutboxItem); };
    window.addEventListener("online", flush);
    return () => {
      active = false;
      window.removeEventListener("online", flush);
    };
  }, [datasetOrigin, hydratedScopeKey, libraryIntegrity, scopeKey, userId]);

  const queueSocialMutation = useCallback((previous: MediaItem | undefined, next: MediaItem) => {
    if (!userId) return;
    queueMediaSocialEvents(previous, next, userId);
    const link = loadRecommendationLinks(userId).find((item) => item.localMediaId === next.id);
    if (link) {
      const started = next.status === "watching" || next.status === "reading" || next.currentProgress > 0;
      const wasStarted = previous
        && (previous.status === "watching" || previous.status === "reading" || previous.currentProgress > 0);
      if (previous && !wasStarted && started) {
        queueRecommendationProgress(link.recommendationId, "started", userId);
      }
      if (previous?.status !== "completed" && next.status === "completed") {
        queueRecommendationProgress(link.recommendationId, "completed", userId);
      }
    }
    void flushSocialOutbox(userId, sendSocialOutboxItem);
  }, [userId]);

  const queueXpMutation = useCallback((next: MediaItem, deleted = false, flush = true) => {
    if (!userId) return;
    try {
      queueXpMediaState(next, userId, deleted);
      if (flush) void flushXpOutbox(userId, sendXpOutboxBatch);
    } catch {
      // XP outbox hatası doğrulanmış local mutation'ı geri almamalı.
    }
  }, [userId]);

  const buildAddedLogDetail = useCallback((item: MediaItem) => {
    const details = ["Kütüphaneye eklendi"];
    if (item.status !== "planning") details.push(`Durum: ${getStatusLabel(item.status)}`);
    if (item.currentProgress > 0 || item.status === "completed") {
      details.push(
        `İlerleme: ${item.currentProgress}/${item.totalProgress} ${getProgressLabel(item.type)}`,
      );
    }
    return details.join(" • ");
  }, []);

  const incrementMedia = useCallback((id: string) => {
    const currentMedia = mediaRef.current;
    const item = currentMedia.find((candidate) => candidate.id === id);
    if (!item || isMovieLike(item)) return;
    const amount = getIncrementAmount(item.type);
    if (amount === 0) return;
    const hasKnownTotal = item.totalProgress > 0;
    if (hasKnownTotal && item.currentProgress >= item.totalProgress) return;

    const newProgress = hasKnownTotal
      ? Math.min(item.currentProgress + amount, item.totalProgress)
      : item.currentProgress + amount;
    const updated: MediaItem = {
      ...item,
      currentProgress: newProgress,
      status: hasKnownTotal && newProgress >= item.totalProgress ? "completed" : item.status,
    };
    const nextMedia = currentMedia.map((candidate) => candidate.id === id ? updated : candidate);
    const logChange = appendProgressLog(logsRef.current, {
      mediaId: item.id,
      mediaTitle: item.title,
      mediaType: item.type,
      action: "increment",
      amount,
      previousProgress: item.currentProgress,
      newProgress,
    });
    if (!applyPersistedSnapshot(nextMedia, logChange.logs).ok) return;
    enqueueMediaUpsert(updated);
    enqueueProgressLog(logChange.persistedLog);
    queueSocialMutation(item, updated);
    queueXpMutation(updated);
  }, [applyPersistedSnapshot, queueSocialMutation, queueXpMutation]);

  const completeMedia = useCallback((id: string) => {
    const currentMedia = mediaRef.current;
    const item = currentMedia.find((candidate) => candidate.id === id);
    if (!item || item.status === "completed") return;
    const newProgress = item.totalProgress > 0 ? item.totalProgress : Math.max(item.currentProgress, 0);
    const updated: MediaItem = { ...item, currentProgress: newProgress, status: "completed" };
    const nextMedia = currentMedia.map((candidate) => candidate.id === id ? updated : candidate);
    const shouldLog = item.currentProgress < item.totalProgress;
    const logChange = shouldLog
      ? appendProgressLog(logsRef.current, {
          mediaId: item.id,
          mediaTitle: item.title,
          mediaType: item.type,
          action: "complete",
          amount: newProgress - item.currentProgress,
          previousProgress: item.currentProgress,
          newProgress,
        })
      : null;
    if (!applyPersistedSnapshot(nextMedia, logChange?.logs ?? logsRef.current).ok) return;
    enqueueMediaUpsert(updated);
    if (logChange) enqueueProgressLog(logChange.persistedLog);
    queueSocialMutation(item, updated);
    queueXpMutation(updated);
  }, [applyPersistedSnapshot, queueSocialMutation, queueXpMutation]);

  const saveMedia = useCallback((item: MediaItem) => {
    const currentMedia = mediaRef.current;
    const classified = withMediaClassification(withInferredSeriesGroup(item));
    const existing = currentMedia.find((candidate) => candidate.id === classified.id);
    const stored = existing
      ? withMediaClassification({ ...existing, ...classified })
      : classified;
    const nextMedia = existing
      ? currentMedia.map((candidate) => candidate.id === classified.id ? stored : candidate)
      : [...currentMedia, stored];

    let logChange: ReturnType<typeof appendProgressLog> | null = null;
    if (existing && existing.currentProgress !== classified.currentProgress) {
      logChange = appendProgressLog(logsRef.current, {
        mediaId: classified.id,
        mediaTitle: classified.title,
        mediaType: classified.type,
        action: "manual_adjust",
        amount: Math.abs(classified.currentProgress - existing.currentProgress),
        previousProgress: existing.currentProgress,
        newProgress: classified.currentProgress,
      });
    } else if (!existing) {
      logChange = appendProgressLog(logsRef.current, {
        mediaId: classified.id,
        mediaTitle: classified.title,
        mediaType: classified.type,
        action: "added",
        amount: classified.currentProgress,
        previousProgress: 0,
        newProgress: classified.currentProgress,
        detail: buildAddedLogDetail(classified),
      });
    }

    if (!applyPersistedSnapshot(nextMedia, logChange?.logs ?? logsRef.current).ok) return;
    enqueueMediaUpsert(stored);
    if (logChange) enqueueProgressLog(logChange.persistedLog);
    queueSocialMutation(existing, stored);
    queueXpMutation(stored);
  }, [
    applyPersistedSnapshot,
    buildAddedLogDetail,
    queueSocialMutation,
    queueXpMutation,
  ]);

  const deleteMedia = useCallback((id: string) => {
    const currentMedia = mediaRef.current;
    const item = currentMedia.find((candidate) => candidate.id === id);
    const nextMedia = currentMedia.filter((candidate) => candidate.id !== id);
    if (!applyPersistedSnapshot(nextMedia, logsRef.current).ok) return;
    enqueueMediaDelete(id);
    if (item) queueXpMutation(item, true);
  }, [applyPersistedSnapshot, queueXpMutation]);

  const toggleFavorite = useCallback((id: string) => {
    const currentMedia = mediaRef.current;
    const current = currentMedia.find((item) => item.id === id);
    if (!current) return;
    const updated = { ...current, favorite: !current.favorite };
    const nextMedia = currentMedia.map((item) => item.id === id ? updated : item);
    if (!applyPersistedSnapshot(nextMedia, logsRef.current).ok) return;
    enqueueMediaUpsert(updated);
    queueSocialMutation(current, updated);
    queueXpMutation(updated);
  }, [applyPersistedSnapshot, queueSocialMutation, queueXpMutation]);

  const updateRating = useCallback((id: string, rating: number | null) => {
    if (rating !== null && (!Number.isInteger(rating) || rating < 0 || rating > 10)) return;
    const currentMedia = mediaRef.current;
    const current = currentMedia.find((item) => item.id === id);
    if (!current || (current.userRating ?? null) === rating) return;
    const updated = { ...current, userRating: rating };
    const nextMedia = currentMedia.map((item) => item.id === id ? updated : item);
    if (!applyPersistedSnapshot(nextMedia, logsRef.current).ok) return;
    enqueueMediaUpsert(updated);
    queueSocialMutation(current, updated);
    queueXpMutation(updated);
  }, [applyPersistedSnapshot, queueSocialMutation, queueXpMutation]);

  const commitMediaChanges = useCallback((next: MediaItem[], changed: MediaItem[] = []) => {
    const currentMedia = mediaRef.current;
    if (!applyPersistedSnapshot(next, logsRef.current).ok) return;
    const nextIds = new Set(next.map((item) => item.id));
    currentMedia
      .filter((item) => !nextIds.has(item.id))
      .forEach((item) => queueXpMutation(item, true, false));
    changed.forEach((item) => {
      enqueueMediaUpsert(item);
      queueXpMutation(item, false, false);
    });
    if (userId) void flushXpOutbox(userId, sendXpOutboxBatch);
  }, [applyPersistedSnapshot, queueXpMutation, userId]);

  const importMedia = useCallback((items: MediaItem[], logs: ProgressLog[]) => {
    const decodedMedia = decodeMediaItems(items);
    const decodedLogs = decodeProgressLogs(logs);
    if (!decodedMedia.ok || !decodedLogs.ok) {
      setStorageError(
        `İçe aktarılan veriler runtime doğrulamasını geçemedi (${decodedMedia.issues.length + decodedLogs.issues.length} sorun).`,
      );
      return false;
    }
    const currentMedia = mediaRef.current;
    if (!applyPersistedSnapshot(decodedMedia.records, decodedLogs.records).ok) return false;
    const nextIds = new Set(decodedMedia.records.map((item) => item.id));
    currentMedia
      .filter((item) => !nextIds.has(item.id))
      .forEach((item) => queueXpMutation(item, true, false));
    decodedMedia.records.forEach((item) => queueXpMutation(item, false, false));
    if (userId) void flushXpOutbox(userId, sendXpOutboxBatch);
    return true;
  }, [applyPersistedSnapshot, queueXpMutation, userId]);

  const resetMedia = useCallback(() => {
    const currentMedia = mediaRef.current;
    if (!applyPersistedSnapshot(mockMediaList, logsRef.current).ok) return;
    currentMedia.forEach((item) => queueXpMutation(item, true, false));
    mockMediaList.forEach((item) => queueXpMutation(item, false, false));
    if (userId) void flushXpOutbox(userId, sendXpOutboxBatch);
  }, [applyPersistedSnapshot, queueXpMutation, userId]);

  const finishOwnershipAction = useCallback((result: OwnershipActionResult) => {
    if (!result.ok) {
      setStorageError(result.message);
      return false;
    }
    if (result.syncPlan && scope?.kind === "user") {
      setSyncOwnerScope(scope);
      enqueueOwnedSnapshotSyncPlan(
        scope,
        result.syncPlan.mediaItems,
        result.syncPlan.progressLogs,
      );
    }
    setOwnershipCandidate(null);
    setDeferredOwnershipCandidate(null);
    setStorageError(null);
    setHydrationNonce((value) => value + 1);
    return true;
  }, [scope]);

  const assignLegacyToCurrentUser = useCallback(() => {
    if (!scope || !ownershipCandidate) return false;
    return finishOwnershipAction(assignUnscopedLibraryToUser(
      scope,
      ownershipCandidate.sourceFingerprint,
    ));
  }, [finishOwnershipAction, ownershipCandidate, scope]);

  const keepLegacyAsGuest = useCallback(() => {
    if (!scope || !ownershipCandidate) return false;
    return finishOwnershipAction(keepUnscopedLibraryAsGuest(
      scope,
      ownershipCandidate.sourceFingerprint,
    ));
  }, [finishOwnershipAction, ownershipCandidate, scope]);

  const deferLegacyOwnership = useCallback(() => {
    if (!scope || !ownershipCandidate) return false;
    return finishOwnershipAction(deferUnscopedOwnership(scope, ownershipCandidate));
  }, [finishOwnershipAction, ownershipCandidate, scope]);

  const keepCurrentUserLibrary = useCallback(() => {
    if (!scope || !ownershipCandidate) return false;
    return finishOwnershipAction(keepExistingUserLibrary(scope, ownershipCandidate));
  }, [finishOwnershipAction, ownershipCandidate, scope]);

  const reopenDeferredOwnership = useCallback(() => {
    if (!deferredOwnershipCandidate) return;
    setOwnershipCandidate({ ...deferredOwnershipCandidate, deferred: false });
  }, [deferredOwnershipCandidate]);

  const scopeReady = isHydratedOwnerVisible(scopeKey, hydratedScopeKey);

  return {
    mediaList: scopeReady ? mediaList : [],
    progressLogs: scopeReady ? progressLogs : [],
    isLoaded: scopeReady && isLoaded,
    libraryIntegrity,
    datasetOrigin,
    ownerScope: scope,
    storageError,
    storageReadStatuses,
    ownershipCandidate,
    deferredOwnershipCandidate,
    assignLegacyToCurrentUser,
    keepLegacyAsGuest,
    deferLegacyOwnership,
    keepCurrentUserLibrary,
    reopenDeferredOwnership,
    incrementMedia,
    completeMedia,
    saveMedia,
    deleteMedia,
    toggleFavorite,
    updateRating,
    commitMediaChanges,
    importMedia,
    resetMedia,
  };
}
