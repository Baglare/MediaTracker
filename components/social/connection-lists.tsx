"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Row = { id: string; username: string; displayName: string; status?: string };

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
        {(["followers", "following", ...(self ? ["pending"] as const : [])] as const).map((value) => <button key={value} type="button" onClick={() => changeKind(value)} className={`rounded-md px-2 py-1 text-xs ${kind === value ? "bg-violet-500/20 text-violet-200" : "bg-zinc-800 text-zinc-400"}`}>{value === "followers" ? "Takipçiler" : value === "following" ? "Takip edilenler" : "Bekleyenler"}</button>)}
      </div>
      <input value={query} onChange={(event) => changeQuery(event.target.value)} placeholder="Listede ara" className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm" />
      <div className="space-y-2">{rows.map((row) => <Link key={row.id} href={`/u/${row.username}`} className="flex items-center justify-between rounded-lg bg-zinc-950/60 px-3 py-2 text-sm"><span><strong>{row.displayName}</strong> <span className="text-zinc-500">@{row.username}</span></span>{row.status === "pending" && <span className="text-amber-400">Bekliyor</span>}</Link>)}{rows.length === 0 && <p className="text-xs text-zinc-500">Gösterilecek hesap yok.</p>}{hasMore && <button type="button" onClick={() => setOffset((value) => value + 20)} className="text-xs text-violet-300">Daha fazla göster</button>}</div>
    </div>
  );
}
