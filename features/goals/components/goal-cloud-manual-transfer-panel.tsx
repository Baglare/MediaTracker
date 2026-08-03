"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CloudDownload, CloudUpload, GitMerge, Loader2, RefreshCw } from "lucide-react";

import { fetchGoalCloudSnapshots } from "@/features/goals/cloud/client";
import {
  applyCloudGoalsToLocalMerge,
  enqueueLocalGoalsToCloud,
  planCloudGoalsToLocalMerge,
  replaceLocalGoalsFromCloud,
  type RemoteGoalSnapshot,
} from "@/features/goals/cloud/manual-transfer";
import { flushGoalCloudQueue } from "@/features/goals/cloud/manager";
import { getGoalCloudRolloutContract } from "@/features/goals/cloud/rollout";
import { useGoals } from "@/features/goals/hooks/use-goals";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import type { MediaItem } from "@/lib/types";

interface Props {
  ownerScope: LocalOwnerScope | null;
  mediaItems: readonly MediaItem[];
  onConfirm: (title: string, message: string, onOk: () => void) => void;
}

type Feedback = { kind: "success" | "error"; text: string } | null;

export function GoalCloudManualTransferPanel({ ownerScope, mediaItems, onConfirm }: Props) {
  const userId = ownerScope?.kind === "user" ? ownerScope.userId : null;
  const goals = useGoals(userId, mediaItems);
  const rollout = getGoalCloudRolloutContract();
  const [remote, setRemote] = useState<RemoteGoalSnapshot[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const activeOwnerKeyRef = useRef(ownerScope?.key ?? null);

  useEffect(() => {
    activeOwnerKeyRef.current = ownerScope?.key ?? null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- owner değişiminde eski owner preview'su hemen temizlenir
    setRemote(null);
    setFeedback(null);
    setBusy(false);
  }, [ownerScope?.key]);

  const preview = useMemo(
    () => remote ? planCloudGoalsToLocalMerge(goals.goals, remote) : null,
    [goals.goals, remote],
  );

  if (!ownerScope || ownerScope.kind !== "user" || !rollout.enabled) return null;

  const refresh = async () => {
    const requestedOwner = ownerScope.key;
    setBusy(true);
    setFeedback(null);
    const result = await fetchGoalCloudSnapshots();
    if (requestedOwner !== activeOwnerKeyRef.current) return;
    setBusy(false);
    if (!result.ok) {
      setFeedback({ kind: "error", text: result.error });
      return;
    }
    setRemote(result.snapshots);
  };

  const merge = () => {
    if (!remote) return;
    onConfirm("Cloud hedeflerini birleştir", "Cloud hedefleri yerel hedefleri silmeden eklenecek. Çakışan ID'ler overwrite edilmeyecek.", () => {
      const result = applyCloudGoalsToLocalMerge(ownerScope, remote);
      setFeedback(result.ok
        ? { kind: "success", text: `${result.added} hedef yerel koleksiyona eklendi.` }
        : { kind: "error", text: result.code === "conflict" ? "Farklı payload taşıyan Goal ID çakışmaları var; sessiz overwrite yapılmadı." : "Hedef birleştirmesi güvenli biçimde yazılamadı." });
    });
  };

  const replace = () => {
    if (!remote) return;
    onConfirm("Cloud hedeflerini yerelde kullan", "Yerel Goal tanımları Cloud snapshot ile değiştirilecek; bekleyen Goal kuyruğu temizlenecek.", () => {
      const result = replaceLocalGoalsFromCloud(ownerScope, remote, { confirmed: true });
      setFeedback(result.ok
        ? { kind: "success", text: `${result.goals} Cloud hedefi yerel store'a yazıldı.` }
        : { kind: "error", text: result.code === "dispatch_started" ? "Gönderimi başlamış Goal işlemi varken replace güvenlik nedeniyle durduruldu." : "Goal replace tamamlanamadı." });
    });
  };

  const upload = () => {
    onConfirm("Yerel hedefleri Cloud'a aktar", "Yerel Goal tanımları revision-aware kuyruğa alınacak; yerel kayıtlar Cloud hatasında geri alınmayacak.", () => {
      const count = enqueueLocalGoalsToCloud(ownerScope, goals.goals);
      void flushGoalCloudQueue();
      setFeedback({ kind: "success", text: `${count} Goal işlemi kalıcı Cloud kuyruğuna alındı.` });
    });
  };

  const remoteActive = remote?.filter((item) => item.deletedAt === null).length ?? null;
  const remoteDeleted = remote?.filter((item) => item.deletedAt !== null).length ?? null;

  return (
    <section aria-labelledby="goal-cloud-transfer-title" className="mt-4 border-t border-[var(--app-border)] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 id="goal-cloud-transfer-title" className="text-sm font-semibold text-[var(--app-text-primary)]">Goal tanımları</h4>
          <p className="mt-1 text-[11px] text-[var(--app-text-muted)]">Evaluation, yüzde ve öneri geçmişi aktarılmaz.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={busy || rollout.status !== "ready"} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--app-border)] px-2.5 py-1.5 text-xs disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Önizlemeyi yenile
        </button>
      </div>
      {rollout.status !== "ready" ? (
        <p role="status" className="mt-3 rounded-lg border border-[var(--app-warning)] bg-[var(--app-warning-soft)] p-2 text-xs text-[var(--app-warning)]">Hedef senkronizasyonu durduruldu. Yerel hedeflerin korunuyor.</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg bg-[var(--app-surface-2)] p-2">Yerel <b className="float-right">{goals.goals.length}</b></div>
            <div className="rounded-lg bg-[var(--app-surface-2)] p-2">Cloud <b className="float-right">{remoteActive ?? "—"}</b></div>
            <div className="rounded-lg bg-[var(--app-surface-2)] p-2">Tombstone <b className="float-right">{remoteDeleted ?? "—"}</b></div>
            <div className="rounded-lg bg-[var(--app-surface-2)] p-2">Çakışma <b className="float-right">{preview?.conflicts.length ?? "—"}</b></div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button type="button" onClick={merge} disabled={!remote || busy} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--app-border)] px-2.5 py-2 text-xs disabled:opacity-50"><GitMerge className="h-3.5 w-3.5" />Birleştir</button>
            <button type="button" onClick={replace} disabled={!remote || busy} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--app-border)] px-2.5 py-2 text-xs disabled:opacity-50"><CloudDownload className="h-3.5 w-3.5" />Cloud sürümünü kullan</button>
            <button type="button" onClick={upload} disabled={busy || !goals.ready} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--app-border)] px-2.5 py-2 text-xs disabled:opacity-50"><CloudUpload className="h-3.5 w-3.5" />Yereli Cloud&apos;a aktar</button>
          </div>
        </>
      )}
      {feedback && <p role="status" className={`mt-3 rounded-lg p-2 text-xs ${feedback.kind === "success" ? "bg-[var(--app-success-soft)] text-[var(--app-success)]" : "bg-[var(--app-danger-soft)] text-[var(--app-danger)]"}`}>{feedback.text}</p>}
    </section>
  );
}
