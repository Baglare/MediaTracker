"use client";

import { useCallback, useMemo, useState } from "react";

import { applyManualGroupAction } from "@/features/library/domain/group-commands";
import type { ManualGroupAction } from "@/features/library/domain/group-types";
import type { MediaItem, ProgressLog } from "@/lib/types";

export interface QuickAddPayload {
  singleItem: MediaItem;
  seasonItems: MediaItem[] | null;
  lockedSeasonIds?: string[];
  preferredMode?: "single" | "seasons";
  forceSeasonSelection?: boolean;
}

export type MediaOverlayState =
  | { kind: "none" }
  | { kind: "add" }
  | { kind: "edit"; mediaId: string }
  | { kind: "detail"; mediaId: string }
  | { kind: "quick-add"; payload: QuickAddPayload }
  | { kind: "group"; mediaId: string }
  | {
      kind: "confirm";
      title: string;
      message: string;
      confirmLabel: string;
      onConfirm: () => void;
    };

interface LibraryMutationApi {
  saveMedia: (item: MediaItem) => void;
  deleteMedia: (id: string) => void;
  incrementMedia: (id: string) => void;
  completeMedia: (id: string) => void;
  toggleFavorite: (id: string) => void;
  updateRating: (id: string, rating: number | null) => void;
  commitMediaChanges: (next: MediaItem[], changed?: MediaItem[]) => void;
  resetMedia: () => void;
}

export function useMediaCommands({
  mediaList,
  progressLogs,
  mutations,
}: {
  mediaList: MediaItem[];
  progressLogs: ProgressLog[];
  mutations: LibraryMutationApi;
}) {
  const [overlay, setOverlay] = useState<MediaOverlayState>({ kind: "none" });

  const closeOverlay = useCallback(() => setOverlay({ kind: "none" }), []);
  const openAdd = useCallback(() => setOverlay({ kind: "add" }), []);
  const openEdit = useCallback((item: MediaItem) => setOverlay({ kind: "edit", mediaId: item.id }), []);
  const openDetail = useCallback((item: MediaItem) => setOverlay({ kind: "detail", mediaId: item.id }), []);
  const openGroup = useCallback((item: MediaItem) => setOverlay({ kind: "group", mediaId: item.id }), []);
  const openQuickAdd = useCallback((payload: QuickAddPayload) => setOverlay({ kind: "quick-add", payload }), []);

  const openConfirmation = useCallback((
    title: string,
    message: string,
    onConfirm: () => void,
    confirmLabel = "Onayla",
  ) => {
    setOverlay({
      kind: "confirm",
      title,
      message,
      confirmLabel,
      onConfirm: () => {
        onConfirm();
        setOverlay({ kind: "none" });
      },
    });
  }, []);

  const requestDelete = useCallback((id: string) => {
    const item = mediaList.find((candidate) => candidate.id === id);
    if (!item) return;
    openConfirmation(
      "Medyayı Sil",
      `"${item.title}" silinecek. Bu işlem geri alınamaz. Emin misin?`,
      () => mutations.deleteMedia(id),
      "Sil",
    );
  }, [mediaList, mutations, openConfirmation]);

  const requestReset = useCallback(() => {
    openConfirmation(
      "Verileri Sıfırla",
      "Tüm değişikliklerin silinecek ve varsayılan mock veriler yüklenecek. Emin misin?",
      mutations.resetMedia,
      "Sıfırla",
    );
  }, [mutations.resetMedia, openConfirmation]);

  const saveFromEditor = useCallback((item: MediaItem) => {
    mutations.saveMedia(item);
    closeOverlay();
  }, [closeOverlay, mutations]);

  const saveQuickAdd = useCallback((items: MediaItem[]) => {
    const existingIds = new Set(mediaList.map((item) => item.id));
    items.filter((item) => !existingIds.has(item.id)).forEach(mutations.saveMedia);
    closeOverlay();
  }, [closeOverlay, mediaList, mutations.saveMedia]);

  const commitGroup = useCallback((action: ManualGroupAction) => {
    const result = applyManualGroupAction(mediaList, action);
    mutations.commitMediaChanges(result.next, result.changed);
    closeOverlay();
  }, [closeOverlay, mediaList, mutations]);

  const selectedMedia = useMemo(() => {
    if (overlay.kind !== "edit" && overlay.kind !== "detail" && overlay.kind !== "group") return null;
    return mediaList.find((item) => item.id === overlay.mediaId) ?? null;
  }, [mediaList, overlay]);

  const selectedProgressLogs = useMemo(
    () => overlay.kind === "detail"
      ? progressLogs.filter((log) => log.mediaId === overlay.mediaId)
      : [],
    [overlay, progressLogs],
  );

  return {
    overlay,
    selectedMedia,
    selectedProgressLogs,
    closeOverlay,
    openAdd,
    openEdit,
    openDetail,
    openGroup,
    openQuickAdd,
    openConfirmation,
    requestDelete,
    requestReset,
    saveFromEditor,
    saveQuickAdd,
    commitGroup,
    mutations: {
      increment: mutations.incrementMedia,
      complete: mutations.completeMedia,
      toggleFavorite: mutations.toggleFavorite,
      updateRating: mutations.updateRating,
    },
  };
}

export type MediaCommands = ReturnType<typeof useMediaCommands>;
