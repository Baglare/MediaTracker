"use client";

import { Check, Palette, RotateCcw } from "lucide-react";
import { useState } from "react";

import { useAppearanceRuntime } from "./appearance-runtime";
import { BASE_THEME_REGISTRY, getBaseThemeDefinition } from "@/lib/personalization/theme-registry";
import type { AccentMode, BaseThemeId, ResolvedBaseThemeId } from "@/lib/personalization/types";
import { WORLD_THEME_REGISTRY } from "@/lib/personalization/world-theme-registry";

export interface AppearanceThemeOption {
  id: BaseThemeId;
  label: string;
  description: string;
  previewThemes: readonly ResolvedBaseThemeId[];
}

export interface AppearanceAccentOption {
  id: AccentMode;
  label: string;
  description: string;
  preview: string;
}

export const APPEARANCE_THEME_OPTIONS: readonly AppearanceThemeOption[] = [
  { id: "system", label: "Sistem", description: BASE_THEME_REGISTRY.system.description, previewThemes: ["obsidian", "porcelain"] },
  { id: "obsidian", label: "Obsidyen", description: BASE_THEME_REGISTRY.obsidian.description, previewThemes: ["obsidian"] },
  { id: "porcelain", label: "Porselen", description: BASE_THEME_REGISTRY.porcelain.description, previewThemes: ["porcelain"] },
  { id: "ocean", label: "Okyanus", description: BASE_THEME_REGISTRY.ocean.description, previewThemes: ["ocean"] },
];

export const APPEARANCE_ACCENT_OPTIONS: readonly AppearanceAccentOption[] = [
  { id: "auto", label: "Otomatik", description: "Aktif içerik dünyasını izler.", preview: "linear-gradient(90deg, #e8b86a, #6fb0e0, #b8956a)" },
  { id: "theme", label: "Tema rengi", description: "Seçili temel temanın kendi vurgusunu kullanır.", preview: "var(--app-accent)" },
  { id: "east", label: WORLD_THEME_REGISTRY.east.label, description: "Sıcak altın ve lake vurgusunu sabitler.", preview: WORLD_THEME_REGISTRY.east.primary },
  { id: "screen", label: WORLD_THEME_REGISTRY.screen.label, description: "Sinema mavisi vurgusunu sabitler.", preview: WORLD_THEME_REGISTRY.screen.primary },
  { id: "arch", label: WORLD_THEME_REGISTRY.arch.label, description: "Parşömen altını vurgusunu sabitler.", preview: WORLD_THEME_REGISTRY.arch.primary },
  { id: "neutral", label: "Nötr", description: "Ana uygulama vurgusunu sakin ve nötr tutar.", preview: WORLD_THEME_REGISTRY.neutral.primary },
];

function themePreviewColors(option: AppearanceThemeOption): string[] {
  return option.previewThemes.flatMap((themeId) => {
    const definition = getBaseThemeDefinition(themeId);
    return [definition.tokens.background, definition.tokens.surface2, definition.tokens.accent];
  });
}

export default function AppearanceSettingsCard() {
  const { preferences, hydrated, updatePreference, resetToDefaults, resolvedTheme } = useAppearanceRuntime();
  const [message, setMessage] = useState("Görünüm seçimleri bu cihazda anında kaydedilir.");

  const selectTheme = (theme: BaseThemeId) => {
    updatePreference("baseTheme", theme);
    setMessage("Tema seçimi kaydedildi.");
  };

  const selectAccent = (accent: AccentMode) => {
    updatePreference("accentMode", accent);
    setMessage("Dünya vurgusu kaydedildi.");
  };

  const reset = () => {
    resetToDefaults();
    setMessage("Görünüm Obsidyen ve otomatik vurgu varsayılanına döndü.");
  };

  return (
    <section className="app-panel rounded-2xl border p-5 sm:p-6 lg:col-span-2" aria-labelledby="appearance-settings-title">
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

      <fieldset className="mt-6">
        <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--app-text-muted)]">Tema</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {APPEARANCE_THEME_OPTIONS.map((option) => {
            const selected = preferences.baseTheme === option.id;
            const colors = themePreviewColors(option);
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => selectTheme(option.id)}
                className={`relative min-h-36 rounded-xl border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] ${
                  selected
                    ? "border-[var(--app-accent)] bg-[var(--app-selected)]"
                    : "border-[var(--app-border)] bg-[var(--app-surface-2)] hover:border-[var(--app-border-strong)] hover:bg-[var(--app-hover)]"
                }`}
              >
                <span className="flex h-10 overflow-hidden rounded-lg border border-black/10" aria-hidden="true">
                  {colors.map((color, index) => <span key={`${color}-${index}`} className="flex-1" style={{ background: color }} />)}
                </span>
                <span className="mt-3 flex items-center justify-between gap-2 text-sm font-semibold text-[var(--app-text-primary)]">
                  {option.label}
                  {selected && <Check className="h-4 w-4 text-[var(--app-accent-strong)]" aria-hidden="true" />}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-[var(--app-text-muted)]">{option.description}</span>
              </button>
            );
          })}
        </div>
        {preferences.baseTheme === "system" && (
          <p className="mt-2 text-xs text-[var(--app-text-muted)]">Şu anda sistem tercihi {resolvedTheme === "porcelain" ? "açık" : "koyu"} olarak çözüldü.</p>
        )}
      </fieldset>

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

      <p className="mt-4 text-xs text-[var(--app-text-muted)]" role="status" aria-live="polite">
        {hydrated ? message : "Görünüm tercihi yükleniyor…"}
      </p>
    </section>
  );
}
