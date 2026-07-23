"use client";

import { BarChart3, Check, Gauge, Palette, RotateCcw, Sparkles } from "lucide-react";
import { useState } from "react";

import { useAppearanceRuntime } from "./appearance-runtime";
import { ThemeStudio } from "./theme-studio";
import { CHART_PALETTE_REGISTRY } from "@/lib/personalization/chart-palette-registry";
import { BASE_THEME_REGISTRY } from "@/lib/personalization/theme-registry";
import type {
  AccentMode,
  AppDensity,
  ChartPaletteId,
  ChartStatusKey,
  EffectsLevel,
} from "@/lib/personalization/types";
import { WORLD_THEME_REGISTRY } from "@/lib/personalization/world-theme-registry";

export interface AppearanceAccentOption {
  id: AccentMode;
  label: string;
  description: string;
  preview: string;
}

export const APPEARANCE_THEME_OPTIONS = Object.values(BASE_THEME_REGISTRY);

export const APPEARANCE_ACCENT_OPTIONS: readonly AppearanceAccentOption[] = [
  { id: "auto", label: "Otomatik", description: "Aktif içerik dünyasını izler.", preview: "linear-gradient(90deg, #e8b86a, #6fb0e0, #b8956a)" },
  { id: "theme", label: "Tema rengi", description: "Seçili temel temanın kendi vurgusunu kullanır.", preview: "var(--app-accent)" },
  { id: "east", label: WORLD_THEME_REGISTRY.east.label, description: "Sıcak altın ve lake vurgusunu sabitler.", preview: WORLD_THEME_REGISTRY.east.primary },
  { id: "screen", label: WORLD_THEME_REGISTRY.screen.label, description: "Sinema mavisi vurgusunu sabitler.", preview: WORLD_THEME_REGISTRY.screen.primary },
  { id: "arch", label: WORLD_THEME_REGISTRY.arch.label, description: "Parşömen altını vurgusunu sabitler.", preview: WORLD_THEME_REGISTRY.arch.primary },
  { id: "neutral", label: "Nötr", description: "Ana uygulama vurgusunu sakin ve nötr tutar.", preview: WORLD_THEME_REGISTRY.neutral.primary },
];

const CHART_STATUS_ORDER: readonly ChartStatusKey[] = [
  "completed",
  "inProgress",
  "planning",
  "paused",
  "dropped",
];

const DENSITY_OPTIONS: readonly { id: AppDensity; label: string; description: string }[] = [
  { id: "comfortable", label: "Rahat", description: "Mevcut ferah aralıklar ve panel boşlukları." },
  { id: "compact", label: "Kompakt", description: "İçeriği sıklaştırır; kontrol hedeflerini küçültmez." },
];

const EFFECT_OPTIONS: readonly { id: EffectsLevel; label: string; description: string }[] = [
  { id: "off", label: "Kapalı", description: "Dekoratif hareket ve parıltıları en aza indirir." },
  { id: "subtle", label: "Hafif", description: "Dengeli geçişler ve sınırlı vurgu kullanır." },
  { id: "full", label: "Tam", description: "Dünya motiflerini ve geçişlerini kontrollü biçimde belirginleştirir." },
];

