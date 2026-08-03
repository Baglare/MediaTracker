// ============================================
// Veri Yönetimi Paneli
// ============================================
// JSON export, import ve mock verilere sıfırlama işlemleri.
// İki import modu: "merge" (üstüne ekle) veya "replace" (değiştir).

"use client";

import { useState, useRef } from "react";
import {
  Download,
  Upload,
  RotateCcw,
  Database,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { MediaItem, ProgressLog } from "@/lib/types";
import {
  createBackupPayload,
  parseBackupJson,
  resolveBackupImport,
} from "@/lib/backup";
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import PortableBackupPanel from "@/components/portable-backup-panel";
import { CollapsibleSection } from "@/components/ui/collapsible-section";

interface DataManagementPanelProps {
  ownerScope: LocalOwnerScope | null;
  mediaList: MediaItem[];
  progressLogs?: ProgressLog[];
  onImport: (items: MediaItem[], logs: ProgressLog[]) => boolean;
  onReset: () => void;
  onConfirm: (title: string, message: string, onOk: () => void) => void;
}

export default function DataManagementPanel({
  ownerScope,
  mediaList,
  progressLogs = [],
  onImport,
  onReset,
  onConfirm,
}: DataManagementPanelProps) {
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Feedback mesajını 4 saniye sonra temizle */
  function showFeedback(type: "success" | "error", message: string) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }

  // ---- EXPORT ----
  function handleExport() {
    const payload = createBackupPayload(mediaList, progressLogs);
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    // Dosya adı: mediatracker-backup-2026-05-01.json
    const date = new Date().toISOString().split("T")[0];
    const filename = `mediatracker-backup-${date}.json`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showFeedback("success", `${mediaList.length} içerik dışa aktarıldı.`);
  }

  // ---- IMPORT ----
  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text !== "string") {
        showFeedback("error", "Dosya okunamadı.");
        return;
      }

      const validation = parseBackupJson(text);
      if (!validation.valid) {
        showFeedback("error", validation.error);
        return;
      }

      const importedItems = validation.items;
      const result = resolveBackupImport({
        mode: importMode,
        currentItems: mediaList,
        importedItems,
        currentLogs: progressLogs,
        importedLogs: validation.logs,
      });

      if (importMode === "replace") {
        // Replace: onay iste
        onConfirm(
          "Verileri Değiştir",
          `Mevcut ${mediaList.length} içerik silinecek ve ${importedItems.length} içerik ile değiştirilecek. Emin misin?`,
          () => {
            const persisted = onImport(result.items, result.logs);
            showFeedback(
              persisted ? "success" : "error",
              persisted ? result.message : "İçe aktarma doğrulandı ancak güvenli local write tamamlanamadı.",
            );
          }
        );
      } else {
        const persisted = onImport(result.items, result.logs);
        showFeedback(
          persisted ? "success" : "error",
          persisted ? result.message : "İçe aktarma doğrulandı ancak güvenli local write tamamlanamadı.",
        );
      }
    };

    reader.readAsText(file);

    // Input'u sıfırla (aynı dosya tekrar seçilebilsin)
    e.target.value = "";
  }

  return (
    <CollapsibleSection
      storageKey="advanced-data-management"
      title="Gelişmiş veri yönetimi"
      description="Verileri yedekle, içe veya dışa aktar ve yerel örnek verileri yönet."
      badge={<span className="rounded-md border border-[var(--app-border)] px-1.5 py-0.5 text-[10px] text-[var(--app-text-secondary)]">{mediaList.length} medya</span>}
      icon={<Database className="h-4 w-4 text-[var(--app-warning)]" />}
      className="mb-4"
      contentClassName="space-y-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-4"
    >
          <PortableBackupPanel
            key={ownerScope?.key ?? "owner-pending"}
            ownerScope={ownerScope}
            mediaList={mediaList}
            progressLogs={progressLogs}
          />

          {/* Feedback mesajı */}
          {feedback && (
            <div
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm ${
                feedback.type === "success"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}
            >
              {feedback.type === "success" ? (
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              {feedback.message}
            </div>
          )}

          {/* Export butonu */}
          <div>
            <button
              onClick={handleExport}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Verileri Dışa Aktar (JSON)
            </button>
            <p className="text-[11px] text-zinc-600 mt-1.5 text-center">
              {mediaList.length} içerik dışa aktarılacak
            </p>
          </div>

          {/* Import bölümü */}
          <div className="space-y-2">
            {/* Import modu seçimi */}
            <div className="flex gap-2">
              <button
                onClick={() => setImportMode("merge")}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  importMode === "merge"
                    ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40"
                    : "bg-zinc-800/50 text-zinc-500 ring-1 ring-zinc-700/30 hover:text-zinc-400"
                }`}
              >
                Üstüne Ekle
              </button>
              <button
                onClick={() => setImportMode("replace")}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  importMode === "replace"
                    ? "bg-red-500/20 text-red-300 ring-1 ring-red-500/40"
                    : "bg-zinc-800/50 text-zinc-500 ring-1 ring-zinc-700/30 hover:text-zinc-400"
                }`}
              >
                Tamamen Değiştir
              </button>
            </div>

            {/* Import butonu */}
            <button
              onClick={handleImportClick}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/30 hover:bg-blue-500/25 transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              JSON Dosyası Seç ve İçe Aktar
            </button>
            <p className="text-[11px] text-zinc-600 text-center">
              {importMode === "merge"
                ? "Mevcut listeye eklenir, tekrarlar atlanır"
                : "Mevcut liste silinir, dosyadaki veriler yüklenir"}
            </p>

            {/* Gizli dosya seçici */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Ayırıcı */}
          <div className="border-t border-zinc-800/50" />

          {/* Sıfırla butonu */}
          <button
            onClick={onReset}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-zinc-800/50 text-zinc-400 ring-1 ring-zinc-700/30 hover:bg-zinc-800 hover:text-zinc-300 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Mock Verilere Sıfırla
          </button>
    </CollapsibleSection>
  );
}
