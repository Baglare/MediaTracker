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
import type { LocalOwnerScope } from "@/lib/local-owner-scope";
import type { MediaItem, ProgressLog } from "@/lib/types";
import CloudV2ConflictPanel from "@/components/cloud-v2-conflict-panel";

interface CloudSyncStatusCardProps {
  ownerScope: LocalOwnerScope | null;
  mediaItems: MediaItem[];
  progressLogs: ProgressLog[];
  onApplyResolution: (items: MediaItem[], logs: ProgressLog[]) => boolean;
  onConfirm: (title: string, message: string, onOk: () => void) => void;
}

function formatLastSync(value: string | null): string {
  if (!value) return "Henüz yok";
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function CloudSyncStatusCard({
  ownerScope,
  mediaItems,
  progressLogs,
  onApplyResolution,
  onConfirm,
}: CloudSyncStatusCardProps) {
  const { configured, user, loading } = useAuth();
  const sync = useSyncStatus();

  const isCloudReady = configured && !!user;
  const headerLabel = isCloudReady
    ? sync.synced && sync.rolloutStatus === "ready" ? "Cloud Hazır" : "Cloud Bağlı"
    : "Yerel Mod";

  let description: string;
  if (!configured) {
    description = "Cloud sync henüz yapılandırılmadı. Verilerin bu tarayıcıda saklanıyor.";
  } else if (!user) {
    description = "Supabase yapılandırıldı. Cloud sync için giriş yapabilirsin.";
  } else if (sync.rolloutStatus !== "ready") {
    description =
      "Cloud şema ve istemci uyumluluğu doğrulanana kadar bekleyen işlemler gönderilmeyecek.";
  } else if (sync.blocked > 0) {
    description =
      "Bazı Cloud V2 işlemleri kullanıcı kararı bekliyor. Blocked işlemler otomatik retry edilmez.";
  } else if (sync.pending > 0 && !sync.online) {
    description = "Çevrimdışısın. Bekleyen cloud işlemleri internet geldiğinde otomatik gönderilecek.";
  } else if (sync.inFlight > 0) {
    description = "Yerel kayıt korundu; cloud kuyruğundaki işlemler şu anda gönderiliyor.";
  } else if (sync.retryable > 0) {
    description = "Yerel kayıt korundu. Cloud işlemi ağ yeniden uygun olduğunda tekrar denenecek.";
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
  } else if (sync.blocked > 0) {
    statusBadge = {
      text: `Karar bekliyor · ${sync.blocked}`,
      cls: "text-rose-300 bg-rose-500/10 ring-1 ring-rose-500/30",
    };
  } else if (sync.lastError && sync.pending > 0) {
    statusBadge = {
      text: "Hata",
      cls: "text-rose-300 bg-rose-500/10 ring-1 ring-rose-500/30",
    };
  } else if (sync.pending > 0) {
    statusBadge = {
      text: "Cloud kuyruğunda",
      cls: "text-amber-300 bg-amber-500/10 ring-1 ring-amber-500/30",
    };
  } else if (isCloudReady) {
    statusBadge = {
      text: "Senkron",
      cls: "text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/30",
    };
  }

  const canSyncNow = isCloudReady
    && sync.online
    && !sync.syncing
    && sync.pending > sync.blocked
    && sync.rolloutStatus === "ready"
    && sync.incompatible === 0;

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

        <div className="flex items-center justify-between gap-4">
          <span className="text-zinc-400">Aktif Adapter</span>
          <span className="text-zinc-200 text-xs px-2 py-1 rounded-md bg-zinc-800/60 ring-1 ring-zinc-700/40">
            {sync.adapter === "v2" ? "Cloud V2" : "Legacy"}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-zinc-400">Şema Uyumluluğu</span>
          <span
            className={
              sync.rolloutStatus === "ready"
                ? "text-emerald-300 text-xs px-2 py-1 rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/30"
                : "text-amber-300 text-xs px-2 py-1 rounded-md bg-amber-500/10 ring-1 ring-amber-500/30"
            }
          >
            {sync.rolloutStatus === "ready"
              ? sync.schemaStage.toUpperCase()
              : "Durduruldu"}
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

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-zinc-800/50 px-2 py-2">
            <div className="text-xs font-semibold text-violet-300">{sync.inFlight}</div>
            <div className="text-[10px] text-zinc-500">in-flight</div>
          </div>
          <div className="rounded-md bg-zinc-800/50 px-2 py-2">
            <div className="text-xs font-semibold text-amber-300">{sync.retryable}</div>
            <div className="text-[10px] text-zinc-500">retryable</div>
          </div>
          <div className="rounded-md bg-zinc-800/50 px-2 py-2">
            <div className="text-xs font-semibold text-rose-300">{sync.blocked}</div>
            <div className="text-[10px] text-zinc-500">blocked</div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-zinc-400">Son Sync</span>
          <span className="text-xs text-zinc-300">{formatLastSync(sync.lastSyncAt)}</span>
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

        <CloudV2ConflictPanel
          ownerScope={ownerScope}
          mediaItems={mediaItems}
          progressLogs={progressLogs}
          onApplyResolution={onApplyResolution}
          onConfirm={onConfirm}
        />
      </div>
    </div>
  );
}
