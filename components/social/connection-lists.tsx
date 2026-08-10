"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ProfileAvatar } from "@/components/sidebar-profile-card";

type Row = { id: string; username: string; displayName: string; avatarUrl?: string; status?: string };

export function ConnectionLists({ ownerId, self }: { ownerId: string; self: boolean }) {
  const [kind, setKind] = useState<"followers" | "following" | "pending">("followers");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ owner: ownerId, kind, q: query, offset: String(offset) });
      try {
        const response = await fetch(`/api/social/connections?${params}`, { signal: controller.signal });
        const data = await response.json() as { results?: Row[] };
        const next = data.results ?? [];
        setRows((current) => offset === 0 ? next : [...current, ...next]);
        setHasMore(next.length === 20);
      } catch { if (!controller.signal.aborted) setRows([]); }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [kind, offset, ownerId, query]);
  function changeKind(value: "followers" | "following" | "pending") { setKind(value); setOffset(0); setRows([]); }
  function changeQuery(value: string) { setQuery(value); setOffset(0); setRows([]); }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(["followers", "following", ...(self ? ["pending"] as const : [])] as const).map((value) => <button key={value} type="button" onClick={() => changeKind(value)} className={`rounded-md border px-2 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] ${kind === value ? "border-[var(--app-selected-border)] bg-[var(--app-selected-bg)] text-[var(--app-selected-text)]" : "border-[var(--app-border)] bg-[var(--app-surface-2)] text-[var(--app-text-secondary)]"}`}>{value === "followers" ? "Takipçiler" : value === "following" ? "Takip edilenler" : "Bekleyenler"}</button>)}
      </div>
      <input value={query} onChange={(event) => changeQuery(event.target.value)} placeholder="Listede ara" className="app-input w-full rounded-lg border px-3 py-2 text-sm" />
      <div className="space-y-2">{rows.map((row) => <Link key={row.id} href={`/u/${row.username}`} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-card-bg)] px-3 py-2 text-sm hover:bg-[var(--app-card-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"><span className="flex min-w-0 items-center gap-2"><ProfileAvatar profileName={row.displayName} socialAvatarUrl={row.avatarUrl} allowLocalFallback={false} size="sm" shape="circle" /><span className="min-w-0 truncate"><strong>{row.displayName}</strong> <span className="text-[var(--app-text-muted)]">@{row.username}</span></span></span>{row.status === "pending" && <span className="shrink-0 text-[var(--app-warning)]">Bekliyor</span>}</Link>)}{rows.length === 0 && <p className="text-xs text-[var(--app-text-muted)]">Gösterilecek hesap yok.</p>}{hasMore && <button type="button" onClick={() => setOffset((value) => value + 20)} className="text-xs text-[var(--app-accent-strong)]">Daha fazla göster</button>}</div>
    </div>
  );
}
