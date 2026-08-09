"use client";

import { useEffect, useMemo, useState } from "react";
import { ProfileAvatar } from "@/components/sidebar-profile-card";
import { loadScopedMediaList } from "@/lib/storage";
import { createUserOwnerScope } from "@/lib/local-owner-scope";
import { mediaToSocialSnapshot, type SocialMediaEntitySnapshot } from "@/lib/social/interactions";
import { recipientRelationshipLabel, recipientSelectionMode } from "@/lib/social/recommendation-presentation";
import type { SocialPersonSummary } from "@/lib/social/types";
import type { MediaItem } from "@/lib/types";

const DRAFT_KEY = "media-tracker-recommendation-draft";

export function storeRecommendationDraft(media: MediaItem): void {
  if (typeof window !== "undefined") sessionStorage.setItem(DRAFT_KEY, JSON.stringify(mediaToSocialSnapshot(media)));
}

export function RecommendationComposer({ userId, initialRecipientId, onSent, onCancel }: { userId: string; initialRecipientId?: string; onSent?: () => void; onCancel?: () => void }) {
  const [recipient, setRecipient] = useState<SocialPersonSummary>();
  const [initialRecipientResolved, setInitialRecipientResolved] = useState(false);
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<SocialPersonSummary[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [draft, setDraft] = useState<SocialMediaEntitySnapshot>();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(() => {
      const read = loadScopedMediaList(createUserOwnerScope(userId));
      setMedia(read.status === "valid" || read.status === "empty" ? read.data ?? [] : []);
      try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        if (raw) { setDraft(JSON.parse(raw) as SocialMediaEntitySnapshot); sessionStorage.removeItem(DRAFT_KEY); }
      } catch { /* Invalid draft is ignored. */ }
    });
  }, [userId]);

  useEffect(() => {
    if (!initialRecipientId || initialRecipientResolved) return;
    const controller = new AbortController();
    fetch(`/api/social/people?id=${encodeURIComponent(initialRecipientId)}`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((data: unknown) => { if (data && typeof data === "object" && "person" in data && data.person) setRecipient(data.person as SocialPersonSummary); })
      .catch(() => undefined)
      .finally(() => setInitialRecipientResolved(true));
    return () => controller.abort();
  }, [initialRecipientId, initialRecipientResolved]);

  useEffect(() => {
    if (query.trim().length < 2 || recipient) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch("/api/social/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
        signal: controller.signal,
        cache: "no-store",
      })
        .then((response) => response.json())
        .then((data: unknown) => { if (data && typeof data === "object" && "results" in data && Array.isArray(data.results)) setPeople(data.results as SocialPersonSummary[]); })
        .catch(() => undefined);
    }, 300);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, recipient]);

  const selected = useMemo(() => {
    if (draft) return draft;
    const item = media.find((entry) => mediaToSocialSnapshot(entry).canonicalKey === selectedKey);
    return item ? mediaToSocialSnapshot(item) : undefined;
  }, [draft, media, selectedKey]);

  async function send() {
    if (!recipient || !selected) { setMessage("Alıcı ve medya seçmelisin."); return; }
    setBusy(true);
    const dedupeKey = `send:${recipient.id}:${selected.canonicalKey}:${Date.now()}`;
    try {
      const response = await fetch("/api/social/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientId: recipient.id, media: selected, senderNote: note, dedupeKey }) });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Öneri gönderilemedi.");
      setMessage("Öneri gönderildi."); setNote(""); setDraft(undefined); onSent?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Öneri gönderilemedi."); }
    finally { setBusy(false); }
  }

  return <section className="rounded-2xl border border-violet-500/25 bg-zinc-900 p-4">
    <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Medya öner</h2>{onCancel && <button type="button" onClick={onCancel} className="text-sm text-zinc-400">Kapat</button>}</div>
    {recipientSelectionMode(recipient) === "search" ? <div className="mt-3">
      <label className="text-xs text-zinc-400">Alıcı ara<input value={query} onChange={(event) => { setQuery(event.target.value); if (event.target.value.trim().length < 2) setPeople([]); }} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"/></label>
      {people.length > 0 && <div className="mt-2 grid gap-2">{people.map((person) => <button type="button" key={person.id} onClick={() => { setRecipient(person); setQuery(""); setPeople([]); }} className="flex items-center gap-3 rounded-xl border border-zinc-700 p-3 text-left hover:border-violet-500/50"><ProfileAvatar profileName={person.displayName} socialAvatarUrl={person.avatarUrl} allowLocalFallback={false} size="social" shape="circle"/><span><strong className="block text-sm">{person.displayName}</strong><span className="text-xs text-zinc-500">@{person.username}</span></span></button>)}</div>}
    </div> : recipient && <div className="mt-3 flex items-start gap-3 rounded-xl border border-violet-500/30 bg-zinc-950/70 p-3"><ProfileAvatar profileName={recipient.displayName} socialAvatarUrl={recipient.avatarUrl} allowLocalFallback={false} size="md" shape="circle"/><div className="min-w-0 flex-1"><strong className="block">{recipient.displayName}</strong><p className="text-xs text-zinc-500">@{recipient.username} · {recipientRelationshipLabel(recipient)}</p>{recipient.bio && <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{recipient.bio}</p>}</div><button type="button" onClick={() => setRecipient(undefined)} className="shrink-0 text-xs text-violet-300">Değiştir</button></div>}
    <label className="mt-3 block text-xs text-zinc-400">Kütüphanenden medya<select disabled={Boolean(draft)} value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"><option value="">Seç…</option>{media.map((item) => <option key={item.id} value={mediaToSocialSnapshot(item).canonicalKey}>{item.title}</option>)}</select></label>
    {draft && <p className="mt-2 rounded-lg bg-zinc-950 p-2 text-sm">Seçilen medya: <strong>{draft.title}</strong></p>}
    <label className="mt-3 block text-xs text-zinc-400">Öneri nedeni<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"/></label>
    <button type="button" disabled={busy || !recipient} onClick={() => void send()} className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium disabled:opacity-50">{busy ? "Gönderiliyor…" : "Öneriyi gönder"}</button>{message && <p role="status" className="mt-2 text-sm text-zinc-400">{message}</p>}
  </section>;
}

export function RecommendMediaButton({ media }: { media: MediaItem }) {
  return <button type="button" onClick={() => { storeRecommendationDraft(media); window.location.assign("/recommendations?compose=1"); }} className="inline-flex h-9 items-center rounded-lg bg-violet-500/15 px-3 text-[13px] font-medium text-violet-200 ring-1 ring-violet-500/30">Arkadaşına öner</button>;
}
