"use client";

import { useCallback, useEffect, useState } from "react";
import { mockMediaList } from "@/lib/mock-media";
import {
  clearMediaList,
  loadMediaList,
  loadProgressLogs,
  saveMediaList,
  saveProgressLogs,
} from "@/lib/storage";
import {
  enqueueMediaDelete,
  enqueueMediaUpsert,
  enqueueProgressLog,
  setUserId as setSyncUserId,
} from "@/lib/sync-manager";
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

export function useMediaLibrary(userId: string | null) {
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [progressLogs, setProgressLogs] = useState<ProgressLog[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setSyncUserId(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void flushXpOutbox(userId, sendXpOutboxBatch);
    const flush = () => { void flushXpOutbox(userId, sendXpOutboxBatch); };
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetch("/api/social/preferences", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("social_preferences_unavailable");
        return response.json() as Promise<SocialPreferences>;
      })
      .then((preferences) => {
        if (!active) return;
        cacheSocialActivityPreferences(userId, preferences.configured, preferences.activity ?? DEFAULT_ACTIVITY_PREFERENCES);
        return flushSocialOutbox(userId, sendSocialOutboxItem);
      })
      .catch(() => undefined);
    const flush = () => { void flushSocialOutbox(userId, sendSocialOutboxItem); };
    window.addEventListener("online", flush);
    return () => { active = false; window.removeEventListener("online", flush); };
  }, [userId]);

  useEffect(() => {
    const saved = loadMediaList();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only localStorage hydration
    setMediaList(saved && saved.length > 0 ? saved : mockMediaList);
    setProgressLogs(loadProgressLogs());
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    saveMediaList(mediaList);
    saveProgressLogs(progressLogs);
  }, [isLoaded, mediaList, progressLogs]);

  const addProgressLog = useCallback((args: {
    mediaId: string;
    mediaTitle: string;
    mediaType: MediaType;
    action: ProgressAction;
    amount: number;
    previousProgress: number;
    newProgress: number;
    detail?: string;
  }) => {
    const nowIso = new Date().toISOString();
    const newLog: ProgressLog = {
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
    let mergedLog: ProgressLog | null = null;
    if (mergeable) {
      const last = [...progressLogs].reverse().find((log) => log.mediaId === args.mediaId);
      const canMerge =
        last &&
        last.action === args.action &&
        last.newProgress === args.previousProgress &&
        Date.now() - new Date(last.createdAt).getTime() < 60 * 60 * 1000;
      if (canMerge && last) {
        mergedLog = {
          ...last,
          amount: last.amount + args.amount,
          newProgress: args.newProgress,
          createdAt: nowIso,
          detail: args.detail ?? last.detail,
        };
      }
    }

    if (mergedLog) {
      const finalLog = mergedLog;
      setProgressLogs((previous) => {
        const index = previous.findIndex((log) => log.id === finalLog.id);
        if (index < 0) return [...previous, finalLog];
        const next = previous.slice();
        next[index] = finalLog;
        return next;
      });
      enqueueProgressLog(finalLog);
      return;
    }

    setProgressLogs((previous) => [...previous, newLog]);
    enqueueProgressLog(newLog);
  }, [progressLogs]);

  const queueSocialMutation = useCallback((previous: MediaItem | undefined, next: MediaItem) => {
    if (!userId) return;
    queueMediaSocialEvents(previous, next, userId);
    const link = loadRecommendationLinks(userId).find((item) => item.localMediaId === next.id);
    if (link) {
      const started = next.status === "watching" || next.status === "reading" || next.currentProgress > 0;
      if (previous && !((previous.status === "watching" || previous.status === "reading") || previous.currentProgress > 0) && started) queueRecommendationProgress(link.recommendationId, "started", userId);
      if (previous?.status !== "completed" && next.status === "completed") queueRecommendationProgress(link.recommendationId, "completed", userId);
    }
    void flushSocialOutbox(userId, sendSocialOutboxItem);
  }, [userId]);

  const queueXpMutation = useCallback((next: MediaItem, deleted = false, flush = true) => {
    if (!userId) return;
    try {
      queueXpMediaState(next, userId, deleted);
      if (flush) void flushXpOutbox(userId, sendXpOutboxBatch);
    } catch {
      // XP kuyruğu local-first medya mutasyonunu hiçbir zaman geri almamalı.
    }
  }, [userId]);

  const buildAddedLogDetail = useCallback((item: MediaItem) => {
    const details = ["Kütüphaneye eklendi"];
    if (item.status !== "planning") details.push(`Durum: ${getStatusLabel(item.status)}`);
    if (item.currentProgress > 0 || item.status === "completed") {
      details.push(
        `İlerleme: ${item.currentProgress}/${item.totalProgress} ${getProgressLabel(item.type)}`
      );
    }
    return details.join(" • ");
  }, []);

  const incrementMedia = useCallback((id: string) => {
    const item = mediaList.find((candidate) => candidate.id === id);
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
    setMediaList((previous) => previous.map((candidate) => candidate.id === id ? updated : candidate));
    enqueueMediaUpsert(updated);
    queueSocialMutation(item, updated);
    queueXpMutation(updated);
    addProgressLog({
      mediaId: item.id,
      mediaTitle: item.title,
      mediaType: item.type,
      action: "increment",
      amount,
      previousProgress: item.currentProgress,
      newProgress,
    });
  }, [addProgressLog, mediaList, queueSocialMutation, queueXpMutation]);

  const completeMedia = useCallback((id: string) => {
    const item = mediaList.find((candidate) => candidate.id === id);
    if (!item || item.status === "completed") return;
    const newProgress = item.totalProgress > 0 ? item.totalProgress : Math.max(item.currentProgress, 0);
    const updated: MediaItem = { ...item, currentProgress: newProgress, status: "completed" };
    setMediaList((previous) => previous.map((candidate) => candidate.id === id ? updated : candidate));
    enqueueMediaUpsert(updated);
    queueSocialMutation(item, updated);
    queueXpMutation(updated);
    if (item.currentProgress >= item.totalProgress) return;
    addProgressLog({
      mediaId: item.id,
      mediaTitle: item.title,
      mediaType: item.type,
      action: "complete",
      amount: newProgress - item.currentProgress,
      previousProgress: item.currentProgress,
      newProgress,
    });
  }, [addProgressLog, mediaList, queueSocialMutation, queueXpMutation]);

  const saveMedia = useCallback((item: MediaItem) => {
    const classified = withMediaClassification(withInferredSeriesGroup(item));
    const existing = mediaList.find((candidate) => candidate.id === classified.id);
    const stored = existing
      ? withMediaClassification({ ...existing, ...classified })
      : classified;
    setMediaList((previous) => existing
      ? previous.map((candidate) => candidate.id === classified.id ? stored : candidate)
      : [...previous, stored]
    );
    enqueueMediaUpsert(stored);
    queueSocialMutation(existing, stored);
    queueXpMutation(stored);

    if (existing && existing.currentProgress !== classified.currentProgress) {
      addProgressLog({
        mediaId: classified.id,
        mediaTitle: classified.title,
        mediaType: classified.type,
        action: "manual_adjust",
        amount: Math.abs(classified.currentProgress - existing.currentProgress),
        previousProgress: existing.currentProgress,
        newProgress: classified.currentProgress,
      });
    } else if (!existing) {
      addProgressLog({
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
  }, [addProgressLog, buildAddedLogDetail, mediaList, queueSocialMutation, queueXpMutation]);

  const deleteMedia = useCallback((id: string) => {
    const item = mediaList.find((candidate) => candidate.id === id);
    setMediaList((previous) => previous.filter((item) => item.id !== id));
    enqueueMediaDelete(id);
    if (item) queueXpMutation(item, true);
  }, [mediaList, queueXpMutation]);

  const toggleFavorite = useCallback((id: string) => {
    const current = mediaList.find((item) => item.id === id);
    if (!current) return;
    const updated = { ...current, favorite: !current.favorite };
    setMediaList((previous) => previous.map((item) => item.id === id ? updated : item));
    enqueueMediaUpsert(updated);
    queueSocialMutation(current, updated);
    queueXpMutation(updated);
  }, [mediaList, queueSocialMutation, queueXpMutation]);

  const updateRating = useCallback((id: string, rating: number | null) => {
    if (rating !== null && (!Number.isInteger(rating) || rating < 0 || rating > 10)) return;
    const current = mediaList.find((item) => item.id === id);
    if (!current || (current.userRating ?? null) === rating) return;
    const updated = { ...current, userRating: rating };
    setMediaList((previous) => previous.map((item) => item.id === id ? updated : item));
    enqueueMediaUpsert(updated);
    queueSocialMutation(current, updated);
    queueXpMutation(updated);
  }, [mediaList, queueSocialMutation, queueXpMutation]);

  const commitMediaChanges = useCallback((next: MediaItem[], changed: MediaItem[] = []) => {
    setMediaList(next);
    const nextIds = new Set(next.map((item) => item.id));
    mediaList.filter((item) => !nextIds.has(item.id)).forEach((item) => queueXpMutation(item, true, false));
    changed.forEach((item) => { enqueueMediaUpsert(item); queueXpMutation(item, false, false); });
    if (userId) void flushXpOutbox(userId, sendXpOutboxBatch);
  }, [mediaList, queueXpMutation, userId]);

  const importMedia = useCallback((items: MediaItem[], logs: ProgressLog[]) => {
    const classified = items.map((item) => withMediaClassification(item));
    const nextIds = new Set(classified.map((item) => item.id));
    mediaList.filter((item) => !nextIds.has(item.id)).forEach((item) => queueXpMutation(item, true, false));
    classified.forEach((item) => queueXpMutation(item, false, false));
    if (userId) void flushXpOutbox(userId, sendXpOutboxBatch);
    setMediaList(classified);
    setProgressLogs(logs);
  }, [mediaList, queueXpMutation, userId]);

  const resetMedia = useCallback(() => {
    clearMediaList();
    mediaList.forEach((item) => queueXpMutation(item, true, false));
    mockMediaList.forEach((item) => queueXpMutation(item, false, false));
    if (userId) void flushXpOutbox(userId, sendXpOutboxBatch);
    setMediaList(mockMediaList);
  }, [mediaList, queueXpMutation, userId]);

  return {
    mediaList,
    progressLogs,
    isLoaded,
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
