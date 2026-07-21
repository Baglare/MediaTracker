"use client";

import { useCallback, useEffect, useState } from "react";
import { applyNotificationCount, subscribeNotificationChanges } from "@/lib/social/notification-sync";

export function NotificationBadge() {
  const [count, setCount] = useState(0);
  const refresh = useCallback(() => {
    fetch("/api/social/notifications?limit=1", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data: unknown) => { if (data && typeof data === "object" && "unreadCount" in data && typeof data.unreadCount === "number") setCount(data.unreadCount); })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeNotificationChanges((detail) => {
      let shouldRefresh = false;
      setCount((current) => { const next = applyNotificationCount(current, detail); shouldRefresh = next === undefined; return next ?? current; });
      if (shouldRefresh) refresh();
    });
    const timer = window.setInterval(refresh, 60_000);
    const focus = () => refresh();
    window.addEventListener("focus", focus);
    return () => { unsubscribe(); window.clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [refresh]);

  if (count < 1) return null;
  return <span className="min-w-5 rounded-full bg-violet-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white" aria-label={`${count} okunmamış bildirim`}>{count > 99 ? "99+" : count}</span>;
}
