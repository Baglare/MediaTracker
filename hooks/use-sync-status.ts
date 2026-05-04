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

export function useSyncStatus(): SyncSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
