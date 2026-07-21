"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ProfileAvatar } from "@/components/sidebar-profile-card";
import { notificationHref, type CursorPage, type SocialNotification } from "@/lib/social/interactions";
import { publishNotificationChange } from "@/lib/social/notification-sync";

const LABELS: Record<SocialNotification["type"], string> = {
  follow_request_received: "Takip isteği gönderdi", follow_request_accepted: "Takip isteğini kabul etti", new_follower: "Seni takip etmeye başladı",
  activity_comment: "Aktivitene yorum yaptı", comment_reply: "Yorumuna cevap verdi", activity_reaction: "Aktivitene tepki verdi", comment_reaction: "Yorumuna tepki verdi",
  recommendation_received: "Sana medya önerdi", recommendation_accepted: "Önerini kabul etti", recommendation_deferred: "Önerini sonraya bıraktı",
  recommendation_started: "Önerdiğin medyaya başladı", recommendation_completed: "Önerdiğin medyayı tamamladı", recommendation_withdrawn: "Önerisini geri çekti",
  recommendation_rejected: "Önerini reddetti", recommendation_message: "Öneri hakkında geri bildirim yazdı",
};

export function NotificationCenter() {
  const router = useRouter();
  const [items, setItems] = useState<SocialNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [nextCursor, setNextCursor] = useState<CursorPage<SocialNotification>["nextCursor"]>();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async (append = false, cursor?: CursorPage<SocialNotification>["nextCursor"]) => {
    await Promise.resolve(); setLoading(true);
    try {
      const params = new URLSearchParams(); if (append && cursor) { params.set("cursorCreatedAt", cursor.createdAt); params.set("cursorId", cursor.id); }
      const response = await fetch(`/api/social/notifications?${params}`, { cache: "no-store" });
      const data = await response.json() as CursorPage<SocialNotification> & { unreadCount: number; message?: string };
      if (!response.ok) throw new Error(data.message ?? "Bildirimler yüklenemedi.");
      setItems((current) => append ? [...current, ...data.items] : data.items); setUnread(data.unreadCount); setNextCursor(data.nextCursor); setMessage("");
      publishNotificationChange({ unreadCount: data.unreadCount, reason: "refresh" });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Bildirimler yüklenemedi."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const initial = window.setTimeout(() => void load(false), 0); const timer = window.setInterval(() => void load(false), 60_000); const focus = () => void load(false); window.addEventListener("focus", focus); return () => { window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener("focus", focus); }; }, [load]);

  async function mark(action: "read" | "read_all", notificationId?: string): Promise<boolean> {
    const previousItems = items; const previousUnread = unread;
    if (action === "read_all") { setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() }))); setUnread(0); publishNotificationChange({ unreadCount: 0, reason: "read_all" }); }
    else { setItems((current) => current.map((item) => item.id === notificationId ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item)); setUnread((current) => Math.max(0, current - 1)); publishNotificationChange({ delta: -1, reason: "read" }); }
    try {
      const response = await fetch("/api/social/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, notificationId }) });
      const result = await response.json() as { unreadCount?: number };
      if (!response.ok) throw new Error("notification_update_failed");
      publishNotificationChange({ unreadCount: result.unreadCount, reason: action === "read_all" ? "read_all" : "read" });
      return true;
    } catch {
      setItems(previousItems); setUnread(previousUnread); setMessage("Bildirim durumu güncellenemedi."); publishNotificationChange({ reason: "refresh" }); void load(false); return false;
    }
  }

  async function openNotification(item: SocialNotification) {
    if (!item.readAt) await mark("read", item.id);
    router.push(notificationHref(item));
  }

  return <div className="space-y-4"><div className="flex items-center justify-between"><p className="text-sm text-zinc-400">{unread} okunmamış bildirim</p>{unread > 0 && <button type="button" onClick={() => void mark("read_all")} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm">Tümünü okundu yap</button>}</div>{message && <p role="status" className="rounded-lg bg-zinc-900 p-3 text-sm text-zinc-400">{message}</p>}<div className="space-y-2">{items.map((item) => <Link key={item.id} href={notificationHref(item)} onClick={(event) => { event.preventDefault(); void openNotification(item); }} className={`flex items-center gap-3 rounded-xl border p-3 ${item.readAt ? "border-zinc-800 bg-zinc-900/40" : "border-violet-500/30 bg-violet-500/[0.07]"}`}><ProfileAvatar profileName={item.actor?.displayName ?? "MediaTracker"} socialAvatarUrl={item.actor?.avatarUrl} allowLocalFallback={false} size="social" shape="circle"/><div className="min-w-0 flex-1"><p className="text-sm"><strong>{item.actor?.displayName ?? "MediaTracker"}</strong> {LABELS[item.type]}</p>{typeof item.payload.title === "string" && <p className="truncate text-xs text-zinc-400">{item.payload.title}</p>}<p className="mt-1 text-xs text-zinc-600">{new Date(item.createdAt).toLocaleString("tr-TR")}</p></div>{!item.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-violet-400" aria-label="Okunmamış"/>}</Link>)}</div>{!loading && items.length === 0 && <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-zinc-500">Henüz bildirim yok.</div>}{loading && <p className="text-sm text-zinc-500">Bildirimler yükleniyor…</p>}{nextCursor && <button type="button" onClick={() => void load(true, nextCursor)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm">Daha fazla göster</button>}</div>;
}
