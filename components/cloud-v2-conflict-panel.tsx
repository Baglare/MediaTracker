"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CloudDownload,
  Loader2,
  Pause,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { useSyncStatus } from "@/hooks/use-sync-status";
import {
  fetchCloudMediaForConflict,
  fetchCloudV2RemoteSummary,
  listCloudV2Conflicts,
  type CloudV2ConflictCard,
  type CloudV2RemoteSummary,
} from "@/lib/cloud-media-v2-conflicts";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import {
  acknowledgeCloudV2Conflict,
  restoreCloudV2Tombstone,
  retryCloudV2Conflict,
  retryProgressAfterParent,
} from "@/lib/sync-manager";
import type { MediaItem, ProgressLog } from "@/lib/types";

interface CloudV2ConflictPanelProps {
  ownerScope: LocalOwnerScope | null;
  mediaItems: MediaItem[];
  progressLogs: ProgressLog[];
  onApplyResolution: (items: MediaItem[], logs: ProgressLog[]) => boolean;
  onConfirm: (title: string, message: string, onOk: () => void) => void;
}

type Feedback = { kind: "success" | "error" | "info"; text: string } | null;

function formatRevision(summary: CloudV2RemoteSummary | undefined): string {
  return summary ? `r${summary.revision}` : "Yenilenmedi";
}