export default function AppearanceSettingsCard({
  onConfirm,
}: {
  onConfirm: (title: string, message: string, onOk: () => void) => void;
}) {
  const { preferences, hydrated, updatePreference, resetToDefaults } = useAppearanceRuntime();
  const [message, setMessage] = useState("Görünüm seçimleri bu cihazda anında kaydedilir.");

  const selectAccent = (accent: AccentMode) => {
    updatePreference("accentMode", accent);
    setMessage("Dünya vurgusu kaydedildi.");
  };

  const selectChartPalette = (chartPaletteId: ChartPaletteId) => {
    updatePreference("chartPaletteId", chartPaletteId);
    setMessage("Grafik paleti kaydedildi.");
  };

  const selectDensity = (density: AppDensity) => {
    updatePreference("density", density);
    setMessage("Görünüm yoğunluğu kaydedildi.");
  };

  const selectEffects = (effectsLevel: EffectsLevel) => {
    updatePreference("effectsLevel", effectsLevel);
    setMessage("Görsel efekt seviyesi kaydedildi.");
  };

  const reset = () => {
    resetToDefaults();
    setMessage("Görünüm, grafik, yoğunluk ve efekt tercihleri varsayılana döndü.");
  };

  return (
    <section className="app-panel rounded-2xl border p-[var(--app-panel-padding)] lg:col-span-2" aria-labelledby="appearance-settings-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)] ring-1 ring-[color-mix(in_srgb,var(--app-accent)_30%,transparent)]">
            <Palette className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 id="appearance-settings-title" className="text-base font-semibold text-[var(--app-text-primary)]">Görünüm</h2>
            <p className="mt-1 max-w-3xl text-sm text-[var(--app-text-muted)]">
              Temel uygulama görünümünü ve ondan bağımsız dünya vurgusunu seç.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-surface-2)] px-3 py-2 text-xs font-medium text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Varsayılana dön
        </button>
      </div>

      <ThemeStudio onConfirm={onConfirm} />

      <fieldset className="mt-7 border-t border-[var(--app-border)] pt-6">
        <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--app-text-muted)]">Dünya vurgusu</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {APPEARANCE_ACCENT_OPTIONS.map((option) => {
            const selected = preferences.accentMode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => selectAccent(option.id)}
                className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] ${
                  selected
                    ? "border-[var(--app-accent)] bg-[var(--app-selected)]"
                    : "border-[var(--app-border)] bg-[var(--app-surface-2)] hover:bg-[var(--app-hover)]"
                }`}
              >
                <span className="h-8 w-8 shrink-0 rounded-lg ring-1 ring-black/10" style={{ background: option.preview }} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-medium text-[var(--app-text-primary)]">{option.label}{selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}</span>
                  <span className="mt-0.5 block text-xs text-[var(--app-text-muted)]">{option.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-7 border-t border-[var(--app-border)] pt-6">
        <legend className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--app-text-muted)]">
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
          Grafik renkleri
        </legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Object.values(CHART_PALETTE_REGISTRY).map((palette) => {
            const selected = preferences.chartPaletteId === palette.id;
            return (
              <button
                key={palette.id}
                type="button"
                aria-pressed={selected}
                onClick={() => selectChartPalette(palette.id)}
                className={`min-h-32 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] ${
                  selected
                    ? "border-[var(--app-selected-border)] bg-[var(--app-selected-bg)]"
                    : "border-[var(--app-border)] bg-[var(--app-surface-2)] hover:bg-[var(--app-hover)]"
                }`}
              >
                <span className="flex h-3 overflow-hidden rounded-full" aria-hidden="true">
                  {CHART_STATUS_ORDER.map((statusKey) => (
                    <span
                      key={statusKey}
                      className="flex-1"
                      style={{ backgroundColor: palette.statuses[statusKey].segmentColor }}
                    />
                  ))}
                </span>
                <span className="mt-3 flex items-center justify-between gap-2 text-sm font-semibold text-[var(--app-text-primary)]">
                  {palette.label}
                  {selected && <Check className="h-4 w-4 text-[var(--app-accent-strong)]" aria-hidden="true" />}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-[var(--app-text-muted)]">
                  {palette.description}
                </span>
              </button>
            );
          })}
        </div>
        <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] px-3 py-2 text-sm text-[var(--app-text-secondary)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--app-focus)]">
          <input
            type="checkbox"
            checked={preferences.followWorldCompletedColor}
            onChange={(event) => {
              updatePreference("followWorldCompletedColor", event.target.checked);
              setMessage("Tamamlanan dilimin dünya rengi davranışı kaydedildi.");
            }}
            className="h-4 w-4 accent-[var(--app-accent)]"
          />
          <span>
            <span className="block font-medium text-[var(--app-text-primary)]">
              Tamamlanan dilimi aktif dünya rengiyle göster
            </span>
            <span className="mt-0.5 block text-xs text-[var(--app-text-muted)]">
              Kapalı olduğunda tamamlanan dahil bütün segmentler seçili paletten gelir.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="mt-7 grid gap-6 border-t border-[var(--app-border)] pt-6 lg:grid-cols-2">
        <fieldset>
          <legend className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--app-text-muted)]">
            <Gauge className="h-4 w-4" aria-hidden="true" />
            Görünüm yoğunluğu
          </legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {DENSITY_OPTIONS.map((option) => {
              const selected = preferences.density === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => selectDensity(option.id)}
                  className={`min-h-24 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] ${
                    selected
                      ? "border-[var(--app-selected-border)] bg-[var(--app-selected-bg)]"
                      : "border-[var(--app-border)] bg-[var(--app-surface-2)] hover:bg-[var(--app-hover)]"
                  }`}
                >
                  <span className="flex items-center justify-between text-sm font-medium text-[var(--app-text-primary)]">
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
        </fieldset>

        <fieldset>
          <legend className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--app-text-muted)]">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Görsel efektler
          </legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {EFFECT_OPTIONS.map((option) => {
              const selected = preferences.effectsLevel === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => selectEffects(option.id)}
                  className={`min-h-24 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] ${
                    selected
                      ? "border-[var(--app-selected-border)] bg-[var(--app-selected-bg)]"
                      : "border-[var(--app-border)] bg-[var(--app-surface-2)] hover:bg-[var(--app-hover)]"
                  }`}
                >
                  <span className="flex items-center justify-between text-sm font-medium text-[var(--app-text-primary)]">
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
        </fieldset>
      </div>

      <p className="mt-4 text-xs text-[var(--app-text-muted)]" role="status" aria-live="polite">
        {hydrated ? message : "Görünüm tercihi yükleniyor…"}
      </p>
    </section>
  );
}
