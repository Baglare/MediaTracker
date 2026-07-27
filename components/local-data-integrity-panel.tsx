"use client";

import { useMemo, useState } from "react";
import {
  AlertOctagon,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ShieldCheck,
  ShieldEllipsis,
  Undo2,
  Wrench,
  X,
} from "lucide-react";
import { useLocalDataIntegrity } from "@/hooks/use-local-data-integrity";
import type {
  IntegrityDomain,
  IntegrityRepairability,
  IntegritySeverity,
} from "@/lib/local-data-integrity";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import type { MediaItem, ProgressLog } from "@/lib/types";

interface LocalDataIntegrityPanelProps {
  ownerScope: LocalOwnerScope | null;
  mediaList: MediaItem[];
  progressLogs: ProgressLog[];
}

const SEVERITY_LABELS: Record<IntegritySeverity, string> = {
  critical: "Kritik",
  error: "Hata",
  warning: "Uyarı",
  info: "Bilgi",
};

const SEVERITY_STYLES: Record<IntegritySeverity, string> = {
  critical: "border-rose-500/25 bg-rose-500/5 text-rose-200",
  error: "border-orange-500/25 bg-orange-500/5 text-orange-200",
  warning: "border-amber-500/25 bg-amber-500/5 text-amber-200",
  info: "border-sky-500/25 bg-sky-500/5 text-sky-200",
};

const REPAIRABILITY_LABELS: Record<IntegrityRepairability, string> = {
  safe: "Güvenli tamir adayı",
  "requires-confirmation": "Kullanıcı onayı gerekir",
  "manual-only": "Manuel recovery gerekir",
};

const DOMAIN_LABELS: Record<IntegrityDomain, string> = {
  media: "Medya",
  identity: "Kimlik",
  "identity-alias": "Kimlik alias",
  "record-redirect": "Record redirect",
  "progress-log": "İlerleme logu",
  group: "Grup / seri",
  "recommendation-link": "Öneri bağlantısı",
  "duplicate-review": "Duplicate kararı",
  "merge-journal": "Merge journal",
  "cloud-queue": "Cloud queue",
  envelope: "Storage envelope",
};

