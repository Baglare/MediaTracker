"use client";

// ============================================
// useSyncStatus — sync-manager snapshot subscription
// ============================================

import { useSyncExternalStore } from "react";
import {
  getServerSnapshot,
  getSnapshot,
  subscribe,
  type SyncSnapshot,
} from "@/lib/sync-manager";
import {
  getGoalCloudSyncSnapshot,
  subscribeGoalCloudSync,
  type GoalCloudSyncSnapshot,
} from "@/features/goals/cloud/manager";

const GOAL_SERVER_SNAPSHOT: GoalCloudSyncSnapshot = {
  ownerKey: null, enabled: false, status: "disabled", pending: 0,
  retryable: 0, blocked: 0, permanent: 0, syncing: false, message: null,
};

export function useSyncStatus(): SyncSnapshot & { goal: GoalCloudSyncSnapshot } {
  const media = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const goal = useSyncExternalStore(subscribeGoalCloudSync, getGoalCloudSyncSnapshot, () => GOAL_SERVER_SNAPSHOT);
  return { ...media, goal };
}
