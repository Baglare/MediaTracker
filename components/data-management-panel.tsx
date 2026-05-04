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
  ChevronDown,
  ChevronUp,
  Database,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { MediaItem, ProgressLog } from "@/lib/types";
import {
  createBackupPayload,
  validateBackupPayload,
  mergeImportedMediaItems,
} from "@/lib/backup";

interface DataManagementPanelProps {
  mediaList: MediaItem[];
  progressLogs?: ProgressLog[];
  onImport: (items: MediaItem[], logs: ProgressLog[]) => void;
  onReset: () => void;
  onConfirm: (title: string, message: string, onOk: () => void) => void;
}

export default function DataManagementPanel({
  mediaList,
  progressLogs = [],
  onImport,
  onReset,
  onConfirm,
}: DataManagementPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
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

      // JSON parse
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        showFeedback("error", "Geçersiz JSON dosyası. Dosya bozuk olabilir.");
        return;
      }

      // Doğrula
      const validation = validateBackupPayload(parsed);
      if (!validation.valid) {
        showFeedback("error", validation.error);
        return;
      }

      const importedItems = validation.items;

      if (importMode === "replace") {
        // Replace: onay iste
        onConfirm(
          "Verileri Değiştir",
          `Mevcut ${mediaList.length} içerik silinecek ve ${importedItems.length} içerik ile değiştirilecek. Emin misin?`,
          () => {
            onImport(importedItems, validation.logs);
            showFeedback(
              "success",
              `${importedItems.length} içerik ile liste değiştirildi.`
            );
          }
        );
      } else {
        // Merge: duplicate kontrolü ile birleştir
        const result = mergeImportedMediaItems(mediaList, importedItems, progressLogs, validation.logs);
        if (result.items) {
          onImport(result.items, result.logs || []);
        }
        showFeedback("success", result.message);
      }
    };

    reader.readAsText(file);

    // Input'u sıfırla (aynı dosya tekrar seçilebilsin)
    e.target.value = "";
  }

  return (
    <div className="mb-4">
      {/* Başlık çubuğu */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/50 rounded-xl border border-zinc-800/50 hover:border-zinc-700/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <Database className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-left">
            <span className="text-sm font-medium text-zinc-200">
              Veri Yönetimi
            </span>
            <p className="text-[11px] text-zinc-500">
              Verileri dışa/içe aktarın veya sıfırlayın
            </p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-zinc-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-zinc-500" />
        )}
      </button>

      {/* Genişletilmiş panel */}
      {isExpanded && (
        <div className="mt-3 p-4 bg-zinc-900/30 rounded-xl border border-zinc-800/30 space-y-4">
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
              {mediaList.length} içerik export edilecek
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
        </div>
      )}
    </div>
  );
}
