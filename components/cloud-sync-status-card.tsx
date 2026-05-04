"use client";

// ============================================
// Cloud Sync Hazırlık + Durum Kartı
// ============================================
// Yapılandırma + auth + sync manager snapshot'ını birleştirir.
// "Şimdi senkronize et" butonu bekleyen item'ları manuel olarak flush eder.

import { Cloud, CloudOff, RefreshCcw, Loader2, AlertTriangle, WifiOff, UserX } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { clearOrphanedQueue, syncNow } from "@/lib/sync-manager";

export default function CloudSyncStatusCard() {
  const { configured, user, loading } = useAuth();
  const sync = useSyncStatus();

  const isCloudReady = configured && !!user;
  const headerLabel = isCloudReady ? "Cloud Hazır" : "Yerel Mod";

  let description: string;
  if (!configured) {
    description = "Cloud sync henüz yapılandırılmadı. Verilerin bu tarayıcıda saklanıyor.";
  } else if (!user) {
    description = "Supabase yapılandırıldı. Cloud sync için giriş yapabilirsin.";
  } else if (sync.pending > 0 && !sync.online) {
    description = "Çevrimdışısın. Bekleyen cloud işlemleri internet geldiğinde otomatik gönderilecek.";
  } else if (sync.pending > 0) {
    description =
      "Bekleyen cloud işlemleri arka planda gönderiliyor. " +
      "Bir +1 işlemi 2 cloud işlemi (içerik + aktivite) üretebilir; bu normaldir.";
  } else {
    description = "Tüm değişiklikler senkronize. Yeni mutasyonlar otomatik gönderilecek.";
  }

  const Icon = isCloudReady ? Cloud : CloudOff;
  const iconCls = isCloudReady ? "text-emerald-400" : "text-zinc-500";

  // Status badge (mod altında)
  let statusBadge: { text: string; cls: string } | null = null;
  if (sync.syncing) {
    statusBadge = {
      text: "Senkron ediliyor",
      cls: "text-violet-300 bg-violet-500/10 ring-1 ring-violet-500/30",
    };
  } else if (!sync.online) {
    statusBadge = {
      text: "Çevrimdışı",
      cls: "text-amber-300 bg-amber-500/10 ring-1 ring-amber-500/30",
    };
  } else if (sync.lastError && sync.pending > 0) {
    statusBadge = {
      text: "Hata",
      cls: "text-rose-300 bg-rose-500/10 ring-1 ring-rose-500/30",
    };
  } else if (sync.pending > 0) {
    statusBadge = {
      text: "Bekliyor",
      cls: "text-amber-300 bg-amber-500/10 ring-1 ring-amber-500/30",
    };
  } else if (isCloudReady) {
    statusBadge = {
      text: "Senkron",
      cls: "text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/30",
    };
  }

  const canSyncNow = isCloudReady && sync.online && !sync.syncing && sync.pending > 0;

  return (
    <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800/50 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon className={`w-5 h-5 ${iconCls}`} />
        <h3 className="text-lg font-semibold text-zinc-100">Cloud Sync Durumu</h3>
      </div>

      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-zinc-400">Yapılandırma</span>
          <span
            className={
              configured
                ? "text-emerald-300 text-xs px-2 py-1 rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/30"
                : "text-zinc-400 text-xs px-2 py-1 rounded-md bg-zinc-800/60 ring-1 ring-zinc-700/40"
            }
          >
            {configured ? "Algılandı" : "Yapılandırılmadı"}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-zinc-400">Mod</span>
          <span
            className={
              isCloudReady
                ? "text-emerald-300 text-xs px-2 py-1 rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/30"
                : "text-zinc-200 text-xs px-2 py-1 rounded-md bg-zinc-800/60 ring-1 ring-zinc-700/40"
            }
          >
            {headerLabel}
          </span>
        </div>

        {statusBadge && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-zinc-400">Durum</span>
            <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md ${statusBadge.cls}`}>
              {sync.syncing && <Loader2 className="w-3 h-3 animate-spin" />}
              {!sync.online && !sync.syncing && <WifiOff className="w-3 h-3" />}
              {sync.lastError && sync.pending > 0 && !sync.syncing && sync.online && (
                <AlertTriangle className="w-3 h-3" />
              )}
              {statusBadge.text}
            </span>
          </div>
        )}

        {configured && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-zinc-400">Hesap</span>
            <span className="text-zinc-200 text-xs px-2 py-1 rounded-md bg-zinc-800/60 ring-1 ring-zinc-700/40 truncate max-w-[60%]">
              {loading ? "Kontrol ediliyor…" : user?.email ?? "Giriş yapılmadı"}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <span className="text-zinc-400">Bekleyen Cloud İşlemi</span>
          <span
            className={
              sync.pending > 0
                ? "text-amber-300 text-xs px-2 py-1 rounded-md bg-amber-500/10 ring-1 ring-amber-500/30"
                : "text-zinc-200 text-xs px-2 py-1 rounded-md bg-zinc-800/60 ring-1 ring-zinc-700/40"
            }
          >
            {sync.pending}
          </span>
        </div>

        {sync.orphaned > 0 && (
          <div className="text-[11px] text-amber-300 bg-amber-500/10 ring-1 ring-amber-500/30 rounded-md px-3 py-2 space-y-2">
            <div className="flex items-start gap-1.5">
              <UserX className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>
                Bu cihazda farklı bir hesaba ait <b>{sync.orphaned}</b> bekleyen cloud işlemi var.
                Mevcut hesabınla otomatik gönderilmeyecek; ilgili hesaba tekrar giriş yapman gerekir.
              </span>
            </div>
            <button
              type="button"
              onClick={() => clearOrphanedQueue()}
              className="text-[11px] px-2 py-1 rounded-md bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40 hover:bg-amber-500/30 transition-colors cursor-pointer"
            >
              Diğer hesaba ait kayıtları temizle
            </button>
          </div>
        )}

        {sync.lastError && (
          <div className="text-[11px] text-rose-400 bg-rose-500/10 ring-1 ring-rose-500/30 rounded-md px-3 py-2">
            Son hata: {sync.lastError}
          </div>
        )}

        <div className="h-px bg-zinc-800/50 my-2" />

        <p className="text-xs text-zinc-500 leading-relaxed">{description}</p>

        {isCloudReady && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => void syncNow()}
              disabled={!canSyncNow}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40 hover:bg-violet-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {sync.syncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCcw className="w-3.5 h-3.5" />
              )}
              Şimdi Senkronize Et
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
