"use client";

import { Cloud, CloudOff, RefreshCw, Trash2 } from "lucide-react";

import { useCustomThemesRuntime } from "./custom-themes-runtime";
import { useThemeCloudSync } from "@/hooks/use-theme-cloud-sync";

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
    <section className="mt-6 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-[var(--app-panel-padding)]" aria-labelledby="theme-cloud-sync-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]">
            {sync.preferences.enabled ? <Cloud className="h-5 w-5" aria-hidden="true" /> : <CloudOff className="h-5 w-5" aria-hidden="true" />}
          </span>
          <div>
            <h4 id="theme-cloud-sync-title" className="text-sm font-semibold text-[var(--app-text-primary)]">Cihazlar Arası Senkronizasyon</h4>
            <p className="mt-1 max-w-2xl text-xs text-[var(--app-text-muted)]">
              İsteğe bağlıdır ve bu cihaz için varsayılan olarak kapalıdır. Tema her zaman önce yerelde uygulanır.
            </p>
          </div>
        </div>
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
          Supabase yapılandırılmamış. Import/export ve yerel temalar çalışmaya devam eder.
        </p>
      ) : !sync.auth.user ? (
        <p className="mt-4 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] p-3 text-sm text-[var(--app-text-muted)]">
          Cloud tema senkronizasyonu için hesabınla giriş yap. Yerel tema kullanımı ve import/export giriş gerektirmez.
        </p>
      ) : (
        <>
          <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg bg-[var(--app-surface-2)] p-3"><dt className="text-[var(--app-text-muted)]">Durum</dt><dd className="mt-1 font-semibold text-[var(--app-text-primary)]">{sync.preferences.enabled ? "Açık" : "Kapalı"}</dd></div>
            <div className="rounded-lg bg-[var(--app-surface-2)] p-3"><dt className="text-[var(--app-text-muted)]">Yerel tema</dt><dd className="mt-1 font-semibold text-[var(--app-text-primary)]">{customThemes.themes.length}</dd></div>
            <div className="rounded-lg bg-[var(--app-surface-2)] p-3"><dt className="text-[var(--app-text-muted)]">Bulut tema</dt><dd className="mt-1 font-semibold text-[var(--app-text-primary)]">{sync.remote?.customThemes.length ?? "—"}</dd></div>
            <div className="rounded-lg bg-[var(--app-surface-2)] p-3"><dt className="text-[var(--app-text-muted)]">Revision</dt><dd className="mt-1 font-semibold text-[var(--app-text-primary)]">{sync.remote?.revision ?? sync.preferences.lastRemoteRevision ?? 0}</dd></div>
            <div className="rounded-lg bg-[var(--app-surface-2)] p-3"><dt className="text-[var(--app-text-muted)]">Yerel değişiklik</dt><dd className="mt-1 font-semibold text-[var(--app-text-primary)]">{sync.preferences.pendingLocalChanges ? "Bekliyor" : "Yok"}</dd></div>
          </dl>

          {sync.showInitialChoice && sync.remote && (
            <div className="mt-4 rounded-xl border border-[var(--app-selected-border)] bg-[var(--app-selected-bg)] p-3">
              <h5 className="text-sm font-semibold text-[var(--app-selected-text)]">İlk senkronizasyon yönünü seç</h5>
              <p className="mt-1 text-xs text-[var(--app-text-secondary)]">
                Yerel: {customThemes.themes.length} tema · Bulut: {sync.remote.customThemes.length} tema · Önerilen: {
                  sync.recommendedInitialChoice === "device" ? "Bu cihaz"
                    : sync.recommendedInitialChoice === "cloud" ? "Bulut"
                      : sync.recommendedInitialChoice === "merge" ? "Birleştir" : "Boş state"
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
              <h5 className="text-sm font-semibold text-[var(--app-warning)]">Revision çakışması</h5>
              <p className="mt-1 text-xs text-[var(--app-text-secondary)]">Bulutta daha yeni tema değişiklikleri bulundu. Sessiz overwrite yapılmadı.</p>
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
    </section>
  );
}
