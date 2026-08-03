"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSearch,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import {
  executePortableAdditiveImport,
  inspectPortableImportUndo,
  preparePortableAdditiveImport,
  recoverPendingPortableImport,
  undoLastPortableImport,
  type PortableImportPlan,
} from "@/lib/portable-additive-import";
import {
  MAX_PORTABLE_BACKUP_BYTES,
  PORTABLE_BACKUP_DOMAINS,
  collectPortableBackupSource,
  createPortableBackup,
  inspectPortableBackupText,
  portableBackupFilename,
  type CreatedPortableBackup,
  type PortableBackupDomain,
  type PortableBackupInspectionResult,
} from "@/lib/portable-backup";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { flush } from "@/lib/sync-manager";
import type { MediaItem, ProgressLog } from "@/lib/types";

interface PortableBackupPanelProps {
  ownerScope: LocalOwnerScope | null;
  mediaList: MediaItem[];
  progressLogs: ProgressLog[];
}

const DOMAIN_LABELS: Record<PortableBackupDomain, string> = {
  mediaItems: "Medya ve grup/seri ilişkileri",
  progressLogs: "İlerleme günlükleri",
  identityAliases: "Kimlik eşleme kayıtları",
  recordRedirects: "Kayıt yönlendirmeleri",
  recommendationLinks: "Yerel öneri bağlantıları",
};

function ownerTypeLabel(value: string): string {
  if (value === "user") return "Hesap";
  if (value === "guest") return "Misafir";
  return "Bilinmiyor";
}

function importDecisionLabel(value: string): string {
  const labels: Record<string, string> = {
    add: "Ekle",
    "skip-existing-id": "Mevcut kimliği atla",
    "skip-exact": "Kesin kopyayı atla",
    "add-exact-copy": "Kesin kopyayı ayrı ekle",
    remap: "İlişkiyi yeniden eşle",
    skip: "Atla",
  };
  return labels[value] ?? "İnceleme gerekli";
}

