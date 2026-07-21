export const NOTIFICATIONS_CHANGED_EVENT = "media-tracker:notifications-changed";

export type NotificationChangeReason = "new" | "read" | "read_all" | "entity_viewed" | "refresh";

export interface NotificationChangeDetail {
  unreadCount?: number;
  delta?: number;
  reason: NotificationChangeReason;
}

export function applyNotificationCount(current: number, detail: NotificationChangeDetail): number | undefined {
  if (typeof detail.unreadCount === "number" && Number.isFinite(detail.unreadCount)) return Math.max(0, Math.trunc(detail.unreadCount));
  if (typeof detail.delta === "number" && Number.isFinite(detail.delta)) return Math.max(0, current + Math.trunc(detail.delta));
  return undefined;
}

export function publishNotificationChange(detail: NotificationChangeDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<NotificationChangeDetail>(NOTIFICATIONS_CHANGED_EVENT, { detail }));
}

export function subscribeNotificationChanges(listener: (detail: NotificationChangeDetail) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => listener((event as CustomEvent<NotificationChangeDetail>).detail);
  window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handler);
}

export async function markNotificationEntityViewed(entityType: "activity" | "comment" | "recommendation" | "profile", entityId: string): Promise<void> {
  try {
    const response = await fetch("/api/social/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_entity_read", entityType, entityId }),
    });
    const data = await response.json() as { unreadCount?: number };
    if (!response.ok) throw new Error("notification_mark_failed");
    publishNotificationChange({ unreadCount: data.unreadCount, reason: "entity_viewed" });
  } catch {
    publishNotificationChange({ reason: "refresh" });
  }
}
