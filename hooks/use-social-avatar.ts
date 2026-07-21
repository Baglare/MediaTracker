"use client";

import { useCallback, useEffect, useState } from "react";

import type { SocialProfileEditorData } from "@/lib/social/types";

interface SocialAvatarSnapshot {
  userId: string;
  hasSocialProfile: boolean;
  socialAvatarUrl?: string;
  loading: boolean;
}

const EMPTY: SocialAvatarSnapshot = {
  userId: "",
  hasSocialProfile: false,
  loading: false,
};

async function fetchSocialAvatarSnapshot(userId: string): Promise<SocialAvatarSnapshot> {
  const response = await fetch("/api/social/profile", { cache: "no-store" });
  if (!response.ok) throw new Error("social_profile_unavailable");
  const data = await response.json() as SocialProfileEditorData;
  return {
    userId,
    hasSocialProfile: Boolean(data.profile),
    socialAvatarUrl: data.profile?.avatarUrl,
    loading: false,
  };
}

export function useSocialAvatar(configured: boolean, userId: string | null) {
  const [snapshot, setSnapshot] = useState<SocialAvatarSnapshot>(EMPTY);

  const refresh = useCallback(async () => {
    if (!configured || !userId) return;
    try {
      setSnapshot(await fetchSocialAvatarSnapshot(userId));
    } catch {
      setSnapshot((current) => current.userId === userId ? { ...current, loading: false } : {
        userId,
        hasSocialProfile: false,
        loading: false,
      });
    }
  }, [configured, userId]);

  useEffect(() => {
    if (!configured || !userId) return;
    let active = true;
    fetchSocialAvatarSnapshot(userId)
      .then((next) => { if (active) setSnapshot(next); })
      .catch(() => { /* Keep the last in-memory/local fallback when offline. */ });
    return () => { active = false; };
  }, [configured, userId]);

  const current = configured && userId && snapshot.userId === userId ? snapshot : {
    ...EMPTY,
    userId: userId ?? "",
    loading: Boolean(configured && userId),
  };

  const updateSocialAvatar = useCallback((socialAvatarUrl: string | undefined) => {
    if (!userId) return;
    setSnapshot((previous) => ({
      userId,
      hasSocialProfile: true,
      socialAvatarUrl,
      loading: previous.userId === userId && previous.loading,
    }));
  }, [userId]);

  return { ...current, refresh, updateSocialAvatar };
}
