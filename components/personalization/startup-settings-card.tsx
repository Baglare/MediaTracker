"use client";

import { Check, Home, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useStartupRuntime } from "./startup-runtime";
import {
  DEFAULT_DASHBOARD_TABS,
  type DefaultDashboardTab,
} from "@/lib/personalization/startup-preferences";

const STARTUP_LABELS: Readonly<Record<DefaultDashboardTab, {
  label: string;
  description: string;
}>> = {
  dashboard: { label: "Ana panel", description: "Genel özet ve kişisel panel düzenin." },
  library: { label: "Kütüphane", description: "Medya koleksiyonunu doğrudan açar." },
  discover: { label: "Keşfet", description: "Arama ve keşif araçlarıyla başlar." },
  calendar: { label: "Takvim", description: "Takvim görünümünü başlangıç alanı yapar." },
  settings: { label: "Ayarlar", description: "Uygulama tercihlerini doğrudan açar." },
};

export default function StartupSettingsCard() {
  const {
    preferences,
    hydrated,
    setDefaultDashboardTab,
    resetToDefaults,
  } = useStartupRuntime();
  const [message, setMessage] = useState(
    "Bu seçim yalnız MediaTracker ana adresi ek bir adres parametresi olmadan açıldığında kullanılır.",
  );

  const select = (tab: DefaultDashboardTab) => {
    setDefaultDashboardTab(tab);
    setMessage(`${STARTUP_LABELS[tab].label} başlangıç alanı olarak kaydedildi.`);
  };

  return (
    <section className="app-panel rounded-2xl border p-[var(--app-panel-padding)] lg:col-span-2" aria-labelledby="startup-settings-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Home className="h-5 w-5 text-[var(--app-accent-strong)]" aria-hidden="true" />
            <h2 id="startup-settings-title" className="font-semibold text-[var(--app-text-primary)]">
              Başlangıç
            </h2>
          </div>
          <p className="mt-1 text-sm text-[var(--app-text-muted)]">
            MediaTracker ana adresini açtığında gösterilecek bölümü seç.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetToDefaults();
            setMessage("Başlangıç alanı Ana panel varsayılanına döndü.");
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-1)] px-3 text-xs font-medium text-[var(--app-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Varsayılana dön
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5" role="radiogroup" aria-label="Varsayılan açılış alanı">
        {DEFAULT_DASHBOARD_TABS.map((tab) => {
          const option = STARTUP_LABELS[tab];
          const selected = preferences.defaultDashboardTab === tab;
          return (
            <button
              key={tab}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => select(tab)}
              className={`min-h-24 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] ${
                selected
                  ? "border-[var(--app-selected-border)] bg-[var(--app-selected-bg)]"
                  : "border-[var(--app-border)] bg-[var(--app-surface-2)] hover:bg-[var(--app-hover)]"
              }`}
            >
              <span className="flex items-center justify-between gap-2 text-sm font-medium text-[var(--app-text-primary)]">
                {option.label}
                {selected && <Check className="h-4 w-4 text-[var(--app-accent-strong)]" aria-hidden="true" />}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-[var(--app-text-muted)]">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-[var(--app-text-muted)]" role="status" aria-live="polite">
        {hydrated ? message : "Başlangıç tercihi yükleniyor…"}
      </p>
    </section>
  );
}
