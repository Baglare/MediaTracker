"use client";

import { Cloud, CloudOff, RefreshCw, Trash2 } from "lucide-react";

import { useCustomThemesRuntime } from "./custom-themes-runtime";
import { useThemeCloudSync } from "@/hooks/use-theme-cloud-sync";
import { CollapsibleSection } from "@/components/ui/collapsible-section";

type ConfirmAction = (title: string, message: string, onOk: () => void) => void;

export function ThemeCloudSyncPanel({ onConfirm }: { onConfirm: ConfirmAction }) {
  const customThemes = useCustomThemesRuntime();
  const sync = useThemeCloudSync();

  const forceDevice = () => {
    onConfirm(
      "Bu cihazı buluta yaz",
      "Buluttaki güncel tema durumu bu cihazdaki temalarla değiştirilecek. Yerel temaların korunacak.",
      () => void sync.forceDevice(),
    );
  };

  const deleteCloud = () => {
    onConfirm(
      "Bulut tema verisini sil",
      "Yalnız buluttaki özel tema senkronizasyon kaydı silinecek. Bu cihazdaki yerel temalar korunacak.",
      () => void sync.deleteCloud(),
    );
  };

  return (
    <CollapsibleSection
      storageKey="theme-cloud-sync"
      title="Cihazlar arası tema eşitleme"
      description="İsteğe bağlıdır, varsayılan olarak kapalıdır ve tema her zaman önce yerelde uygulanır."
      alert={sync.status === "conflict" || sync.status === "error"}
      badge={<span className="rounded-md border border-[var(--app-border)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--app-text-secondary)]">{sync.preferences.enabled ? "Açık" : "Kapalı"}</span>}
      icon={sync.preferences.enabled ? <Cloud className="h-4 w-4 text-[var(--app-accent-strong)]" /> : <CloudOff className="h-4 w-4 text-[var(--app-text-muted)]" />}
      className="mt-4"
      contentClassName="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-[var(--app-panel-padding)]"
      headingLevel="h4"
    >
      <div className="flex justify-end">
        {sync.auth.user ? (
          sync.preferences.enabled ? (
            <button type="button" onClick={sync.disable} className="min-h-11 rounded-lg border border-[var(--app-border-strong)] px-3 text-sm hover:bg-[var(--app-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]">
              Senkronizasyonu kapat
            </button>
          ) : (
            <button type="button" onClick={() => void sync.beginEnable()} disabled={sync.status === "loading"} className="min-h-11 rounded-lg bg-[var(--app-accent)] px-3 text-sm font-semibold text-[var(--app-accent-contrast)] disabled:cursor-wait disabled:bg-[var(--app-disabled-bg)] disabled:text-[var(--app-disabled-text)]">
              Tema senkronizasyonunu etkinleştir
            </button>
          )
        ) : null}
      </div>

      {!sync.auth.configured ? (
        <p className="mt-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] p-3 text-sm text-[var(--app-text-muted)]">
          Supabase yapılandırılmamış. İçe/dışa aktarma ve yerel temalar çalışmaya devam eder.
        </p>
      ) : !sync.auth.user ? (
        <p className="mt-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] p-3 text-sm text-[var(--app-text-muted)]">
          Cloud tema eşitlemesi için hesabınla giriş yap. Yerel tema kullanımı ve içe/dışa aktarma giriş gerektirmez.
        </p>
      ) : (
        <>
          <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg bg-[var(--app-surface-2)] p-3"><dt className="text-[var(--app-text-muted)]">Durum</dt><dd className="mt-1 font-semibold text-[var(--app-text-primary)]">{sync.preferences.enabled ? "Açık" : "Kapalı"}</dd></div>
            <div className="rounded-lg bg-[var(--app-surface-2)] p-3"><dt className="text-[var(--app-text-muted)]">Yerel tema</dt><dd className="mt-1 font-semibold text-[var(--app-text-primary)]">{customThemes.themes.length}</dd></div>
            <div className="rounded-lg bg-[var(--app-surface-2)] p-3"><dt className="text-[var(--app-text-muted)]">Bulut tema</dt><dd className="mt-1 font-semibold text-[var(--app-text-primary)]">{sync.remote?.customThemes.length ?? "—"}</dd></div>
            <div className="rounded-lg bg-[var(--app-surface-2)] p-3"><dt className="text-[var(--app-text-muted)]">Cloud sürümü</dt><dd className="mt-1 font-semibold text-[var(--app-text-primary)]">{sync.remote?.revision ?? sync.preferences.lastRemoteRevision ?? 0}</dd></div>
            <div className="rounded-lg bg-[var(--app-surface-2)] p-3"><dt className="text-[var(--app-text-muted)]">Yerel değişiklik</dt><dd className="mt-1 font-semibold text-[var(--app-text-primary)]">{sync.preferences.pendingLocalChanges ? "Bekliyor" : "Yok"}</dd></div>
          </dl>

          {sync.showInitialChoice && sync.remote && (
            <div className="mt-4 rounded-xl border border-[var(--app-selected-border)] bg-[var(--app-selected-bg)] p-3">
              <h5 className="text-sm font-semibold text-[var(--app-selected-text)]">İlk senkronizasyon yönünü seç</h5>
              <p className="mt-1 text-xs text-[var(--app-text-secondary)]">
                Yerel: {customThemes.themes.length} tema · Bulut: {sync.remote.customThemes.length} tema · Önerilen: {
                  sync.recommendedInitialChoice === "device" ? "Bu cihaz"
                    : sync.recommendedInitialChoice === "cloud" ? "Bulut"
                      : sync.recommendedInitialChoice === "merge" ? "Birleştir" : "Boş durum"
                }
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void sync.resolveInitial("device")} className="min-h-11 rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-surface-2)] px-3 text-sm">Bu cihazı kullan</button>
                <button type="button" onClick={() => void sync.resolveInitial("cloud")} className="min-h-11 rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-surface-2)] px-3 text-sm">Bulutu kullan</button>
                <button type="button" onClick={() => void sync.resolveInitial("merge")} className="min-h-11 rounded-lg bg-[var(--app-accent)] px-3 text-sm font-semibold text-[var(--app-accent-contrast)]">Birleştir</button>
                <button type="button" onClick={() => void sync.resolveInitial("cancel")} className="min-h-11 rounded-lg px-3 text-sm hover:bg-[var(--app-hover)]">Vazgeç</button>
              </div>
            </div>
          )}

          {sync.status === "conflict" && sync.remote && (
            <div className="mt-4 rounded-xl border border-[var(--app-warning)] bg-[var(--app-warning-soft)] p-3" role="alert">
              <h5 className="text-sm font-semibold text-[var(--app-warning)]">Cloud sürümü çakışması</h5>
              <p className="mt-1 text-xs text-[var(--app-text-secondary)]">Bulutta daha yeni tema değişiklikleri bulundu. Sessizce üzerine yazılmadı.</p>
              <details className="mt-2 text-xs text-[var(--app-text-secondary)]">
                <summary className="cursor-pointer font-medium">Bulut temalarını incele</summary>
                <ul className="mt-2 list-disc pl-5">
                  {sync.remote.customThemes.map((theme) => <li key={theme.id}>{theme.name}</li>)}
                </ul>
              </details>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={sync.useCloud} className="min-h-11 rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-surface-2)] px-3 text-sm">Bulutu kullan</button>
                <button type="button" onClick={() => void sync.mergeConflict()} className="min-h-11 rounded-lg bg-[var(--app-accent)] px-3 text-sm font-semibold text-[var(--app-accent-contrast)]">Birleştir</button>
                <button type="button" onClick={forceDevice} className="min-h-11 rounded-lg border border-[var(--app-danger)] px-3 text-sm text-[var(--app-danger)]">Bu cihazı zorla kullan</button>
              </div>
            </div>
          )}

          {sync.preferences.enabled && !sync.showInitialChoice && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => void sync.syncNow()} disabled={sync.status === "syncing"} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--app-accent)] px-3 text-sm font-semibold text-[var(--app-accent-contrast)] disabled:bg-[var(--app-disabled-bg)] disabled:text-[var(--app-disabled-text)]">
                <RefreshCw className={`h-4 w-4 ${sync.status === "syncing" ? "animate-spin" : ""}`} aria-hidden="true" />
                Şimdi senkronize et
              </button>
              <button type="button" onClick={() => void sync.refresh()} className="min-h-11 rounded-lg border border-[var(--app-border-strong)] px-3 text-sm hover:bg-[var(--app-hover)]">Buluttan yenile</button>
              <button type="button" onClick={deleteCloud} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--app-danger)] px-3 text-sm text-[var(--app-danger)] hover:bg-[var(--app-danger-soft)]">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Buluttaki tema verilerimi sil
              </button>
            </div>
          )}
        </>
      )}

      <p className="mt-4 text-xs text-[var(--app-text-muted)]" role="status" aria-live="polite">
        {sync.message}
        {sync.preferences.lastSyncedAt ? ` Son senkronizasyon: ${new Date(sync.preferences.lastSyncedAt).toLocaleString("tr-TR")}.` : ""}
      </p>
    </CollapsibleSection>
  );
}
