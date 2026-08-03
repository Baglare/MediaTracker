"use client";

import { useCallback, useEffect, useState } from "react";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import { acceptCloudGoalVersion, listGoalCloudConflicts, overwriteCloudGoalWithLocal, saveConflictingGoalAsCopy } from "@/features/goals/cloud/conflicts";
import { subscribeGoalCloudSync } from "@/features/goals/cloud/manager";
import type { GoalCloudQueueItem } from "@/features/goals/cloud/types";

function label(item: GoalCloudQueueItem): string {
  const kind = item.blockedConflict?.kind;
  if (kind === "local_update_vs_remote_tombstone") return "Buluttaki hedef silinmiş";
  if (kind === "local_delete_vs_newer_cloud") return "Bulutta daha yeni hedef var";
  if (kind === "operation_id_reused") return "İşlem kimliği çakıştı";
  if (kind === "malformed_server_definition") return "Bulut hedefi doğrulanamadı";
  return "Hedef sürümü çakıştı";
}

export function GoalCloudConflictPanel({ ownerScope }: { ownerScope: LocalOwnerScope | null }) {
  const [snapshot, setSnapshot] = useState<{ ownerKey: string | null; items: GoalCloudQueueItem[] }>({ ownerKey: null, items: [] });
  const [message, setMessage] = useState<string>();
  const refresh = useCallback(() => {
    queueMicrotask(() => setSnapshot({
      ownerKey: ownerScope?.key ?? null,
      items: ownerScope?.kind === "user" ? listGoalCloudConflicts(ownerScope) : [],
    }));
  }, [ownerScope]);
  useEffect(() => {
    refresh();
    return subscribeGoalCloudSync(refresh);
  }, [refresh]);
  const items = snapshot.ownerKey === ownerScope?.key ? snapshot.items : [];
  if (ownerScope?.kind !== "user" || items.length === 0) return null;

  const run = (action: () => boolean, success: string) => {
    setMessage(action() ? success : "Çakışma çözümü uygulanamadı; kayıt engelli kaldı.");
    refresh();
  };
  return (
    <section aria-labelledby="goal-cloud-conflicts" className="mb-5 rounded-2xl border border-[var(--app-danger)] bg-[var(--app-danger-soft)] p-4">
      <h2 id="goal-cloud-conflicts" className="text-sm font-semibold text-[var(--app-text-primary)]">Hedef Cloud çakışmaları</h2>
      <p className="mt-1 text-xs text-[var(--app-text-secondary)]">Alanlar otomatik birleştirilmez; karar verilene kadar işlem engelli kalır.</p>
      {message && <p role="status" className="mt-2 text-xs text-[var(--app-text-secondary)]">{message}</p>}
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <article key={item.operationId} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-card-bg)] p-3">
            <p className="text-sm font-medium text-[var(--app-text-primary)]">{item.definition?.title ?? item.blockedConflict?.serverDefinition?.title ?? item.goalId}</p>
            <p className="mt-1 text-xs text-[var(--app-text-secondary)]">{label(item)} · yerel r{item.expectedRevision} / bulut r{item.blockedConflict?.serverRevision ?? 0}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.blockedConflict?.kind !== "malformed_server_definition" && (
                <button type="button" onClick={() => run(() => acceptCloudGoalVersion(ownerScope, item.operationId), "Cloud sürümü yerel hedef olarak kullanıldı.")} className="rounded-lg border border-[var(--app-border)] px-2.5 py-1.5 text-xs">Cloud sürümünü kullan</button>
              )}
              <button type="button" onClick={() => run(() => overwriteCloudGoalWithLocal(ownerScope, item.operationId), "Yerel hedef güncel Cloud revision üzerine kuyruğa alındı.")} className="rounded-lg border border-[var(--app-border)] px-2.5 py-1.5 text-xs">Yerel sürümü yaz</button>
              <button type="button" onClick={() => run(() => Boolean(saveConflictingGoalAsCopy(ownerScope, item.operationId, { id: crypto.randomUUID(), now: new Date().toISOString() })), "Yerel hedef yeni UUID ile kopyalandı.")} className="rounded-lg border border-[var(--app-border)] px-2.5 py-1.5 text-xs">Yeni kopya sakla</button>
              <button type="button" onClick={() => setMessage("İşlem ertelendi; çakışma güvenli biçimde engelli kalıyor.")} className="rounded-lg border border-[var(--app-border)] px-2.5 py-1.5 text-xs">Daha sonra çöz</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
