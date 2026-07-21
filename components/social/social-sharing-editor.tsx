"use client";

import { useMemo, useState } from "react";

import { buildProgressionSnapshot, buildStatsSnapshot, mediaItemToSocialSnapshot } from "@/lib/social/snapshots";
import type { SocialProfilePayload } from "@/lib/social/types";
import type { MediaItem } from "@/lib/types";
import type { UserProgression } from "@/lib/user-progression";

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/social/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json() as { message?: string };
  if (!response.ok) throw new Error(result.message ?? "İşlem tamamlanamadı.");
}

function matchSnapshot(media: MediaItem[], snapshot: SocialProfilePayload["favorites"][number]): string | undefined {
  return media.find((item) => item.type === snapshot.mediaType && ((item.externalSource && item.externalId && item.externalSource === snapshot.externalSource && item.externalId === snapshot.externalId) || item.title === snapshot.title))?.id;
}

export function SocialSharingEditor({ media, progression, favorites, current, sharedNotes, onRefresh }: { media: MediaItem[]; progression: UserProgression; favorites: SocialProfilePayload["favorites"]; current: SocialProfilePayload["current"]; sharedNotes: SocialProfilePayload["sharedNotes"]; onRefresh: () => Promise<void> }) {
  const active = useMemo(() => media.filter((item) => item.status === "watching" || item.status === "reading"), [media]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => favorites.flatMap((item) => matchSnapshot(media, item) ?? []));
  const [currentIds, setCurrentIds] = useState<string[]>(() => current.flatMap((item) => matchSnapshot(active, item) ?? []));
  const [noteId, setNoteId] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [noteVisibility, setNoteVisibility] = useState<"public" | "followers" | "mutual">("public");
  const [spoiler, setSpoiler] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const noteItems = useMemo(() => media.filter((item) => item.personalNotes?.trim()), [media]);
  const stale = [...favorites.filter((snapshot) => !matchSnapshot(media, snapshot)), ...current.filter((snapshot) => !matchSnapshot(active, snapshot))];

  function toggle(list: string[], id: string, limit: number, setter: (value: string[]) => void) { setter(list.includes(id) ? list.filter((item) => item !== id) : list.length < limit ? [...list, id] : list); }
  async function saveShowcase(kind: "favorites" | "current", ids: string[]) {
    setMessage("");
    try { const items = ids.flatMap((id) => { const item = media.find((entry) => entry.id === id); return item ? [mediaItemToSocialSnapshot(item, ids.indexOf(id))] : []; }); await post({ action: "replace_showcase", kind, items }); setMessage("Vitrin snapshot kaydedildi."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Vitrin kaydedilemedi."); }
  }
  function beginNote() { const item = noteItems.find((entry) => entry.id === noteId); if (!item?.personalNotes) return; setNoteDraft(item.personalNotes); setConfirming(true); }
  async function shareNote() {
    const item = noteItems.find((entry) => entry.id === noteId); if (!item) return;
    try { await post({ action: "share_note", note: { mediaTitle: item.title, mediaType: item.type, externalSource: item.externalSource, externalId: item.externalId, content: noteDraft, containsSpoiler: spoiler, visibility: noteVisibility, confirmed: true } }); setConfirming(false); setMessage("Not snapshot profilinde paylaşıldı."); await onRefresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Not paylaşılamadı."); }
  }
  async function publish(action: "publish_stats" | "publish_progression") {
    try { await post({ action, snapshot: action === "publish_stats" ? buildStatsSnapshot(media) : buildProgressionSnapshot(progression) }); setMessage(action === "publish_stats" ? "Toplu istatistik snapshot yayımlandı." : "Progression snapshot yayımlandı."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Snapshot kaydedilemedi."); }
  }
  return <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5"><h3 className="font-semibold">Kontrollü public snapshot’lar</h3><p className="mt-1 text-xs text-zinc-500">Hiçbir kütüphane, favori, not veya istatistik otomatik paylaşılmaz. Yalnızca aşağıda seçip kaydettiğin özetler cloud sosyal profile yazılır.</p>
    {stale.length > 0 && <p className="mt-3 rounded-lg border border-amber-900/50 bg-amber-950/10 p-3 text-xs text-amber-200">Yerel listede artık bulunmayan snapshot: {stale.map((item) => item.title).join(", ")}. İlgili vitrini yeniden kaydetmek bu stale kayıtları temizler.</p>}
    <div className="mt-5 grid gap-4 xl:grid-cols-2"><fieldset className="rounded-xl border border-zinc-800 p-3"><legend className="px-1 text-sm font-medium">Favori vitrini · en fazla 5</legend><div className="max-h-52 space-y-2 overflow-auto">{media.map((item) => <label key={item.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={favoriteIds.includes(item.id)} onChange={() => toggle(favoriteIds, item.id, 5, setFavoriteIds)} />{item.title}</label>)}</div><button type="button" onClick={() => void saveShowcase("favorites", favoriteIds)} className="mt-3 rounded-lg bg-zinc-800 px-3 py-2 text-xs">Seçimi yayımla</button></fieldset>
      <fieldset className="rounded-xl border border-zinc-800 p-3"><legend className="px-1 text-sm font-medium">Şu anda · en fazla 6</legend><div className="max-h-52 space-y-2 overflow-auto">{active.map((item) => <label key={item.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={currentIds.includes(item.id)} onChange={() => toggle(currentIds, item.id, 6, setCurrentIds)} />{item.title}</label>)}</div><button type="button" onClick={() => void saveShowcase("current", currentIds)} className="mt-3 rounded-lg bg-zinc-800 px-3 py-2 text-xs">Seçimi yayımla</button></fieldset></div>
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void publish("publish_stats")} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs">Toplu istatistiği yayımla</button><button type="button" onClick={() => void publish("publish_progression")} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs">Yolculuk snapshot’ını yayımla</button></div>
    <div className="mt-5 border-t border-zinc-800 pt-4"><h4 className="text-sm font-medium">Paylaşılan notlar</h4><div className="mt-3 flex flex-col gap-2 sm:flex-row"><select value={noteId} onChange={(event) => setNoteId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"><option value="">Kişisel not seç</option>{noteItems.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><button type="button" disabled={!noteId} onClick={beginNote} className="rounded-lg bg-violet-600 px-3 py-2 text-sm text-white disabled:opacity-40">Profilimde paylaş</button></div>
      {confirming && <div role="dialog" aria-modal="true" aria-labelledby="share-note-title" className="mt-3 rounded-xl border border-amber-700/40 bg-amber-950/10 p-4"><h5 id="share-note-title" className="font-medium text-amber-200">Paylaşımı son kez doğrula</h5><p className="mt-1 text-xs text-zinc-400">Bu not profilinde görünecek. Spoiler, özel bilgi veya paylaşmak istemediğin içerik bulunmadığını doğrula.</p><textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} maxLength={2000} rows={5} className="mt-3 w-full rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm" /><div className="mt-2 flex flex-wrap gap-3"><select value={noteVisibility} onChange={(event) => setNoteVisibility(event.target.value as typeof noteVisibility)} className="rounded-lg bg-zinc-900 px-2 py-1 text-xs"><option value="public">Herkes</option><option value="followers">Takipçiler</option><option value="mutual">Karşılıklı</option></select><label className="text-xs"><input type="checkbox" checked={spoiler} onChange={(event) => setSpoiler(event.target.checked)} className="mr-2" />Spoiler içeriyor</label></div><div className="mt-3 flex gap-2"><button type="button" onClick={() => void shareNote()} className="rounded-lg bg-amber-600 px-3 py-2 text-xs text-white">Onayla ve paylaş</button><button type="button" onClick={() => setConfirming(false)} className="rounded-lg bg-zinc-800 px-3 py-2 text-xs">Vazgeç</button></div></div>}
      <div className="mt-3 space-y-2">{sharedNotes.map((note) => <div key={note.id} className="flex items-start justify-between gap-3 rounded-lg bg-zinc-950/60 p-3"><div><p className="text-sm font-medium">{note.mediaTitle}</p><p className="line-clamp-2 text-xs text-zinc-500">{note.content}</p></div><button type="button" onClick={async () => { try { await post({ action: "unshare_note", noteId: note.id }); setMessage("Paylaşım kaldırıldı; yerel kişisel not korunuyor."); await onRefresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Paylaşım kaldırılamadı."); } }} className="shrink-0 text-xs text-red-400">Paylaşımı kaldır</button></div>)}</div>
    </div>{message && <p role="status" className="mt-4 text-xs text-zinc-400">{message}</p>}
  </section>;
}
