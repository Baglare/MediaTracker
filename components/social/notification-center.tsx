"use client";

import { Bell, CheckCheck, Inbox } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ProfileAvatar } from "@/components/sidebar-profile-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { StatCard } from "@/components/ui/stat-card";
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

  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <StatCard label="Okunmamış" value={unread} supportingText="İlgini bekleyen bildirimler" tone={unread > 0 ? "accent" : "neutral"} icon={<Bell className="h-5 w-5" aria-hidden="true"/>}/>
      <StatCard label="Yüklenen bildirim" value={items.length} supportingText="Bu görünümdeki toplam" icon={<Inbox className="h-5 w-5" aria-hidden="true"/>}/>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Link href="/?tab=settings" className="text-sm text-[var(--app-accent-strong)] hover:underline">Bildirim tercihleri</Link>
      {unread > 0 && <button type="button" onClick={() => void mark("read_all")} className="inline-flex items-center gap-2 rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-surface-1)] px-3 py-2 text-sm text-[var(--app-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"><CheckCheck className="h-4 w-4" aria-hidden="true"/>Tümünü okundu yap</button>}
    </div>
    {message && (items.length === 0 ? <ErrorState compact title="Bildirimler yüklenemedi" description={message} onRetry={() => void load(false)}/> : <p role="status" className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-bg)] p-3 text-sm text-[var(--app-text-secondary)]">{message}</p>)}
    <div className="space-y-2">{items.map((item) => <Link key={item.id} href={notificationHref(item)} onClick={(event) => { event.preventDefault(); void openNotification(item); }} className={`density-list-row flex min-h-11 items-center gap-3 rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] ${item.readAt ? "border-[var(--app-border)] bg-[var(--app-panel-bg)] hover:bg-[var(--app-card-hover)]" : "border-[var(--app-selected-border)] bg-[var(--app-selected-bg)]"}`}><ProfileAvatar profileName={item.actor?.displayName ?? "MediaTracker"} socialAvatarUrl={item.actor?.avatarUrl} allowLocalFallback={false} size="social" shape="circle"/><div className="min-w-0 flex-1"><p className="text-sm text-[var(--app-text-primary)]"><strong>{item.actor?.displayName ?? "MediaTracker"}</strong> {LABELS[item.type]}</p>{typeof item.payload.title === "string" && <p className="truncate text-xs text-[var(--app-text-secondary)]">{item.payload.title}</p>}<p className="mt-1 text-xs text-[var(--app-text-muted)]">{new Date(item.createdAt).toLocaleString("tr-TR")}</p></div>{!item.readAt && <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--app-selected-text)]"><span className="h-2 w-2 rounded-full bg-[var(--app-accent)]" aria-hidden="true"/>Yeni</span>}</Link>)}</div>
    {!loading && !message && items.length === 0 && <EmptyState title="Bildirimlerin temiz" description="Yeni takip, yorum, tepki ve öneri olayları geldiğinde burada görünecek." icon={<CheckCheck className="h-5 w-5" aria-hidden="true"/>}/>}
    {loading && items.length === 0 && <LoadingState label="Bildirimler yükleniyor…" rows={4}/>}
    {nextCursor && <button type="button" onClick={() => void load(true, nextCursor)} className="rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-surface-1)] px-4 py-2 text-sm text-[var(--app-text-secondary)]">Daha fazla göster</button>}
  </div>;
}