export default function CloudV2ConflictPanel({
  ownerScope,
  mediaItems,
  progressLogs,
  onApplyResolution,
  onConfirm,
}: CloudV2ConflictPanelProps) {
  const sync = useSyncStatus();
  const [remote, setRemote] = useState<Record<string, CloudV2RemoteSummary>>({});
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const ownerKeyRef = useRef(ownerScope?.key ?? null);
  const conflicts = sync.adapter === "v2"
    ? listCloudV2Conflicts(ownerScope)
    : [];

  useEffect(() => {
    const nextOwnerKey = ownerScope?.key ?? null;
    if (ownerKeyRef.current === nextOwnerKey) return;
    ownerKeyRef.current = nextOwnerKey;
    setRemote({});
    setBusyItemId(null);
    setFeedback(null);
  }, [ownerScope?.key]);

  if (!ownerScope || ownerScope.kind !== "user" || sync.adapter !== "v2") {
    return null;
  }

  const showResult = (result: { ok: boolean; message?: string }, success: string) => {
    setFeedback({
      kind: result.ok ? "success" : "error",
      text: result.ok ? success : result.message ?? "İşlem tamamlanamadı.",
    });
  };

  const refreshRemote = async (card: CloudV2ConflictCard) => {
    const requestedOwner = ownerScope.key;
    setBusyItemId(card.itemId);
    const result = await fetchCloudV2RemoteSummary(card);
    if (ownerKeyRef.current !== requestedOwner) return;
    setBusyItemId(null);
    if (!result.ok) {
      setFeedback({ kind: "error", text: result.message });
      return;
    }
    setRemote((current) => ({ ...current, [card.itemId]: result.summary }));
    setFeedback({ kind: "success", text: "Cloud revision ve özet yenilendi." });
  };

  const acceptRemote = async (card: CloudV2ConflictCard) => {
    const requestedOwner = ownerScope.key;
    setBusyItemId(card.itemId);
    const result = await fetchCloudMediaForConflict(
      ownerScope.userId,
      card.recordId,
    );
    if (ownerKeyRef.current !== requestedOwner) return;
    setBusyItemId(null);
    if (!result.ok) {
      setFeedback({ kind: "error", text: result.message });
      return;
    }
    if (!mediaItems.some((item) => item.id === card.recordId)) {
      setFeedback({ kind: "error", text: "Eşleşen local record artık mevcut değil." });
      return;
    }
    const next = mediaItems.map((item) =>
      item.id === card.recordId ? result.item : item);
    if (!onApplyResolution(next, progressLogs)) {
      setFeedback({ kind: "error", text: "Cloud sürümü local storage'a yazılamadı." });
      return;
    }
    showResult(
      acknowledgeCloudV2Conflict(ownerScope, card.itemId),
      "Buluttaki sürüm güvenli local state olarak kabul edildi.",
    );
  };

  const keepDeleted = (card: CloudV2ConflictCard) => {
    onConfirm(
      "Cloud silme durumunu kabul et",
      "Bu local kayıt görünür kütüphaneden kaldırılacak. XP/social geçmişi ve progress logları bu işlemle değiştirilmez.",
      () => {
        const next = mediaItems.filter((item) => item.id !== card.recordId);
        if (!onApplyResolution(next, progressLogs)) {
          setFeedback({ kind: "error", text: "Local silme durumu yazılamadı." });
          return;
        }
        showResult(
          acknowledgeCloudV2Conflict(ownerScope, card.itemId),
          "Kayıt bulutta silinmiş olarak bırakıldı.",
        );
      },
    );
  };

  const restore = (card: CloudV2ConflictCard) => {
    onConfirm(
      "Cloud kaydını geri yükle",
      "Silinmiş cloud kayıt güncel revision üzerinden açıkça restore edilecek.",
      () => showResult(
        restoreCloudV2Tombstone(ownerScope, card.itemId),
        "Restore işlemi güvenli queue'ya eklendi.",
      ),
    );
  };

  const retryLocal = (card: CloudV2ConflictCard) => {
    const summary = remote[card.itemId];
    if (!summary) {
      setFeedback({
        kind: "info",
        text: "Retry öncesinde Remote yenile ile güncel revision alınmalı.",
      });
      return;
    }
    showResult(
      retryCloudV2Conflict(ownerScope, card.itemId, summary.revision),
      "Yerel değişiklik güncel revision ile yeni bir logical operation olarak kuyruğa alındı.",
    );
  };

  const retryParent = (card: CloudV2ConflictCard) => {
    const parent = mediaItems.find((item) => item.id === card.relatedMediaId);
    if (!parent) {
      setFeedback({
        kind: "error",
        text: "Parent media local kütüphanede bulunamadı; progress blocked kalacak.",
      });
      return;
    }
    showResult(
      retryProgressAfterParent(ownerScope, card.itemId, parent),
      "Parent media önce, progress işlemi ardından çalışacak şekilde kuyruğa alındı.",
    );
  };

  return (
    <div className="mt-4 space-y-3 border-t border-zinc-800/60 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-zinc-200">Cloud Conflict İncelemesi</h4>
          <p className="text-[11px] text-zinc-500">
            Blocked işlemler otomatik retry edilmez ve local veri sessizce ezilmez.
          </p>
        </div>
        <span className="rounded-md bg-rose-500/10 px-2 py-1 text-xs text-rose-300 ring-1 ring-rose-500/30">
          {conflicts.length} blocked
        </span>
      </div>

      {feedback && (
        <p className={`rounded-md px-3 py-2 text-xs ${
          feedback.kind === "success"
            ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30"
            : feedback.kind === "error"
              ? "bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/30"
              : "bg-blue-500/10 text-blue-300 ring-1 ring-blue-500/30"
        }`}>
          {feedback.text}
        </p>
      )}

      {conflicts.length === 0 ? (
        <p className="rounded-lg bg-zinc-800/40 px-3 py-2 text-xs text-zinc-500">
          Kullanıcı kararı bekleyen Cloud V2 conflict yok.
        </p>
      ) : conflicts.map((card) => {
        const summary = remote[card.itemId];
        const isBusy = busyItemId === card.itemId;
        return (
          <article
            key={card.itemId}
            className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  {card.manualOnly
                    ? <ShieldAlert className="h-4 w-4 text-rose-300" />
                    : <AlertTriangle className="h-4 w-4 text-amber-300" />}
                  <h5 className="text-sm font-medium text-zinc-100">{card.title}</h5>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                  {card.description}
                </p>
              </div>
              <span className="shrink-0 rounded bg-zinc-800/70 px-2 py-1 text-[10px] text-zinc-400">
                {card.reason}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
              <span className="text-zinc-500">Local: r{card.expectedRevision}</span>
              <span className="text-zinc-500">Server: r{card.serverRevision}</span>
              <span className="text-zinc-500">Remote: {formatRevision(summary)}</span>
              <span className="text-zinc-500">
                {card.safeLocalSummary.type ?? card.entity}
              </span>
            </div>
            {(card.safeLocalSummary.title || card.safeLocalSummary.progress) && (
              <p className="mt-2 text-xs text-zinc-300">
                {card.safeLocalSummary.title ?? "Başlıksız kayıt"}
                {card.safeLocalSummary.status
                  ? ` · ${card.safeLocalSummary.status}`
                  : ""}
                {card.safeLocalSummary.progress
                  ? ` · ${card.safeLocalSummary.progress}`
                  : ""}
              </p>
            )}
            {summary && (
              <p className="mt-1 text-[11px] text-blue-300">
                Cloud: {summary.title ?? "Kayıt"} · r{summary.revision}
                {summary.status ? ` · ${summary.status}` : ""}
                {summary.progress ? ` · ${summary.progress}` : ""}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {!card.manualOnly && (
                <button
                  type="button"
                  onClick={() => void refreshRemote(card)}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-2.5 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                >
                  {isBusy
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <RefreshCw className="h-3 w-3" />}
                  Remote yenile
                </button>
              )}
              {card.actions.includes("use-remote") && (
                <button
                  type="button"
                  onClick={() => void acceptRemote(card)}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-500/15 px-2.5 py-1.5 text-[11px] text-blue-300 ring-1 ring-blue-500/30"
                >
                  <CloudDownload className="h-3 w-3" />
                  Buluttaki sürümü kullan
                </button>
              )}
              {card.actions.includes("retry-local") && (
                <button
                  type="button"
                  onClick={() => retryLocal(card)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-violet-500/15 px-2.5 py-1.5 text-[11px] text-violet-300 ring-1 ring-violet-500/30"
                >
                  <RotateCcw className="h-3 w-3" />
                  Yerel değişikliği retry et
                </button>
              )}
              {card.actions.includes("keep-deleted") && (
                <button
                  type="button"
                  onClick={() => keepDeleted(card)}
                  className="rounded-md bg-zinc-800 px-2.5 py-1.5 text-[11px] text-zinc-300"
                >
                  Silinmiş olarak bırak
                </button>
              )}
              {card.actions.includes("restore") && (
                <button
                  type="button"
                  onClick={() => restore(card)}
                  className="rounded-md bg-amber-500/15 px-2.5 py-1.5 text-[11px] text-amber-300 ring-1 ring-amber-500/30"
                >
                  Açık onayla restore et
                </button>
              )}
              {card.actions.includes("retry-parent-first") && (
                <button
                  type="button"
                  onClick={() => retryParent(card)}
                  className="rounded-md bg-violet-500/15 px-2.5 py-1.5 text-[11px] text-violet-300 ring-1 ring-violet-500/30"
                >
                  Parent media sonrası retry
                </button>
              )}
              <button
                type="button"
                onClick={() => setFeedback({
                  kind: "info",
                  text: "İşlem ertelendi; blocked kayıt güvenli biçimde korunuyor.",
                })}
                className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-2.5 py-1.5 text-[11px] text-zinc-400"
              >
                <Pause className="h-3 w-3" />
                Şimdilik ertele
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
