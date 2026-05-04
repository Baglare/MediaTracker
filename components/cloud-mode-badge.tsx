"use client";

// Header'da gösterilen küçük durum rozeti.
// Bekleyen sync, syncing, çevrimdışı ve hata durumlarını yansıtır.

import { Cloud, CloudOff, Loader2, WifiOff, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSyncStatus } from "@/hooks/use-sync-status";

export default function CloudModeBadge() {
  const { configured, user } = useAuth();
  const sync = useSyncStatus();
  const isCloudReady = configured && !!user;

  // Üç durum: cloud-ready varyantları + yerel mod
  let cls: string;
  let label: string;
  let Icon: typeof Cloud;
  let title: string;
  let spin = false;

  if (!isCloudReady) {
    Icon = CloudOff;
    label = "Yerel Mod";
    cls = "bg-zinc-800/60 text-zinc-400 ring-zinc-700/40";
    title = "Veriler yalnızca bu tarayıcıda";
  } else if (sync.syncing) {
    Icon = Loader2;
    spin = true;
    label = "Senkron…";
    cls = "bg-violet-500/10 text-violet-300 ring-violet-500/30";
    title = "Bekleyen cloud işlemleri gönderiliyor";
  } else if (!sync.online) {
    Icon = WifiOff;
    label = sync.pending > 0 ? `Çevrimdışı · ${sync.pending}` : "Çevrimdışı";
    cls = "bg-amber-500/10 text-amber-300 ring-amber-500/30";
    title = "İnternet yok; cloud işlemleri kuyrukta";
  } else if (sync.lastError && sync.pending > 0) {
    Icon = AlertTriangle;
    label = `Hata · ${sync.pending}`;
    cls = "bg-rose-500/10 text-rose-300 ring-rose-500/30";
    title = sync.lastError;
  } else if (sync.pending > 0) {
    Icon = Cloud;
    label = `Bekliyor · ${sync.pending}`;
    cls = "bg-amber-500/10 text-amber-300 ring-amber-500/30";
    title = "Kuyrukta bekleyen cloud işlemleri var";
  } else {
    Icon = Cloud;
    label = "Cloud Hazır";
    cls = "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30";
    title = "Tüm değişiklikler senkronize";
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium ring-1 ${cls}`}
      title={title}
    >
      <Icon className={`w-3 h-3 ${spin ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}
