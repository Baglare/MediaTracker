"use client";

import { useCallback, useEffect, useState } from "react";
import { ProfileAvatar } from "@/components/sidebar-profile-card";
import type { SocialRecommendationDetail } from "@/lib/social/interactions";
import { markNotificationEntityViewed } from "@/lib/social/notification-sync";
import { recommendationEventLabel } from "@/lib/social/recommendation-presentation";

export function RecommendationDetail({ recommendationId, onChanged }: { recommendationId: string; onChanged: () => Promise<void> }) {
  const [detail, setDetail] = useState<SocialRecommendationDetail>();
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/social/recommendations?recommendationId=${encodeURIComponent(recommendationId)}`, { cache: "no-store" });
      const data = await response.json() as SocialRecommendationDetail & { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Öneri ayrıntıları yüklenemedi.");
      setDetail(data); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Öneri ayrıntıları yüklenemedi."); }
  }, [recommendationId]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); void markNotificationEntityViewed("recommendation", recommendationId); return () => window.clearTimeout(timer); }, [load, recommendationId]);

  async function send() {
    if (!body.trim()) { setMessage("Geri bildirim boş olamaz."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/social/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "message", recommendationId, message: body, dedupeKey: `message:${recommendationId}:${Date.now()}` }) });
      const result = await response.json() as { message?: string }; if (!response.ok) throw new Error(result.message ?? "Geri bildirim gönderilemedi.");
      setBody(""); setMessage("Geri bildirim gönderildi."); await Promise.all([load(), onChanged()]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Geri bildirim gönderilemedi."); }
    finally { setBusy(false); }
  }

  return <div className="mt-4 grid gap-4 border-t border-zinc-800 pt-4 lg:grid-cols-2"><section><h3 className="text-sm font-semibold">Durum geçmişi</h3><ol className="mt-2 space-y-2">{detail?.events.map((event) => <li key={event.id} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-950/60 px-3 py-2 text-xs"><span>{recommendationEventLabel(event.eventType)}</span><time className="text-zinc-500">{new Date(event.createdAt).toLocaleString("tr-TR")}</time></li>)}</ol>{detail && detail.events.length === 0 && <p className="mt-2 text-xs text-zinc-500">Durum kaydı yok.</p>}</section>
    <section><h3 className="text-sm font-semibold">Geri bildirimler</h3><div className="mt-2 space-y-2">{detail?.messages.map((entry) => <div key={entry.id} className="flex gap-2 rounded-lg bg-zinc-950/60 p-3"><ProfileAvatar profileName={entry.author.displayName} socialAvatarUrl={entry.author.avatarUrl} allowLocalFallback={false} size="social" shape="circle"/><div className="min-w-0"><p className="text-xs font-medium">{entry.author.displayName}</p><p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{entry.deleted ? "Bu geri bildirim silindi." : entry.body}</p><time className="mt-1 block text-xs text-zinc-600">{new Date(entry.createdAt).toLocaleString("tr-TR")}</time></div></div>)}</div>{detail && detail.messages.length === 0 && <p className="mt-2 text-xs text-zinc-500">Henüz geri bildirim yok.</p>}
      {detail?.threadOpen && <div className="mt-3"><label className="text-xs text-zinc-400">Öneri hakkında kısa geri bildirim<textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"/></label><div className="mt-2 flex items-center justify-between"><span className="text-xs text-zinc-600">{body.length}/500</span><button type="button" disabled={busy || !body.trim()} onClick={() => void send()} className="rounded-lg bg-violet-600 px-3 py-2 text-xs disabled:opacity-50">{busy ? "Gönderiliyor…" : "Geri bildirim gönder"}</button></div></div>}
      {detail && !detail.threadOpen && <p className="mt-3 text-xs text-zinc-500">Bu önerinin geri bildirim akışı kapalı.</p>}{message && <p role="status" className="mt-2 text-xs text-zinc-400">{message}</p>}</section></div>;
}
