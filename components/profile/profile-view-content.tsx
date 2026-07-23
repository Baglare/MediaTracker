"use client";

import { useEffect, useMemo, useState } from "react";

import MediaDetailModal from "@/components/media-detail-modal";
import { ProfileActivity } from "@/components/profile/profile-activity";
import { ProfileFavorites } from "@/components/profile/profile-favorites";
import { ProfileProgressionSummary } from "@/components/profile/profile-progression-summary";
import { LoadingState } from "@/components/ui/loading-state";
import { useMediaLibrary } from "@/hooks/use-media-library";
import { calculateUserProgression, type UserProgression } from "@/lib/user-progression";

export function ProfileViewContent({ userId, remoteProgression, onLocalProgression }: {
  userId: string | null;
  remoteProgression?: UserProgression;
  onLocalProgression?: (progression: UserProgression) => void;
}) {
  const { mediaList, progressLogs, isLoaded, toggleFavorite, incrementMedia, completeMedia, updateRating } = useMediaLibrary(userId);
  const [detailId, setDetailId] = useState<string | null>(null);
  const localProgression = useMemo(() => calculateUserProgression(mediaList, progressLogs), [mediaList, progressLogs]);
  const progression = remoteProgression ?? localProgression;

  useEffect(() => {
    if (isLoaded) onLocalProgression?.(localProgression);
  }, [isLoaded, localProgression, onLocalProgression]);

  if (!isLoaded) {
    return <div className="grid gap-5 xl:grid-cols-2"><LoadingState label="Favori vitrini yükleniyor…" rows={4}/><LoadingState label="Aktiviteler yükleniyor…" rows={4}/></div>;
  }

  const detail = mediaList.find((item) => item.id === detailId) ?? null;
  return (
    <>
      <div className="grid gap-5 xl:grid-cols-2"><ProfileFavorites items={mediaList} onOpen={(item) => setDetailId(item.id)} /><ProfileActivity logs={progressLogs} /></div>
      <ProfileProgressionSummary progression={progression} />
      <MediaDetailModal media={detail} progressLogs={progressLogs.filter((log) => log.mediaId === detailId)} open={Boolean(detail)} onClose={() => setDetailId(null)} onEdit={() => undefined} onDelete={() => undefined} onToggleFavorite={toggleFavorite} onIncrementProgress={incrementMedia} onComplete={completeMedia} onUpdateRating={updateRating} />
    </>
  );
}
