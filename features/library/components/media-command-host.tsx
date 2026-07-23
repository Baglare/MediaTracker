"use client";

import dynamic from "next/dynamic";

import type { MediaCommands } from "@/features/library/hooks/use-media-commands";
import type { MediaItem } from "@/lib/types";

const MediaModal = dynamic(() => import("@/components/media-modal"));
const MediaDetailModal = dynamic(() => import("@/components/media-detail-modal"));
const ConfirmDialog = dynamic(() => import("@/components/confirm-dialog"));
const QuickAddModal = dynamic(() => import("@/components/quick-add-modal"));
const ManualGroupModal = dynamic(() => import("@/components/manual-group-modal"));

export function MediaCommandHost({
  commands,
  mediaList,
}: {
  commands: MediaCommands;
  mediaList: MediaItem[];
}) {
  const { overlay, selectedMedia } = commands;

  if (overlay.kind === "add" || overlay.kind === "edit") {
    return (
      <MediaModal
        isOpen
        editingItem={overlay.kind === "edit" ? selectedMedia : null}
        onSave={commands.saveFromEditor}
        onClose={commands.closeOverlay}
      />
    );
  }

  if (overlay.kind === "detail") {
    return (
      <MediaDetailModal
        media={selectedMedia}
        progressLogs={commands.selectedProgressLogs}
        open
        onClose={commands.closeOverlay}
        onEdit={commands.openEdit}
        onDelete={commands.requestDelete}
        onToggleFavorite={commands.mutations.toggleFavorite}
        onIncrementProgress={commands.mutations.increment}
        onComplete={commands.mutations.complete}
        onUpdateRating={commands.mutations.updateRating}
      />
    );
  }

  if (overlay.kind === "confirm") {
    return (
      <ConfirmDialog
        isOpen
        title={overlay.title}
        message={overlay.message}
        confirmLabel={overlay.confirmLabel}
        onConfirm={overlay.onConfirm}
        onCancel={commands.closeOverlay}
      />
    );
  }

  if (overlay.kind === "quick-add") {
    return (
      <QuickAddModal
        isOpen
        payload={overlay.payload}
        onSave={commands.saveQuickAdd}
        onClose={commands.closeOverlay}
      />
    );
  }

  if (overlay.kind === "group") {
    return (
      <ManualGroupModal
        isOpen
        item={selectedMedia}
        mediaList={mediaList}
        onSave={commands.commitGroup}
        onClose={commands.closeOverlay}
      />
    );
  }

  return null;
}
