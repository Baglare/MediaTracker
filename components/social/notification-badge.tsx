"use client";

import { useSyncExternalStore } from "react";

import { applyNotificationCount, subscribeNotificationChanges } from "@/lib/social/notification-sync";

type Listener = () => void;

const listeners = new Set<Listener>();
let count = 0;
let inFlight: Promise<void> | null = null;
let stopSharedListeners: (() => void) | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function refreshShared(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = fetch("/api/social/notifications?limit=1", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((data: unknown) => {
      if (!data || typeof data !== "object" || !("unreadCount" in data) || typeof data.unreadCount !== "number") return;
      if (count !== data.unreadCount) {
        count = data.unreadCount;
        emit();
      }
    })
    .catch(() => undefined)
    .finally(() => { inFlight = null; });
  return inFlight;
}

function startSharedListeners() {
  if (stopSharedListeners) return;
  void refreshShared();
  const unsubscribe = subscribeNotificationChanges((detail) => {
    const next = applyNotificationCount(count, detail);
    if (next === undefined) {
      void refreshShared();
    } else if (next !== count) {
      count = next;
      emit();
    }
  });
  const timer = window.setInterval(() => { void refreshShared(); }, 60_000);
  const onFocus = () => { void refreshShared(); };
  window.addEventListener("focus", onFocus);
  stopSharedListeners = () => {
    unsubscribe();
    window.clearInterval(timer);
    window.removeEventListener("focus", onFocus);
    stopSharedListeners = null;
  };
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  startSharedListeners();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopSharedListeners?.();
  };
}

function getSnapshot() {
  return count;
}

function getServerSnapshot() {
  return 0;
}

export function NotificationBadge() {
  const unreadCount = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (unreadCount < 1) return null;
  return <span className="min-w-5 rounded-full bg-violet-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white" aria-label={`${unreadCount} okunmamış bildirim`}>{unreadCount > 99 ? "99+" : unreadCount}</span>;
}
