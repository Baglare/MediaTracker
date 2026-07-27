"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSearch,
  ShieldCheck,
} from "lucide-react";
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
import type { MediaItem, ProgressLog } from "@/lib/types";

interface PortableBackupPanelProps {
  ownerScope: LocalOwnerScope | null;
  mediaList: MediaItem[];
  progressLogs: ProgressLog[];
}

const DOMAIN_LABELS: Record<PortableBackupDomain, string> = {
  mediaItems: "Medya ve grup/seri ilişkileri",
  progressLogs: "İlerleme logları",
  identityAliases: "Identity alias registry",
  recordRedirects: "Record redirect registry",
  recommendationLinks: "Recommendation local linkleri",
};

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
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const noteCount = mediaList.filter((item) =>
    typeof item.personalNotes === "string" && item.personalNotes.length > 0).length;

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
      setMessage("Aktif local owner belirlenmeden backup oluşturulamaz.");
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
      setMessage("Portable backup güvenli biçimde oluşturulamadı.");
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

  async function inspectFile(file: File) {
    if (file.size > MAX_PORTABLE_BACKUP_BYTES) {
      setInspection(null);
      setMessage("Backup dosyası 10 MiB sınırını aşıyor.");
      return;
    }
    try {
      const next = await inspectPortableBackupText(await file.text());
      setInspection(next);
      setMessage(null);
    } catch {
      setInspection(null);
      setMessage("Backup dosyası read-only inceleme için okunamadı.");
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-zinc-800/60 bg-zinc-950/25 p-3">
      <div>
        <h4 className="text-sm font-semibold text-zinc-200">Portable Backup V2</h4>
        <p className="mt-1 text-[11px] leading-5 text-zinc-500">
          Owner-neutral JSON export ve yazma yapmayan dosya incelemesi.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-zinc-300">Export domain&apos;leri</p>
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
              Personal note&apos;lar özel veri içerebilir
            </p>
            <p className="mt-1 text-[11px] leading-5 text-amber-200/70">
              {noteCount} medya kaydında not var. Varsayılan export bu içerikleri
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
          Personal note içeriklerini backup&apos;a dahil et
        </label>
      </div>

      <button
        type="button"
        onClick={prepareExport}
        disabled={!ownerScope || domains.length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ShieldCheck className="h-4 w-4" />
        Backup önizlemesi oluştur
      </button>

      {created && (
        <div className="space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-200">
            <CheckCircle2 className="h-4 w-4" />
            Checksum ile doğrulanmış export hazır
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
            Owner türü: {created.backup.manifest.ownerType} · Personal note:{" "}
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
          Backup dosyasını read-only incele
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
      </div>

      {inspection && (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/45 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-zinc-200">
              {inspection.summary.kind === "legacy"
                ? "Legacy backup tanındı"
                : `Portable V${inspection.summary.version ?? "?"} incelemesi`}
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
                {DOMAIN_LABELS[domain as PortableBackupDomain] ?? domain}
              </div>
            ))}
            <div className="rounded-lg bg-zinc-950/50 p-2">
              <strong className="block text-sm text-zinc-200">
                {inspection.summary.identity.unresolved}
              </strong>
              Unresolved identity
            </div>
            <div className="rounded-lg bg-zinc-950/50 p-2">
              <strong className="block text-sm text-zinc-200">
                {inspection.summary.relationships.orphanProgressLogs}
              </strong>
              Orphan log
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

      {message && (
        <p role="alert" className="text-center text-xs text-red-300">{message}</p>
      )}
    </div>
  );
}