export default function PortableBackupPanel({
  ownerScope,
  mediaList,
  progressLogs,
}: PortableBackupPanelProps) {
  const [domains, setDomains] = useState<PortableBackupDomain[]>([
    ...PORTABLE_BACKUP_DOMAINS,
  ]);
  const [includePersonalNotes, setIncludePersonalNotes] = useState(false);
  const [created, setCreated] = useState<CreatedPortableBackup | null>(null);
  const [inspection, setInspection] =
    useState<PortableBackupInspectionResult | null>(null);
  const [inspectedText, setInspectedText] = useState<string | null>(null);
  const [importPlan, setImportPlan] = useState<PortableImportPlan | null>(null);
  const [exactCopies, setExactCopies] = useState<string[]>([]);
  const [importConfirmed, setImportConfirmed] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ownerKeyRef = useRef(ownerScope?.key ?? null);
  useSyncStatus();
  const undoAvailability = ownerScope
    ? inspectPortableImportUndo(ownerScope)
    : {
        available: false as const,
        code: "no_import" as const,
        message: "Etkin sahip belirlenmeden geri alma kullanılamaz.",
        pendingQueueCount: 0,
      };
  const noteCount = mediaList.filter((item) =>
    typeof item.personalNotes === "string" && item.personalNotes.length > 0).length;

  useEffect(() => () => {
    ownerKeyRef.current = null;
  }, []);

  function toggleDomain(domain: PortableBackupDomain) {
    setDomains((current) =>
      current.includes(domain)
        ? current.filter((entry) => entry !== domain)
        : [...current, domain]);
    setCreated(null);
    setMessage(null);
  }

  async function prepareExport() {
    if (!ownerScope) {
      setMessage("Etkin yerel sahip belirlenmeden yedek oluşturulamaz.");
      return;
    }
    const source = collectPortableBackupSource(
      ownerScope,
      mediaList,
      progressLogs,
    );
    if (!source.ok) {
      setMessage(source.error);
      return;
    }
    try {
      const next = await createPortableBackup(source.source, {
        exportedAt: new Date().toISOString(),
        includePersonalNotes,
        domains,
      });
      setCreated(next);
      setMessage(null);
    } catch {
      setCreated(null);
      setMessage("Taşınabilir yedek güvenli biçimde oluşturulamadı.");
    }
  }

  function downloadPreparedBackup() {
    if (!created) return;
    const blob = new Blob([created.serialized], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = portableBackupFilename(created.backup.manifest.exportedAt);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  async function prepareImportPlan(
    text: string,
    copyRecordIds: string[] = exactCopies,
  ) {
    const scope = ownerScope;
    if (!scope) {
      setMessage("Etkin yerel sahip belirlenmeden içe aktarma planlanamaz.");
      return;
    }
    const generationKey = scope.key;
    setImportBusy(true);
    setImportConfirmed(false);
    setImportStatus(null);
    setRecoveryRequired(false);
    const prepared = await preparePortableAdditiveImport(scope, text, {
      exactDuplicateCopyRecordIds: copyRecordIds,
    });
    if (ownerKeyRef.current !== generationKey) return;
    setImportBusy(false);
    if (!prepared.ok) {
      setImportPlan(null);
      setMessage(prepared.message);
      return;
    }
    setImportPlan(prepared.plan);
    setMessage(null);
  }

  async function inspectFile(file: File) {
    if (file.size > MAX_PORTABLE_BACKUP_BYTES) {
      setInspection(null);
      setInspectedText(null);
      setImportPlan(null);
      setMessage("Yedek dosyası 10 MiB sınırını aşıyor.");
      return;
    }
    try {
      const text = await file.text();
      const next = await inspectPortableBackupText(text);
      setInspection(next);
      setInspectedText(next.status === "valid" ? text : null);
      setImportPlan(null);
      setExactCopies([]);
      setMessage(null);
      if (next.status === "valid") void prepareImportPlan(text, []);
    } catch {
      setInspection(null);
      setInspectedText(null);
      setImportPlan(null);
      setMessage("Yedek dosyası salt okunur inceleme için okunamadı.");
    }
  }

  async function toggleExactCopy(recordId: string) {
    if (!inspectedText) return;
    const next = exactCopies.includes(recordId)
      ? exactCopies.filter((entry) => entry !== recordId)
      : [...exactCopies, recordId];
    setExactCopies(next);
    await prepareImportPlan(inspectedText, next);
  }

  async function applyImport() {
    const scope = ownerScope;
    if (!scope || !inspectedText || !importPlan || !importConfirmed) return;
    const generationKey = scope.key;
    setImportBusy(true);
    setMessage(null);
    const result = await executePortableAdditiveImport(
      scope,
      inspectedText,
      importPlan,
      {
        isOwnerActive: (activeScope) =>
          ownerKeyRef.current === activeScope.key,
        triggerSync: () => { void flush(); },
      },
    );
    if (ownerKeyRef.current !== generationKey) return;
    setImportBusy(false);
    if (!result.ok) {
      setRecoveryRequired(result.recoveryRequired);
      setMessage(result.message);
      return;
    }
    setRecoveryRequired(false);
    const successMessage =
      result.state === "sync-pending"
        ? "Eklemeli içe aktarma doğrulandı; Cloud işlemleri kalıcı kuyrukta bekliyor."
        : result.idempotent
          ? "Bu yedek zaten uygulanmış; yeni kopya oluşturulmadı."
          : "Eklemeli içe aktarma tamamlandı ve yeniden okuma ile doğrulandı.";
    setImportConfirmed(false);
    await prepareImportPlan(inspectedText, exactCopies);
    if (ownerKeyRef.current === generationKey) setImportStatus(successMessage);
  }

  async function recoverImport() {
    if (!ownerScope) return;
    const generationKey = ownerScope.key;
    const result = recoverPendingPortableImport(ownerScope);
    if (result?.ok === false) {
      setMessage(result.message);
      setRecoveryRequired(result.recoveryRequired);
      return;
    }
    setRecoveryRequired(false);
    setMessage(null);
    if (inspectedText) {
      await prepareImportPlan(inspectedText, exactCopies);
    }
    if (ownerKeyRef.current === generationKey) {
      setImportStatus("İçe aktarma kurtarması, işlem öncesi anlık görüntü ile tamamlandı.");
    }
  }

  async function undoImport() {
    if (!ownerScope) return;
    const generationKey = ownerScope.key;
    const result = undoLastPortableImport(ownerScope);
    if (!result.ok) {
      setMessage(result.message);
      setRecoveryRequired(result.recoveryRequired);
      return;
    }
    setRecoveryRequired(false);
    setMessage(null);
    if (inspectedText) {
      await prepareImportPlan(inspectedText, exactCopies);
    }
    if (ownerKeyRef.current === generationKey) {
      setImportStatus("Son eklemeli içe aktarma geri alındı; işlem öncesi durum doğrulandı.");
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-zinc-800/60 bg-zinc-950/25 p-3">
      <div>
        <h4 className="text-sm font-semibold text-zinc-200">Taşınabilir Yedek V2</h4>
        <p className="mt-1 text-[11px] leading-5 text-zinc-500">
          Sahipten bağımsız JSON dışa aktarma ve yazma yapmayan dosya incelemesi.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-zinc-300">Dışa aktarılacak veri alanları</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {PORTABLE_BACKUP_DOMAINS.map((domain) => (
            <label
              key={domain}
              className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/45 px-3 py-2 text-[11px] text-zinc-400"
            >
              <input
                type="checkbox"
                checked={domains.includes(domain)}
                onChange={() => toggleDomain(domain)}
                className="accent-emerald-500"
              />
              {DOMAIN_LABELS[domain]}
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <p className="text-xs font-medium text-amber-200">
              Kişisel notlar özel veri içerebilir
            </p>
            <p className="mt-1 text-[11px] leading-5 text-amber-200/70">
              {noteCount} medya kaydında not var. Varsayılan dışa aktarma bu içerikleri
              dışarıda bırakır.
            </p>
          </div>
        </div>
        <label className="mt-2 flex items-center gap-2 text-[11px] text-amber-100/80">
          <input
            type="checkbox"
            checked={includePersonalNotes}
            disabled={!domains.includes("mediaItems")}
            onChange={(event) => {
              setIncludePersonalNotes(event.target.checked);
              setCreated(null);
            }}
            className="accent-amber-500"
          />
          Kişisel not içeriklerini yedeğe dahil et
        </label>
      </div>

      <button
        type="button"
        onClick={prepareExport}
        disabled={!ownerScope || domains.length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ShieldCheck className="h-4 w-4" />
        Yedek önizlemesi oluştur
      </button>

      {created && (
        <div className="space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-200">
            <CheckCircle2 className="h-4 w-4" />
            Sağlama toplamı ile doğrulanmış dışa aktarım hazır
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-400 sm:grid-cols-3">
            {created.backup.manifest.domains.map((domain) => (
              <div key={domain} className="rounded-lg bg-zinc-950/50 p-2">
                <strong className="block text-sm text-zinc-200">
                  {created.backup.manifest.counts[domain]}
                </strong>
                {DOMAIN_LABELS[domain]}
              </div>
            ))}
            <div className="rounded-lg bg-zinc-950/50 p-2">
              <strong className="block text-sm text-zinc-200">
                {(created.byteSize / 1024).toFixed(1)} KiB
              </strong>
              Dosya boyutu
            </div>
          </div>
          <p className="text-[10px] text-zinc-500">
            Sahip türü: {ownerTypeLabel(created.backup.manifest.ownerType)} · Kişisel not:{" "}
            {created.backup.manifest.privacy.personalNotesIncluded
              ? "dahil"
              : "hariç"}
          </p>
          <button
            type="button"
            onClick={downloadPreparedBackup}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30"
          >
            <Download className="h-4 w-4" />
            JSON dosyasını indir
          </button>
        </div>
      )}

      <div className="border-t border-zinc-800/70 pt-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500/15 px-4 py-2.5 text-sm font-medium text-sky-300 ring-1 ring-sky-500/30 hover:bg-sky-500/25"
        >
          <FileSearch className="h-4 w-4" />
          Yedek dosyasını salt okunur incele
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void inspectFile(file);
            event.target.value = "";
          }}
        />
        <p className="mt-2 text-center text-[11px] text-zinc-500">
          Dosya inceleme verilerinizi değiştirmez.
        </p>
        <p className="mt-1 text-center text-[10px] text-zinc-600">
          SHA-256 yalnız dosya bütünlüğünü doğrular; dosyanın kaynağını doğrulamaz.
        </p>
      </div>

      {inspection && (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/45 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-zinc-200">
              {inspection.summary.kind === "legacy"
                 ? "Eski yedek tanındı"
                 : `Taşınabilir V${inspection.summary.version ?? "?"} incelemesi`}
            </p>
            <div className="flex gap-2 text-[10px]">
              <span className="rounded-full bg-red-500/10 px-2 py-1 text-red-300">
                {inspection.errorCount} hata
              </span>
              <span className="rounded-full bg-amber-500/10 px-2 py-1 text-amber-300">
                {inspection.warningCount} uyarı
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-400 sm:grid-cols-3">
            {Object.entries(inspection.summary.counts).map(([domain, count]) => (
              <div key={domain} className="rounded-lg bg-zinc-950/50 p-2">
                <strong className="block text-sm text-zinc-200">{count}</strong>
                {DOMAIN_LABELS[domain as PortableBackupDomain] ?? "Bilinmeyen veri alanı"}
              </div>
            ))}
            <div className="rounded-lg bg-zinc-950/50 p-2">
              <strong className="block text-sm text-zinc-200">
                {inspection.summary.identity.unresolved}
              </strong>
               Çözümlenemeyen kimlik
            </div>
            <div className="rounded-lg bg-zinc-950/50 p-2">
              <strong className="block text-sm text-zinc-200">
                {inspection.summary.relationships.orphanProgressLogs}
              </strong>
               Sahipsiz günlük
            </div>
          </div>
          {inspection.issues.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto text-[10px]">
              {inspection.issues.map((issue, index) => (
                <li
                  key={`${issue.code}:${index}`}
                  className={issue.severity === "error"
                    ? "text-red-300"
                    : "text-amber-300"}
                >
                  {issue.code}: {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {inspection?.status === "valid" && inspectedText && (
        <div className="space-y-3 rounded-xl border border-violet-500/25 bg-violet-500/5 p-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-violet-200">
              <Upload className="h-4 w-4" />
              Kontrollü eklemeli içe aktarma
            </div>
            <p className="mt-1 text-[11px] leading-5 text-violet-100/70">
               Önce deneme planı gösterilir. Mevcut kayıtlar silinmez, değiştirme veya
              tekrarlanan kayıt birleştirmesi yapılmaz.
            </p>
          </div>

          {importBusy && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Plan güncel sahip durumuyla doğrulanıyor…
            </div>
          )}

          {importPlan && (
            <>
              <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-400 sm:grid-cols-3">
                <div className="rounded-lg bg-zinc-950/50 p-2">
                  <strong className="block text-sm text-emerald-300">
                    {importPlan.counts.mediaAdd}
                  </strong>
                  Eklenecek medya
                </div>
                <div className="rounded-lg bg-zinc-950/50 p-2">
                  <strong className="block text-sm text-zinc-200">
                    {importPlan.counts.mediaSkip}
                  </strong>
                  Atlanacak medya
                </div>
                <div className="rounded-lg bg-zinc-950/50 p-2">
                  <strong className="block text-sm text-amber-300">
                    {importPlan.counts.mediaExact}
                  </strong>
                   Kesin kopya
                </div>
                <div className="rounded-lg bg-zinc-950/50 p-2">
                  <strong className="block text-sm text-emerald-300">
                    {importPlan.counts.logAdd}
                  </strong>
                   Eklenecek günlük
                </div>
                <div className="rounded-lg bg-zinc-950/50 p-2">
                  <strong className="block text-sm text-sky-300">
                    {importPlan.counts.relationshipRemaps}
                  </strong>
                   Yeniden eşlenen ilişki
                </div>
                <div className="rounded-lg bg-zinc-950/50 p-2">
                  <strong className="block text-sm text-red-300">
                    {importPlan.blockers.length}
                  </strong>
                   Engelleyici
                </div>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2 text-[10px] leading-5 text-zinc-400">
                <p>Yedek sahip türü: {ownerTypeLabel(importPlan.backupOwnerType)}</p>
                <p>Seçili veri alanı: {importPlan.selectedDomains.length}</p>
                <p>Kimlik eşlemesi eklenecek: {importPlan.counts.aliasesAdd}</p>
                <p>Kayıt yönlendirmesi eklenecek: {importPlan.counts.redirectsAdd}</p>
                <p>Öneri bağlantısı eklenecek: {importPlan.counts.recommendationLinksAdd}</p>
                <p>
                   Cloud: {ownerScope?.kind === "user"
                     ? `${importPlan.cloudOperationCount} kalıcı kayıt işlemi`
                     : "Misafir kapsamı için kuyruk üretilmez"}
                </p>
              </div>

              {ownerScope?.kind === "user" && importPlan.cloudOperationCount > 0 && (
                <div className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-2 text-[11px] leading-5 text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                   Cloud eşitleme başladıktan, tamamlandıktan veya sonucu belirsiz kaldıktan
                   sonra bu içe aktarma yerel geri alma ile geri alınamaz. Geri alma yalnız kuyruk
                   işlemleri henüz gönderilmediyse kullanılabilir.
                </div>
              )}

              {importPlan.personalNotesPresent && (
                <div className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-2 text-[11px] text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  Yedek kişisel not içeriyor. İçerik bu özette gösterilmez; seçili
                  medya kaydıyla birlikte yerel sahip kapsamına eklenir.
                </div>
              )}

              {importPlan.mediaDecisions.length > 0 && (
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {importPlan.mediaDecisions.map((decision) => (
                    <div
                      key={decision.sourceRecordId}
                      className="rounded-lg border border-zinc-800 bg-zinc-950/35 p-2 text-[10px]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-zinc-300">
                            {decision.sourceRecordId}
                          </p>
                          <p className="text-zinc-500">{decision.reason}</p>
                          {decision.targetRecordId
                            && decision.targetRecordId !== decision.sourceRecordId && (
                            <p className="text-sky-300">
                              Hedef/remap: {decision.targetRecordId}
                            </p>
                          )}
                          <p className="text-zinc-600">
                             Kişisel not: {decision.hasPersonalNote ? "var" : "yok"}
                          </p>
                        </div>
                        <span className="rounded-full bg-zinc-800 px-2 py-1 text-zinc-300">
                           {importDecisionLabel(decision.status)}
                        </span>
                      </div>
                      {(decision.status === "skip-exact"
                        || decision.status === "add-exact-copy") && (
                        <label className="mt-2 flex items-center gap-2 text-amber-200">
                          <input
                            type="checkbox"
                            checked={exactCopies.includes(decision.sourceRecordId)}
                            disabled={importBusy}
                            onChange={() => { void toggleExactCopy(decision.sourceRecordId); }}
                            className="accent-amber-500"
                          />
                          Açık seçim: ayrı yerel kayıt olarak ekle
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {importPlan.logDecisions.length > 0 && (
                <details className="rounded-lg border border-zinc-800 p-2 text-[10px]">
                  <summary className="cursor-pointer text-zinc-300">
                    İlerleme günlüğü deneme kararları ({importPlan.logDecisions.length})
                  </summary>
                  <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-zinc-500">
                    {importPlan.logDecisions.map((decision) => (
                      <li key={decision.sourceLogId}>
                        {decision.sourceLogId}: {decision.status}
                        {decision.remapped ? ` → ${decision.targetMediaId}` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {importPlan.blockers.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-red-500/25 bg-red-500/5 p-2 text-[10px] text-red-300">
                  {importPlan.blockers.map((blocker, index) => (
                    <li key={`${blocker.code}:${blocker.recordId ?? index}`}>
                      {blocker.code}: {blocker.message}
                    </li>
                  ))}
                </ul>
              )}

              <label className="flex gap-2 text-[11px] text-violet-100">
                <input
                  type="checkbox"
                  checked={importConfirmed}
                  disabled={importBusy || importPlan.blockers.length > 0}
                  onChange={(event) => setImportConfirmed(event.target.checked)}
                  className="accent-violet-500"
                />
                 Bu deneme planının yalnız yeni ve açıkça seçilmiş kayıtları eklemesini
                onaylıyorum.
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { void prepareImportPlan(inspectedText, exactCopies); }}
                  disabled={importBusy}
                  className="rounded-lg bg-zinc-800 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
                >
                  Planı yeniden doğrula
                </button>
                <button
                  type="button"
                  onClick={() => { void applyImport(); }}
                  disabled={
                    importBusy
                    || !importConfirmed
                    || importPlan.blockers.length > 0
                    || !importPlan.hasChanges
                  }
                  className="rounded-lg bg-violet-500/20 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Eklemeli içe aktarmayı uygula
                </button>
                <button
                  type="button"
                  onClick={() => { void undoImport(); }}
                  disabled={importBusy || !undoAvailability.available}
                  className="flex items-center gap-1 rounded-lg bg-amber-500/15 px-3 py-2 text-xs text-amber-200 hover:bg-amber-500/25 disabled:opacity-40"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Son içe aktarmayı geri al
                </button>
              </div>
              <p
                className={`text-[10px] ${
                  undoAvailability.available ? "text-emerald-300" : "text-amber-300"
                }`}
              >
                 Geri alma: {undoAvailability.message}
              </p>
            </>
          )}

          {recoveryRequired && (
            <button
              type="button"
              onClick={() => { void recoverImport(); }}
              className="w-full rounded-lg bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/25"
            >
              Kurtarma günlüğünü işlem öncesi anlık görüntü ile geri al
            </button>
          )}

          {importStatus && (
            <div className="flex gap-2 rounded-lg bg-emerald-500/10 p-2 text-xs text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {importStatus}
            </div>
          )}
        </div>
      )}

      {message && (
        <p role="alert" className="text-center text-xs text-red-300">{message}</p>
      )}
    </div>
  );
}
