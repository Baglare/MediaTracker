"use client";

import { useState } from "react";
import { ProgressLog } from "@/lib/types";
import { History } from "lucide-react";

interface ActivityLogPanelProps {
  progressLogs: ProgressLog[];
}

export default function ActivityLogPanel({ progressLogs }: ActivityLogPanelProps) {
  const [filter, setFilter] = useState<"all" | "today" | "7days" | "30days">("all");

  const filteredLogs = progressLogs.filter((log) => {
    const logDate = new Date(log.createdAt);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - logDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (filter === "today") return diffDays <= 1;
    if (filter === "7days") return diffDays <= 7;
    if (filter === "30days") return diffDays <= 30;
    return true;
  });

  const sortedLogs = [...filteredLogs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  function formatDate(isoStr: string) {
    const d = new Date(isoStr);
    return new Intl.DateTimeFormat("tr-TR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }

  function getActionLabel(log: ProgressLog) {
    const { action, amount } = log;
    if (action === "added") return "Eklendi";
    if (action === "increment") return `+${amount} Eklendi`;
    if (action === "complete") return "Tamamlandı";
    if (action === "manual_adjust") return "Manuel Düzenleme";
    return action;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <History className="w-5 h-5 text-blue-400" />
          Aktivite Geçmişi
        </h2>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-hide">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | "today" | "7days" | "30days")}
            className="bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          >
            <option value="all">Tüm Zamanlar</option>
            <option value="today">Bugün</option>
            <option value="7days">Son 7 Gün</option>
            <option value="30days">Son 30 Gün</option>
          </select>
        </div>
      </div>

      {sortedLogs.length === 0 ? (
        <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800/50 p-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-full bg-zinc-800/50 flex items-center justify-center mb-4">
            <History className="w-8 h-8 text-zinc-600" />
          </div>
          <h3 className="text-lg font-medium text-zinc-300 mb-2">Henüz Aktivite Yok</h3>
          <p className="text-sm text-zinc-500 max-w-md mx-auto">
            Bir içerik eklediğinizde veya ilerleme yaptığınızda kayıtlarınız burada görünecektir.
          </p>
        </div>
      ) : (
        <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800/50 overflow-hidden">
          <div className="divide-y divide-zinc-800/50">
            {sortedLogs.map((log) => (
              <div
                key={log.id}
                className="p-4 sm:p-5 hover:bg-zinc-800/30 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-100">{log.mediaTitle}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase tracking-wider">
                      {log.mediaType}
                    </span>
                  </div>
                  <div className="text-sm text-zinc-400">
                    <span className="text-zinc-300">{getActionLabel(log)}</span>
                    <span className="mx-2 text-zinc-600">•</span>
                    {log.action === "added" ? (
                      <span>{log.detail || "Kütüphaneye eklendi"}</span>
                    ) : log.action === "complete" ? (
                      <span>Tamamı izlendi / okundu</span>
                    ) : (
                      <span>
                        {log.previousProgress} →{" "}
                        <span className="text-violet-400 font-medium">{log.newProgress}</span>{" "}
                        {log.unit}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-xs text-zinc-500 whitespace-nowrap sm:text-right">
                  {formatDate(log.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
