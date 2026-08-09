"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { SocialActions } from "@/components/social/social-actions";
import { ProfileAvatar } from "@/components/sidebar-profile-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FilterToolbar } from "@/components/ui/filter-toolbar";
import { LoadingState } from "@/components/ui/loading-state";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ConnectionState, SocialPersonSummary } from "@/lib/social/types";

const CONNECTION_LABELS: Record<ConnectionState, string> = {
  none: "Bağlantı yok",
  viewer_follows: "Takip ediyorsun",
  owner_follows: "Seni takip ediyor",
  mutual: "Karşılıklı",
  outbound_pending: "İstek gönderildi",
  inbound_pending: "İstek bekliyor",
  self: "Senin profilin",
  anonymous: "Giriş gerekli",
};

export function PeopleSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SocialPersonSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [message, setMessage] = useState("En az iki karakter yazarak kullanıcı ara.");
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/social/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: query.trim(), offset }),
          signal: controller.signal,
        });
        const data = await response.json() as { results?: SocialPersonSummary[]; message?: string };
        const next = data.results ?? [];
        setResults((current) => offset === 0 ? next : [...current, ...next]);
        setHasMore(next.length === 20);
        if (!response.ok) throw new Error(data.message ?? "Arama yapılamadı.");
        setError("");
        setMessage(next.length || offset > 0 ? "" : "Eşleşen public veya korumalı profil yok.");
      } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Arama servisine ulaşılamadı."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 350);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [offset, query, retryKey]);
  function changeQuery(value: string) {
    setQuery(value);
    setOffset(0); setResults([]); setHasMore(false);
    setError("");
    if (value.trim().length < 2) { setMessage("En az iki karakter yazarak kullanıcı ara."); setLoading(false); }
  }
  return <div className="space-y-5">
    <FilterToolbar search={<label className="relative block"><span className="sr-only">Kullanıcı adı veya görünen ad</span><Search className="absolute left-3 top-3 h-5 w-5 text-[var(--app-text-muted)]" aria-hidden="true" /><input value={query} onChange={(event) => changeQuery(event.target.value)} placeholder="Kullanıcı adı veya görünen ad" className="app-input w-full rounded-xl border py-3 pl-11 pr-4 outline-none focus:border-[var(--app-focus)] focus:ring-2 focus:ring-[var(--app-focus)]" /></label>}/>
    {loading && results.length===0 && <LoadingState label="Kullanıcılar aranıyor…" rows={3}/>}
    {!loading && error && <ErrorState title="Kullanıcı araması yapılamadı" description={error} onRetry={()=>setRetryKey((value)=>value+1)}/>}
    {!loading && !error && message && <EmptyState compact title={query.trim().length < 2 ? "Kullanıcı keşfine başla" : "Eşleşen kullanıcı yok"} description={message}/>}
    <div className="grid gap-3">{results.map((person) => <article key={person.id} className="app-card density-list-row flex min-h-11 flex-col gap-4 rounded-2xl border transition-colors hover:bg-[var(--app-card-hover)] sm:flex-row sm:items-center"><Link href={`/u/${person.username}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"><ProfileAvatar profileName={person.displayName} socialAvatarUrl={person.avatarUrl} imageTransform={person.avatarTransform} allowLocalFallback={false} size="social" shape="circle" /><div className="min-w-0"><p className="truncate font-semibold text-[var(--app-text-primary)]">{person.displayName}</p><p className="text-sm text-[var(--app-text-muted)]">@{person.username} · {person.visibilityMode === "protected" ? "Korumalı" : "Herkese açık"}</p><div className="mt-1"><StatusBadge tone={person.relationship.state === "mutual" ? "accent" : "neutral"}>{CONNECTION_LABELS[person.relationship.state]}</StatusBadge></div>{person.bio && <p className="mt-2 line-clamp-2 text-sm text-[var(--app-text-secondary)]">{person.bio}</p>}</div></Link><SocialActions targetId={person.id} state={person.relationship.state} viewerFollowsOwner={person.relationship.viewerFollowsOwner} ownerFollowsViewer={person.relationship.ownerFollowsViewer} onSuccess={(action) => { if (action === "block") setResults((current) => current.filter((item) => item.id !== person.id)); }} /></article>)}</div>
    {hasMore && <button type="button" disabled={loading} onClick={() => setOffset((value) => value + 20)} className="rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-surface-1)] px-4 py-2 text-sm text-[var(--app-text-secondary)] disabled:border-[var(--app-disabled-border)] disabled:bg-[var(--app-disabled-bg)] disabled:text-[var(--app-disabled-text)]">Daha fazla göster</button>}
  </div>;
}
