"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/use-auth";

import { applyNotificationCount, subscribeNotificationChanges } from "@/lib/social/notification-sync";

type Listener = () => void;

const listeners = new Set<Listener>();
let count = 0;
let inFlight: Promise<void> | null = null;
let stopSharedListeners: (() => void) | null = null;
let activeOwner: string | null = null;
let generation = 0;

function emit() {
  listeners.forEach((listener) => listener());
}

function refreshShared(): Promise<void> {
  if (!activeOwner) return Promise.resolve();
  if (inFlight) return inFlight;
  const version = generation;
  const pending = fetch("/api/social/notifications?limit=1", { cache: "no-store" })
    .then((response) => response.ok ? response.json() : null)
    .then((data: unknown) => {
      if (version !== generation || !activeOwner) return;
      if (!data || typeof data !== "object" || !("unreadCount" in data) || typeof data.unreadCount !== "number") return;
      if (count !== data.unreadCount) {
        count = data.unreadCount;
        emit();
      }
    })
    .catch(() => undefined)
    .finally(() => { if (inFlight === pending) inFlight = null; });
  inFlight = pending;
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

function subscribe(ownerId: string | null, listener: Listener): () => void {
  if (!ownerId) return () => undefined;
  if (activeOwner !== ownerId) {
    stopSharedListeners?.();
    generation++;
    activeOwner = ownerId;
    count = 0;
    inFlight = null;
  }
  listeners.add(listener);
  startSharedListeners();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopSharedListeners?.();
      generation++;
      activeOwner = null;
      count = 0;
      inFlight = null;
    }
  };
}

function getServerSnapshot() {
  return 0;
}

export function NotificationBadge() {
  const { user, loading } = useAuth();
  const ownerId = !loading ? user?.id ?? null : null;
  const subscribeOwner = useCallback((listener: Listener) => subscribe(ownerId, listener), [ownerId]);
  const getSnapshot = useCallback(() => ownerId && ownerId === activeOwner ? count : 0, [ownerId]);
  const unreadCount = useSyncExternalStore(subscribeOwner, getSnapshot, getServerSnapshot);
  if (!ownerId || unreadCount < 1) return null;
  return <span className="min-w-5 rounded-full bg-violet-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white" aria-label={`${unreadCount} okunmamış bildirim`}>{unreadCount > 99 ? "99+" : unreadCount}</span>;
}
