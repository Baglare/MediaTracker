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

type ProgressAction = "increment" | "complete" | "manual_adjust" | "added";

export function useMediaLibrary(userId: string | null) {
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [progressLogs, setProgressLogs] = useState<ProgressLog[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setSyncUserId(userId);
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
    addProgressLog({
      mediaId: item.id,
      mediaTitle: item.title,
      mediaType: item.type,
      action: "increment",
      amount,
      previousProgress: item.currentProgress,
      newProgress,
    });
  }, [addProgressLog, mediaList]);

  const completeMedia = useCallback((id: string) => {
    const item = mediaList.find((candidate) => candidate.id === id);
    if (!item || item.status === "completed") return;
    const newProgress = item.totalProgress > 0 ? item.totalProgress : Math.max(item.currentProgress, 0);
    const updated: MediaItem = { ...item, currentProgress: newProgress, status: "completed" };
    setMediaList((previous) => previous.map((candidate) => candidate.id === id ? updated : candidate));
    enqueueMediaUpsert(updated);
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
  }, [addProgressLog, mediaList]);

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
  }, [addProgressLog, buildAddedLogDetail, mediaList]);

  const deleteMedia = useCallback((id: string) => {
    setMediaList((previous) => previous.filter((item) => item.id !== id));
    enqueueMediaDelete(id);
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    const current = mediaList.find((item) => item.id === id);
    if (!current) return;
    const updated = { ...current, favorite: !current.favorite };
    setMediaList((previous) => previous.map((item) => item.id === id ? updated : item));
    enqueueMediaUpsert(updated);
  }, [mediaList]);

  const updateRating = useCallback((id: string, rating: number | null) => {
    if (rating !== null && (!Number.isInteger(rating) || rating < 0 || rating > 10)) return;
    const current = mediaList.find((item) => item.id === id);
    if (!current || (current.userRating ?? null) === rating) return;
    const updated = { ...current, userRating: rating };
    setMediaList((previous) => previous.map((item) => item.id === id ? updated : item));
    enqueueMediaUpsert(updated);
  }, [mediaList]);

  const commitMediaChanges = useCallback((next: MediaItem[], changed: MediaItem[] = []) => {
    setMediaList(next);
    changed.forEach(enqueueMediaUpsert);
  }, []);

  const importMedia = useCallback((items: MediaItem[], logs: ProgressLog[]) => {
    setMediaList(items.map((item) => withMediaClassification(item)));
    setProgressLogs(logs);
  }, []);

  const resetMedia = useCallback(() => {
    clearMediaList();
    setMediaList(mockMediaList);
  }, []);

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