export default function LocalDataIntegrityPanel({
  ownerScope,
  mediaList,
  progressLogs,
}: LocalDataIntegrityPanelProps) {
  const controller = useLocalDataIntegrity(ownerScope, mediaList, progressLogs);
  const [isExpanded, setIsExpanded] = useState(false);
  const itemById = useMemo(
    () => new Map(mediaList.map((item) => [item.id, item])),
    [mediaList],
  );
  const issueCount = controller.report?.issues.length ?? 0;
  const domainCounts = controller.report
    ? Object.entries(controller.report.counts.domain)
        .filter((entry): entry is [IntegrityDomain, number] => typeof entry[1] === "number")
    : [];

  return (
    <section className="mb-4">
      <button
        type="button"
        onClick={() => setIsExpanded((value) => !value)}
        className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-zinc-800/50 bg-zinc-900/50 px-4 py-3 transition-colors hover:border-zinc-700/50"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
            <ShieldEllipsis className="h-4 w-4 text-emerald-300" />
          </div>
          <div className="text-left">
            <span className="text-sm font-medium text-zinc-200">Veri Bütünlüğü</span>
            <p className="text-[11px] text-zinc-500">
              {controller.status === "pending"
                ? "Aktif owner veri grafiği taranıyor"
                : issueCount === 0
                  ? "Yerel veri grafiği sağlıklı"
                  : `${issueCount} açıklanabilir sorun bulundu`}
            </p>
          </div>
        </div>
        {isExpanded
          ? <ChevronUp className="h-4 w-4 text-zinc-500" />
          : <ChevronDown className="h-4 w-4 text-zinc-500" />}
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-4 rounded-xl border border-zinc-800/30 bg-zinc-900/30 p-4">
          <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs leading-5 text-emerald-200">
            Bu tarama salt okunurdur. Medya, log, registry, queue veya recovery
            kayıtlarını değiştirmez ve otomatik tamir uygulamaz.
          </p>

          {controller.status === "recovery-required" && (
            <div
              role="alert"
              className="flex gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs leading-5 text-rose-100"
            >
              <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" />
              Recovery gerektiren kritik local veri durumu bulundu. Yeni veri
              yazmadan önce aşağıdaki journal, owner veya envelope sorununu incele.
            </div>
          )}

          {controller.repairMessage && (
            <div
              role="status"
              className="rounded-xl border border-zinc-700 bg-zinc-950/50 p-3 text-xs leading-5 text-zinc-300"
            >
              {controller.repairMessage}
            </div>
          )}

          {controller.repairJournal?.state === "recovery-required" && (
            <button
              type="button"
              onClick={controller.recoverRepair}
              className="flex items-center gap-1.5 rounded-lg bg-rose-500/15 px-3 py-2 text-xs font-medium text-rose-200 hover:bg-rose-500/25"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Güvenli rollback&apos;u dene
            </button>
          )}

          {controller.repairJournal?.state === "completed"
            && controller.repairJournal.plan.kind !== "recover-merge-journal" && (
            <button
              type="button"
              onClick={controller.undoLastRepair}
              className="flex items-center gap-1.5 rounded-lg bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-200 hover:bg-sky-500/20"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Son repair&apos;i geri al
            </button>
          )}

          {controller.repairPlan && (
            <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-emerald-100">
                    {controller.repairPlan.preview.title}
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-emerald-200/80">
                    {controller.repairPlan.preview.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={controller.cancelRepair}
                  aria-label="Repair önizlemesini kapat"
                  className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[10px] text-zinc-400">
                <div className="rounded-lg bg-zinc-950/45 p-2">
                  <strong className="block text-sm text-zinc-200">
                    {controller.repairPlan.preview.affectedRecordCount}
                  </strong>
                  record
                </div>
                <div className="rounded-lg bg-zinc-950/45 p-2">
                  <strong className="block text-sm text-zinc-200">
                    {controller.repairPlan.preview.affectedLogCount}
                  </strong>
                  log
                </div>
                <div className="rounded-lg bg-zinc-950/45 p-2">
                  <strong className="block text-sm text-zinc-200">
                    {controller.repairPlan.preview.affectedGroupCount}
                  </strong>
                  grup
                </div>
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {controller.repairPlan.preview.changes.map((change) => (
                  <div
                    key={`${change.domain}:${change.entityId}:${change.field}`}
                    className="rounded-lg bg-zinc-950/45 p-2 text-[10px] text-zinc-400"
                  >
                    <p className="font-medium text-zinc-300">
                      {change.domain} · {change.entityId} · {change.field}
                    </p>
                    <p className="mt-1 break-all">
                      {change.before} → {change.after}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] leading-4 text-amber-200/80">
                Yalnız bu issue onarılacak. İşlem owner ve source fingerprint&apos;ini
                yeniden doğrular; hata halinde before state&apos;e rollback dener.
              </p>
              <button
                type="button"
                onClick={controller.confirmRepair}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30"
              >
                <Wrench className="h-3.5 w-3.5" />
                Onayla ve bu repair&apos;i uygula
              </button>
            </div>
          )}

          {controller.report && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.keys(SEVERITY_LABELS) as IntegritySeverity[]).map((severity) => (
                  <div
                    key={severity}
                    className={`rounded-xl border p-3 ${SEVERITY_STYLES[severity]}`}
                  >
                    <p className="text-lg font-semibold">
                      {controller.report?.counts.severity[severity] ?? 0}
                    </p>
                    <p className="text-[11px] opacity-75">{SEVERITY_LABELS[severity]}</p>
                  </div>
                ))}
              </div>

              {domainCounts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {domainCounts.map(([domain, count]) => (
                    <span
                      key={domain}
                      className="rounded-full bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400"
                    >
                      {DOMAIN_LABELS[domain]}: {count}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
            <span>
              {controller.report
                ? `${controller.report.scannedMediaCount} medya ve ${controller.report.scannedLogCount} log tarandı`
                : "Tarama sonucu bekleniyor"}
            </span>
            <button
              type="button"
              onClick={controller.rescan}
              disabled={!ownerScope || controller.status === "pending"}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Yeniden tara
            </button>
          </div>

          {controller.status === "pending" ? (
            <div className="rounded-xl border border-zinc-800 p-4 text-center text-sm text-zinc-500">
              Aktif owner verisi taranıyor…
            </div>
          ) : issueCount === 0 ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
              <ShieldCheck className="mx-auto mb-2 h-5 w-5 text-emerald-400" />
              <p className="text-sm text-emerald-200">
                Taranan local veri grafiğinde bütünlük sorunu bulunmadı.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {controller.report?.issues.map((issue) => {
                const safeRecords = issue.affectedRecordIds.map((recordId) => {
                  const item = itemById.get(recordId);
                  return item ? `${item.title} (${recordId})` : recordId;
                });
                return (
                  <article
                    key={issue.id}
                    className={`rounded-xl border p-3 ${SEVERITY_STYLES[issue.severity]}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold">{issue.code}</p>
                        <p className="mt-1 text-[11px] leading-5 opacity-80">
                          {issue.evidence.summary}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px]">
                          {DOMAIN_LABELS[issue.domain]}
                        </span>
                        <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px]">
                          {REPAIRABILITY_LABELS[issue.repairability]}
                        </span>
                      </div>
                    </div>
                    {(safeRecords.length > 0 || issue.affectedLogIds.length > 0) && (
                      <p className="mt-2 break-words text-[10px] opacity-70">
                        {safeRecords.length > 0 ? `Kayıt: ${safeRecords.join(", ")}` : ""}
                        {safeRecords.length > 0 && issue.affectedLogIds.length > 0 ? " • " : ""}
                        {issue.affectedLogIds.length > 0
                          ? `Log: ${issue.affectedLogIds.join(", ")}`
                          : ""}
                      </p>
                    )}
                    <p className="mt-2 text-[10px] opacity-70">{issue.recommendation}</p>
                    {issue.repairability === "safe" && !controller.repairPlan && (
                      <button
                        type="button"
                        onClick={() => controller.prepareRepair(issue.id)}
                        className="mt-3 flex items-center gap-1.5 rounded-lg bg-black/20 px-2.5 py-1.5 text-[10px] font-medium hover:bg-black/30"
                      >
                        <Wrench className="h-3 w-3" />
                        Düzeltmeyi hazırla
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
