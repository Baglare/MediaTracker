"use client";

// ============================================
// Cloud Veri Durumu Kartı
// ============================================
// Login sonrası ve manuel "Yenile" butonuyla cloud'daki kayıt sayılarını çeker,
// yerel sayılarla karşılaştırır, akıllı bir öneri mesajı gösterir.
// 4 buton: Birleştir / İndir / Aktar / Yenile.
// Hiçbir aksiyon otomatik tetiklenmez — hepsi confirm dialog ister.

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Cloud,
  Database,
  GitMerge,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { MediaItem, ProgressLog } from "@/lib/types";
import {
  fetchCloudMediaCount,
  fetchCloudProgressLogCount,
} from "@/lib/supabase/cloud-repository";
import {
  performCloudDownload,
  performCloudMerge,
  performCloudUpload,
} from "@/lib/supabase/cloud-actions";

interface CloudDataStatusCardProps {
  user: User | null;
  configured: boolean;
  mediaItems: MediaItem[];
  progressLogs: ProgressLog[];
  setMediaItems: (items: MediaItem[]) => void;
  setProgressLogs: (logs: ProgressLog[]) => void;
  onConfirm: (title: string, message: string, onOk: () => void) => void;
}

type Counts = {
  cloudMedia: number;
  cloudLogs: number;
  checkedAt: string;
};

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; counts: Counts }
  | { kind: "error"; error: string };

type Banner = { kind: "success" | "error"; text: string } | null;
type Busy = "upload" | "download" | "merge" | "refresh" | null;

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  }).format(new Date(iso));
}

