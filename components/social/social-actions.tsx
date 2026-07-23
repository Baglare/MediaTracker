"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

import type { ConnectionState, FollowStatus } from "@/lib/social/types";

export function SocialActions({ targetId, state, viewerFollowsOwner, ownerFollowsViewer, onSuccess }: { targetId: string; state: ConnectionState; viewerFollowsOwner?: FollowStatus | null; ownerFollowsViewer?: FollowStatus | null; onSuccess?: (action: string) => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function act(action: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/social/relationships", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, targetId }) });
      const result = await response.json() as { ok?: boolean; message?: string };
      if (!response.ok) setMessage(result.message ?? "İşlem uygulanamadı.");
      else { setMessage("İşlem kaydedildi."); onSuccess?.(action); router.refresh(); }
    } catch { setMessage("Bağlantı kurulamadı."); }
    finally { setBusy(false); }
  }

  if (state === "self") return null;
  if (state === "anonymous") return <p className="text-xs text-[var(--app-text-muted)]">Takip etmek için ana uygulamadan giriş yap.</p>;
  const primary = viewerFollowsOwner === "pending" || state === "outbound_pending" ? ["cancel", "İsteği iptal et"] : viewerFollowsOwner === "accepted" || state === "viewer_follows" || state === "mutual" ? ["unfollow", "Takibi bırak"] : ["follow", "Takip et"];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} onClick={() => act(primary[0])} className="app-primary-action rounded-lg px-3 py-2 text-sm font-medium disabled:border-[var(--app-disabled-border)] disabled:bg-[var(--app-disabled-bg)] disabled:text-[var(--app-disabled-text)]">{primary[1]}</button>
      <Link href={`/recommendations?to=${encodeURIComponent(targetId)}`} className="rounded-lg border border-[var(--app-selected-border)] bg-[var(--app-selected-bg)] px-3 py-2 text-sm text-[var(--app-selected-text)]">İçerik öner</Link>
      {(ownerFollowsViewer === "pending" || state === "inbound_pending") && <><button type="button" disabled={busy} onClick={() => act("accept")} className="rounded-lg border border-[var(--app-action-success-border)] bg-[var(--app-action-success-bg)] px-3 py-2 text-sm text-[var(--app-action-success-text)]">Kabul et</button><button type="button" disabled={busy} onClick={() => act("reject")} className="rounded-lg border border-[var(--app-border-strong)] px-3 py-2 text-sm text-[var(--app-text-secondary)]">Reddet</button></>}
      <button type="button" disabled={busy} onClick={() => act("block")} className="rounded-lg border border-[color-mix(in_srgb,var(--app-danger)_42%,transparent)] bg-[var(--app-danger-soft)] px-3 py-2 text-xs text-[var(--app-danger)]">Engelle</button>
      {message && <span role="status" className="text-xs text-[var(--app-text-secondary)]">{message}</span>}
    </div>
  );
}
