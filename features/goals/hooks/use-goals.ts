"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  archiveGoal,
  cancelGoal,
  createGoal,
  createGoalFromApprovedSuggestion,
  deleteGoal,
  reactivateGoal,
  updateGoal,
  type CreateGoalInput,
  type UpdateGoalPatch,
} from "@/features/goals/data/goal-repository";
import { readGoalStore, subscribeGoalStore } from "@/features/goals/data/goal-store";
import type { Goal, GoalSuggestion } from "@/features/goals/domain/types";
import {
  isCurrentOwnerGeneration,
  isHydratedOwnerVisible,
  resolveLocalOwnerScope,
} from "@/lib/local-owner-scope";
import type { MediaItem } from "@/lib/types";
import { setGoalCloudOwnerScope } from "@/features/goals/cloud/manager";

export function useGoals(userId: string | null | undefined, mediaItems: readonly MediaItem[]) {
  const ownerScope = useMemo(() => resolveLocalOwnerScope(userId), [userId]);
  const generation = useRef(0);
  const [snapshot, setSnapshot] = useState<{
    ownerKey: string | null;
    goals: Goal[];
    ready: boolean;
    error?: string;
  }>({ ownerKey: null, goals: [], ready: false });

  const refresh = useCallback(() => {
    if (!ownerScope) return;
    const currentGeneration = generation.current;
    queueMicrotask(() => {
      const result = readGoalStore(ownerScope);
      if (!isCurrentOwnerGeneration(currentGeneration, generation.current)) return;
      setSnapshot({
        ownerKey: ownerScope.key,
        goals: result.status === "error" ? [] : result.data.goals,
        ready: true,
        ...(result.status === "error" ? { error: result.message } : {}),
      });
    });
  }, [ownerScope]);

  useEffect(() => {
    generation.current += 1;
    if (!ownerScope) return;
    refresh();
    return subscribeGoalStore(ownerScope, refresh);
  }, [ownerScope, refresh]);

  useEffect(() => {
    setGoalCloudOwnerScope(ownerScope);
    return () => setGoalCloudOwnerScope(null);
  }, [ownerScope]);

  const repositoryOptions = useMemo(() => ({ mediaItems }), [mediaItems]);
  const requireOwner = useCallback(() => {
    if (!ownerScope) throw new Error("goal_owner_pending");
    return ownerScope;
  }, [ownerScope]);

  const mutations = useMemo(() => ({
    create: (input: CreateGoalInput) => createGoal(requireOwner(), input, repositoryOptions),
    approveSuggestion: (suggestion: GoalSuggestion) => createGoalFromApprovedSuggestion(
      requireOwner(),
      suggestion,
      repositoryOptions,
    ),
    update: (id: string, patch: UpdateGoalPatch) => updateGoal(requireOwner(), id, patch, repositoryOptions),
    cancel: (id: string) => cancelGoal(requireOwner(), id, repositoryOptions),
    archive: (id: string) => archiveGoal(requireOwner(), id, repositoryOptions),
    reactivate: (id: string) => reactivateGoal(requireOwner(), id, repositoryOptions),
    delete: (id: string) => deleteGoal(requireOwner(), id, { confirmed: true }, repositoryOptions),
  }), [repositoryOptions, requireOwner]);

  const visible = isHydratedOwnerVisible(ownerScope?.key ?? null, snapshot.ownerKey);
  return {
    ownerScope,
    goals: visible ? snapshot.goals : [],
    ready: visible && snapshot.ready,
    error: visible ? snapshot.error : undefined,
    mutations,
  };
}
