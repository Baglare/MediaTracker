"use client";

import { useState } from "react";
import { MediaItem } from "@/lib/types";
import { DashboardStats } from "@/lib/dashboard-stats";
import {
  Activity,
  CheckCircle,
  PlayCircle,
  TrendingUp,
  Clock,
  History,
  ChevronDown,
  ChevronUp,
  Calendar,
  XCircle,
  PauseCircle
} from "lucide-react";
import MediaCard from "./media-card";

interface EnhancedDashboardProps {
  stats: DashboardStats;
  onSelectMedia: (item: MediaItem) => void;
  onIncrement: (id: string) => void;
  onComplete: (id: string) => void;
  onEdit: (item: MediaItem) => void;
  onToggleFavorite: (id: string) => void;
  onDeleteMedia: (id: string) => void;
}

export default function EnhancedDashboard({
  stats,
  onSelectMedia,
  onIncrement,
  onComplete,
  onEdit,
  onToggleFavorite,
  onDeleteMedia,
}: EnhancedDashboardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Format date wrapper
  function formatDate(isoStr: string) {
    const d = new Date(isoStr);
    return new Intl.DateTimeFormat("tr-TR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }

  return (
    <div className="mb-8">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800/50 flex flex-col items-center justify-center text-center">
          <Activity className="w-5 h-5 text-blue-400 mb-2" />
          <span className="text-2xl font-bold text-zinc-100">{stats.totalItems}</span>
          <span className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Toplam</span>
        </div>
        <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800/50 flex flex-col items-center justify-center text-center">
          <PlayCircle className="w-5 h-5 text-amber-400 mb-2" />
          <span className="text-2xl font-bold text-zinc-100">{stats.inProgressItems}</span>
          <span className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Devam Eden</span>
        </div>
        <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800/50 flex flex-col items-center justify-center text-center">
          <CheckCircle className="w-5 h-5 text-emerald-400 mb-2" />
          <span className="text-2xl font-bold text-zinc-100">{stats.completedItems}</span>
          <span className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Tamamlanan</span>
        </div>
        <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800/50 flex flex-col items-center justify-center text-center">
          <Calendar className="w-5 h-5 text-blue-400 mb-2" />
          <span className="text-2xl font-bold text-zinc-100">{stats.planningItems}</span>
          <span className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Planlanan</span>
        </div>
        <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800/50 flex flex-col items-center justify-center text-center">
          <PauseCircle className="w-5 h-5 text-zinc-400 mb-2" />
          <span className="text-2xl font-bold text-zinc-100">{stats.pausedItems}</span>
          <span className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Duraklatıldı</span>
        </div>
        <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800/50 flex flex-col items-center justify-center text-center">
          <XCircle className="w-5 h-5 text-red-400 mb-2" />
          <span className="text-2xl font-bold text-zinc-100">{stats.droppedItems}</span>
          <span className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Bırakıldı</span>
        </div>
        <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800/50 flex flex-col items-center justify-center text-center">
          <TrendingUp className="w-5 h-5 text-violet-400 mb-2" />
          <span className="text-2xl font-bold text-zinc-100">{stats.logsThisWeek}</span>
          <span className="text-xs text-zinc-500 uppercase tracking-wider mt-1">Aktivite (7 Gün)</span>
        </div>
      </div>

      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-zinc-900/30 hover:bg-zinc-800/50 transition-colors border border-zinc-800 rounded-lg text-sm text-zinc-400 mb-6 cursor-pointer"
      >
        {isExpanded ? (
          <>
            <span>Dashboard Gizle</span>
            <ChevronUp className="w-4 h-4" />
          </>
        ) : (
          <>
            <span>Detaylı İstatistikleri Göster</span>
            <ChevronDown className="w-4 h-4" />
          </>
        )}
      </button>

      {isExpanded && (
        <div className="space-y-6">
          {/* Nearing Completion */}
          {stats.nearingCompletion.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                Bitirmeye Yakın
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {stats.nearingCompletion.slice(0, 4).map((item) => (
                  <MediaCard
                    key={item.id}
                    item={item}
                    onIncrement={onIncrement}
                    onComplete={onComplete}
                    onEdit={onEdit}
                    onDelete={onDeleteMedia}
                    onToggleFavorite={onToggleFavorite}
                    onOpenDetail={onSelectMedia}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Dormant Items */}
          {stats.dormantItems.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                Uzun Süredir Dokunulmayanlar (14+ Gün)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {stats.dormantItems.slice(0, 4).map((item) => (
                  <MediaCard
                    key={item.id}
                    item={item}
                    onIncrement={onIncrement}
                    onComplete={onComplete}
                    onEdit={onEdit}
                    onDelete={onDeleteMedia}
                    onToggleFavorite={onToggleFavorite}
                    onOpenDetail={onSelectMedia}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Recent Logs */}
          {stats.recentLogs.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                <History className="w-4 h-4 text-blue-500" />
                Son Aktiviteler
              </h3>
              <div className="bg-zinc-900/30 rounded-xl border border-zinc-800/50 overflow-hidden">
                <div className="divide-y divide-zinc-800/50">
                  {stats.recentLogs.map((log) => (
                    <div key={log.id} className="p-3 flex items-center justify-between hover:bg-zinc-800/30 transition-colors">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-zinc-200">{log.mediaTitle}</span>
                        <span className="text-xs text-zinc-500">
                          {log.action === "increment" && "+1 eklendi"}
                          {log.action === "complete" && "Tamamlandı"}
                          {log.action === "manual_adjust" && "Manuel düzenlendi"}
                          {" "} ({log.previousProgress} → {log.newProgress} {log.unit})
                        </span>
                      </div>
                      <span className="text-xs text-zinc-600 tabular-nums">
                        {formatDate(log.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
