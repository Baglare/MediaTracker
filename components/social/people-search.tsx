"use client";

import Link from "next/link";
import { Search, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { SocialActions } from "@/components/social/social-actions";
import type { SocialPersonSummary } from "@/lib/social/types";

export function PeopleSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SocialPersonSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [message, setMessage] = useState("En az iki karakter yazarak kullanıcı ara.");
  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/social/people?q=${encodeURIComponent(query.trim())}&offset=${offset}`, { signal: controller.signal });
        const data = await response.json() as { results?: SocialPersonSummary[]; message?: string };
        const next = data.results ?? [];
        setResults((current) => offset === 0 ? next : [...current, ...next]);
        setHasMore(next.length === 20);
        setMessage(response.ok ? (next.length || offset > 0 ? "" : "Eşleşen public veya korumalı profil yok.") : data.message ?? "Arama yapılamadı.");
      } catch { if (!controller.signal.aborted) setMessage("Arama servisine ulaşılamadı."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 350);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [offset, query]);
  function changeQuery(value: string) {
    setQuery(value);
    setOffset(0); setResults([]); setHasMore(false);
    if (value.trim().length < 2) { setMessage("En az iki karakter yazarak kullanıcı ara."); setLoading(false); }
  }
  return <div className="space-y-5">
    <label className="relative block"><span className="sr-only">Kullanıcı adı veya görünen ad</span><Search className="absolute left-3 top-3 h-5 w-5 text-zinc-500" aria-hidden="true" /><input value={query} onChange={(event) => changeQuery(event.target.value)} placeholder="Kullanıcı adı veya görünen ad" className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-3 pl-11 pr-4 text-zinc-100 outline-none focus:border-violet-500" /></label>
    {loading && <p role="status" className="text-sm text-zinc-500">Aranıyor…</p>}
    {!loading && message && <p role="status" className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 text-sm text-zinc-400">{message}</p>}
    <div className="grid gap-3">{results.map((person) => <article key={person.id} className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:flex-row sm:items-center"><Link href={`/u/${person.username}`} className="flex min-w-0 flex-1 items-center gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-violet-950 font-semibold">{person.avatarUrl ? <span className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${JSON.stringify(person.avatarUrl).slice(1, -1)})` }} /> : <Users className="h-5 w-5" aria-hidden="true" />}</div><div className="min-w-0"><p className="truncate font-semibold">{person.displayName}</p><p className="text-sm text-zinc-500">@{person.username} · {person.visibilityMode === "protected" ? "Korumalı" : "Herkese açık"}</p>{person.bio && <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{person.bio}</p>}</div></Link><SocialActions targetId={person.id} state={person.relationship.state} viewerFollowsOwner={person.relationship.viewerFollowsOwner} ownerFollowsViewer={person.relationship.ownerFollowsViewer} onSuccess={(action) => { if (action === "block") setResults((current) => current.filter((item) => item.id !== person.id)); }} /></article>)}</div>
    {hasMore && <button type="button" disabled={loading} onClick={() => setOffset((value) => value + 20)} className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-300 disabled:opacity-50">Daha fazla göster</button>}
  </div>;
}