export default function CloudDataStatusCard({
  user,
  configured,
  mediaItems,
  progressLogs,
  setMediaItems,
  setProgressLogs,
  onConfirm,
}: CloudDataStatusCardProps) {
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [busy, setBusy] = useState<Busy>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const lastUserIdRef = useRef<string | null>(user?.id ?? null);

  useEffect(() => {
    const nextUserId = user?.id ?? null;
    if (lastUserIdRef.current === nextUserId) return;

    lastUserIdRef.current = nextUserId;
    setState({ kind: "idle" });
    setBanner(null);
    setBusy(null);
  }, [user?.id]);

  const refresh = async () => {
    const requestedUserId = user?.id ?? null;
    if (!configured || !requestedUserId) return;

    setBusy("refresh");
    setState({ kind: "loading" });

    const m = await fetchCloudMediaCount(requestedUserId);
    if (lastUserIdRef.current !== requestedUserId) return;
    if (!m.ok) {
      setBusy(null);
      setState({ kind: "error", error: m.error });
      return;
    }

    const p = await fetchCloudProgressLogCount(requestedUserId);
    if (lastUserIdRef.current !== requestedUserId) return;
    if (!p.ok) {
      setBusy(null);
      setState({ kind: "error", error: p.error });
      return;
    }

    setState({
      kind: "ready",
      counts: { cloudMedia: m.data, cloudLogs: p.data, checkedAt: new Date().toISOString() },
    });
    setBusy(null);
  };

  useEffect(() => {
    if (!configured || !user?.id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh kullanıcı/yapılandırma değişiminde tetiklenir
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, user?.id]);

  const cardCls = "bg-zinc-900/50 rounded-2xl border border-zinc-800/50 p-6";

  if (!configured || !user) {
    return (
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-5 h-5 text-zinc-500" />
          <h3 className="text-lg font-semibold text-zinc-100">Cloud Veri Durumu</h3>
        </div>
        <p className="text-sm text-zinc-400">
          {!configured
            ? "Supabase yapılandırılmadı. Cloud veri durumu kontrolü için yapılandırma gerekiyor."
            : "Veri durumunu görmek için giriş yapmalısın."}
        </p>
      </div>
    );
  }

  const localMedia = mediaItems.length;
  const localLogs = progressLogs.length;

  let suggestion: { tone: "info" | "warn" | "success"; text: string } | null = null;
  if (state.kind === "ready") {
    const { cloudMedia, cloudLogs } = state.counts;
    const localEmpty = localMedia === 0 && localLogs === 0;
    const cloudEmpty = cloudMedia === 0 && cloudLogs === 0;

    if (localEmpty && cloudEmpty) {
      suggestion = { tone: "info", text: "Henüz hiç veri yok. Medya ekledikçe burası dolacak." };
    } else if (localEmpty && !cloudEmpty) {
      suggestion = {
        tone: "info",
        text: "Yerelde veri yok ama cloud'da bekleyen kayıtlar var. Cloud'dan geri yükleyebilirsin.",
      };
    } else if (!localEmpty && cloudEmpty) {
      suggestion = {
        tone: "info",
        text: "Cloud boş. Yerel verilerini cloud'a aktarabilirsin.",
      };
    } else {
      const sameMedia = localMedia === cloudMedia;
      const sameLogs = localLogs === cloudLogs;
      if (sameMedia && sameLogs) {
        suggestion = {
          tone: "success",
          text: "Yerel ve cloud sayıları eşleşiyor. Veriler büyük olasılıkla senkron.",
        };
      } else {
        suggestion = {
          tone: "warn",
          text: "Hem yerel hem cloud'da veri var ve sayılar farklı. Birleştirme önerilir.",
        };
      }
    }
  }

  const showBanner = (b: Banner) => setBanner(b);

  const doUpload = () => {
    onConfirm(
      "Cloud'a Aktar",
      "Yerel verilerin cloud'a aktarılacak. Devam edilsin mi?",
      async () => {
        setBusy("upload");
        showBanner(null);
        const res = await performCloudUpload(user.id, mediaItems, progressLogs);
        setBusy(null);
        showBanner({ kind: res.ok ? "success" : "error", text: res.message });
        if (res.ok) void refresh();
      }
    );
  };

  const doDownload = () => {
    onConfirm(
      "Cloud'dan İndir",
      "Cloud verileri yerel verilerinin yerine geçecek. Devam edilsin mi?",
      async () => {
        setBusy("download");
        showBanner(null);
        const res = await performCloudDownload(user.id);
        setBusy(null);
        if (!res.ok) {
          showBanner({ kind: "error", text: res.message });
          return;
        }
        setMediaItems(res.mediaItems);
        setProgressLogs(res.progressLogs);
        showBanner({ kind: "success", text: res.message });
        void refresh();
      }
    );
  };

  const doMerge = () => {
    onConfirm(
      "Cloud ile Birleştir",
      "Cloud verileri yerel verilerle birleştirilecek. Devam edilsin mi?",
      async () => {
        setBusy("merge");
        showBanner(null);
        const res = await performCloudMerge(user.id, mediaItems, progressLogs);
        setBusy(null);
        if (!res.ok) {
          showBanner({ kind: "error", text: res.message });
          return;
        }
        setMediaItems(res.mediaItems);
        setProgressLogs(res.progressLogs);
        showBanner({ kind: "success", text: res.message });
        void refresh();
      }
    );
  };

  const cloudMedia = state.kind === "ready" ? state.counts.cloudMedia : null;
  const cloudLogs = state.kind === "ready" ? state.counts.cloudLogs : null;
  const checkedAt = state.kind === "ready" ? formatTime(state.counts.checkedAt) : null;

  const formatCount = (n: number | null) =>
    state.kind === "loading" ? "…" : state.kind === "error" ? "—" : n === null ? "—" : String(n);

  const suggestionCls =
    suggestion?.tone === "warn"
      ? "text-amber-300 bg-amber-500/10 ring-1 ring-amber-500/30"
      : suggestion?.tone === "success"
        ? "text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/30"
        : "text-zinc-300 bg-zinc-800/50 ring-1 ring-zinc-700/40";

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-violet-400" />
          <h3 className="text-lg font-semibold text-zinc-100">Cloud Veri Durumu</h3>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy !== null}
          className="text-xs inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-zinc-800/60 text-zinc-300 ring-1 ring-zinc-700/40 hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
          title="Cloud sayılarını yenile"
        >
          {busy === "refresh" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Yenile
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs mb-3">
        <div className="text-zinc-500 font-medium">Tür</div>
        <div className="text-zinc-500 font-medium text-right">Yerel</div>
        <div className="text-zinc-500 font-medium text-right">Cloud</div>

        <div className="text-zinc-300">İçerik</div>
        <div className="text-zinc-200 text-right tabular-nums">{localMedia}</div>
        <div className="text-zinc-200 text-right tabular-nums">{formatCount(cloudMedia)}</div>

        <div className="text-zinc-300">Aktivite</div>
        <div className="text-zinc-200 text-right tabular-nums">{localLogs}</div>
        <div className="text-zinc-200 text-right tabular-nums">{formatCount(cloudLogs)}</div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-3">
        <span>
          {state.kind === "ready"
            ? `Son kontrol: ${checkedAt}`
            : state.kind === "loading"
              ? "Kontrol ediliyor…"
              : state.kind === "error"
                ? "Kontrol başarısız"
                : "Henüz kontrol edilmedi"}
        </span>
      </div>

      {state.kind === "error" && (
        <p className="text-xs text-rose-400 bg-rose-500/10 ring-1 ring-rose-500/30 rounded-md px-3 py-2 mb-3">
          {state.error}
        </p>
      )}

      {suggestion && (
        <p className={`text-xs leading-relaxed rounded-md px-3 py-2 mb-3 ${suggestionCls}`}>
          {suggestion.text}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          type="button"
          onClick={doMerge}
          disabled={busy !== null || state.kind !== "ready"}
          className="text-left p-3 rounded-xl bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-500/30 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <div className="flex items-center gap-2 mb-1">
            {busy === "merge" ? (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-300" />
            ) : (
              <GitMerge className="w-4 h-4 text-emerald-300" />
            )}
            <span className="text-xs font-semibold text-emerald-100">
              Cloud&apos;dan Yerel&apos;e Birleştir
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-emerald-200/80">
            Cloud&apos;da olup yerelde olmayan kayıtları yerel verine ekler.
            Yerel verini silmez. Cloud&apos;a upload yapmaz.
          </p>
        </button>

        <button
          type="button"
          onClick={doDownload}
          disabled={busy !== null || state.kind !== "ready"}
          className="text-left p-3 rounded-xl bg-zinc-800/60 text-zinc-200 ring-1 ring-zinc-700/50 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <div className="flex items-center gap-2 mb-1">
            {busy === "download" ? (
              <Loader2 className="w-4 h-4 animate-spin text-zinc-300" />
            ) : (
              <ArrowDownToLine className="w-4 h-4 text-zinc-300" />
            )}
            <span className="text-xs font-semibold text-zinc-100">Cloud → Yerel</span>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-400">
            Cloud verilerini indirir ve yerel verilerinin yerine koyar.
          </p>
        </button>

        <button
          type="button"
          onClick={doUpload}
          disabled={busy !== null}
          className="text-left p-3 rounded-xl bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/40 hover:bg-violet-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <div className="flex items-center gap-2 mb-1">
            {busy === "upload" ? (
              <Loader2 className="w-4 h-4 animate-spin text-violet-300" />
            ) : (
              <ArrowUpFromLine className="w-4 h-4 text-violet-300" />
            )}
            <span className="text-xs font-semibold text-violet-100">Yerel → Cloud</span>
          </div>
          <p className="text-[11px] leading-relaxed text-violet-200/80">
            Yerel verilerini cloud&apos;a gönderir. Aynı kayıtlar tekrar oluşturulmaz.
          </p>
        </button>
      </div>

      {banner && (
        <p
          className={
            "text-xs rounded-md px-3 py-2 mt-3 " +
            (banner.kind === "success"
              ? "text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/30"
              : "text-rose-400 bg-rose-500/10 ring-1 ring-rose-500/30")
          }
        >
          {banner.text}
        </p>
      )}

      <p className="text-[11px] text-zinc-600 leading-relaxed mt-3 flex items-start gap-1.5">
        <Cloud className="w-3 h-3 mt-0.5 flex-shrink-0" />
        Hiçbir işlem otomatik tetiklenmez. Aksiyonlar onay ister; veriler korunur.
      </p>
    </div>
  );
}
