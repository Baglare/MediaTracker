"use client";

import { Check, Copy, Edit3, Plus, ShieldAlert, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { ColorField } from "./color-field";
import { ThemeCloudSyncPanel } from "./theme-cloud-sync-panel";
import { ThemePreview } from "./theme-preview";
import { ThemeTransferPanel } from "./theme-transfer-panel";
import { useAppearanceRuntime } from "./appearance-runtime";
import { useCustomThemesRuntime } from "./custom-themes-runtime";
import {
  deriveCustomThemeTokens,
  evaluateThemeContrast,
} from "@/lib/personalization/custom-theme-tokens";
import {
  BASE_THEME_REGISTRY,
  getBaseThemeDefinition,
  PRESET_THEME_INPUTS,
} from "@/lib/personalization/theme-registry";
import type {
  CustomThemeCorrections,
  CustomThemeDefinition,
  CustomThemeInputs,
  PresetThemeId,
} from "@/lib/personalization/types";

type ConfirmAction = (title: string, message: string, onOk: () => void) => void;

interface ThemeDraft {
  id?: string;
  name: string;
  inputs: CustomThemeInputs;
  corrections?: CustomThemeCorrections;
}

const DEFAULT_DRAFT: ThemeDraft = {
  name: "Yeni tema",
  inputs: PRESET_THEME_INPUTS.obsidian,
};

function draftTheme(draft: ThemeDraft): CustomThemeDefinition {
  return {
    version: 1,
    id: draft.id ?? "ct_preview000000",
    name: draft.name,
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
    inputs: draft.inputs,
    corrections: draft.corrections,
  };
}

export function ThemeStudio({ onConfirm }: { onConfirm: ConfirmAction }) {
  const appearance = useAppearanceRuntime();
  const customThemes = useCustomThemesRuntime();
  const [draft, setDraft] = useState<ThemeDraft | null>(null);
  const [message, setMessage] = useState("Hazır veya özel bir tema seçebilirsin.");

  const tokens = useMemo(() => (
    draft ? deriveCustomThemeTokens(draft.inputs, draft.corrections) : null
  ), [draft]);
  const contrast = useMemo(() => (
    tokens ? evaluateThemeContrast(tokens) : null
  ), [tokens]);

  const openPresetCopy = (presetId: PresetThemeId) => {
    const resolvedId = presetId === "system" ? "obsidian" : presetId;
    const definition = BASE_THEME_REGISTRY[presetId];
    setDraft({
      name: `${definition.label} · Kopya`.slice(0, 40),
      inputs: { ...PRESET_THEME_INPUTS[resolvedId] },
    });
  };

  const openCustom = (theme: CustomThemeDefinition) => {
    setDraft({
      id: theme.id,
      name: theme.name,
      inputs: { ...theme.inputs },
      corrections: theme.corrections ? { ...theme.corrections } : undefined,
    });
  };

  const updateInput = <K extends keyof CustomThemeInputs>(
    key: K,
    value: CustomThemeInputs[K],
  ) => {
    setDraft((current) => current ? {
      ...current,
      inputs: { ...current.inputs, [key]: value },
      corrections: undefined,
    } : current);
  };

  const save = (apply: boolean) => {
    if (!draft || !contrast) return;
    if (!draft.name.trim() || draft.name.trim().length > 40) {
      setMessage("Tema adı 1–40 karakter olmalıdır.");
      return;
    }
    if (!contrast.valid) {
      setMessage("Kritik kontrast uyarılarını otomatik düzeltmeden tema etkinleştirilemez.");
      return;
    }
    try {
      const saved = draft.id
        ? customThemes.update(draft.id, draft)
        : customThemes.create(draft);
      if (apply) appearance.setThemeSelection({ kind: "custom", id: saved.id });
      appearance.clearThemePreview();
      setDraft(null);
      setMessage(apply ? "Özel tema kaydedildi ve uygulandı." : "Özel tema kaydedildi.");
    } catch (error) {
      setMessage(error instanceof Error && error.message === "custom_theme_limit"
        ? "En fazla 20 özel tema kaydedebilirsin."
        : "Tema kaydedilemedi. Alanları kontrol et.");
    }
  };

  const removeTheme = (theme: CustomThemeDefinition) => {
    onConfirm(
      "Özel temayı sil",
      `"${theme.name}" teması silinecek. Bu işlem hazır temaları etkilemez.`,
      () => {
        if (appearance.preferences.theme.kind === "custom"
          && appearance.preferences.theme.id === theme.id) {
          appearance.setThemeSelection({ kind: "preset", id: "obsidian" });
        }
        customThemes.remove(theme.id);
        appearance.clearThemePreview();
        if (draft?.id === theme.id) setDraft(null);
        setMessage("Özel tema silindi; aktifse Obsidyen'e dönüldü.");
      },
    );
  };

  return (
    <div className="mt-6 border-t border-[var(--app-border)] pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--app-text-primary)]">Tema Stüdyosu</h3>
          <p className="mt-1 text-xs text-[var(--app-text-muted)]">
            Hazır temaları kullan veya dört kontrollü renkten kendi semantic temanı üret.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDraft({ ...DEFAULT_DRAFT, inputs: { ...DEFAULT_DRAFT.inputs } })}
          disabled={customThemes.themes.length >= 20}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--app-accent)] px-3 text-sm font-semibold text-[var(--app-accent-contrast)] disabled:cursor-not-allowed disabled:bg-[var(--app-disabled-bg)] disabled:text-[var(--app-disabled-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Yeni özel tema
        </button>
      </div>

      <h4 className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--app-text-muted)]">Hazır temalar</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Object.values(BASE_THEME_REGISTRY).map((theme) => {
          const selected = appearance.preferences.theme.kind === "preset"
            && appearance.preferences.theme.id === theme.id;
          const previewId = theme.id === "system" ? "obsidian" : theme.id;
          const preview = getBaseThemeDefinition(previewId);
          return (
            <article
              key={theme.id}
              className={`rounded-xl border p-3 ${
                selected
                  ? "border-[var(--app-selected-border)] bg-[var(--app-selected-bg)]"
                  : "border-[var(--app-border)] bg-[var(--app-surface-2)]"
              }`}
            >
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => appearance.setThemeSelection({ kind: "preset", id: theme.id })}
                className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"
              >
                <span className="flex h-8 overflow-hidden rounded-lg border border-black/10" aria-hidden="true">
                  {[
                    preview.tokens.background,
                    preview.tokens.surface1,
                    preview.tokens.accent,
                    preview.tokens.secondaryAccent,
                  ].map((color) => <span key={color} className="flex-1" style={{ backgroundColor: color }} />)}
                </span>
                <span className="mt-3 flex items-center justify-between gap-2 text-sm font-semibold text-[var(--app-text-primary)]">
                  {theme.label}
                  {selected && <Check className="h-4 w-4" aria-hidden="true" />}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-[var(--app-text-muted)]">{theme.description}</span>
              </button>
              <button
                type="button"
                onClick={() => openPresetCopy(theme.id)}
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--app-border)] px-3 text-xs text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                Özel tema olarak kopyala
              </button>
            </article>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--app-text-muted)]">Özel temalar</h4>
        <span className="text-xs text-[var(--app-text-muted)]">{customThemes.themes.length}/20</span>
      </div>
      {customThemes.themes.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-[var(--app-border-strong)] bg-[var(--app-surface-2)] p-4 text-sm text-[var(--app-text-muted)]">
          Henüz özel tema yok. Sıfırdan oluşturabilir veya bir hazır temayı kopyalayabilirsin.
        </p>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {customThemes.themes.map((theme) => {
            const report = evaluateThemeContrast(deriveCustomThemeTokens(theme.inputs, theme.corrections));
            const selected = appearance.preferences.theme.kind === "custom"
              && appearance.preferences.theme.id === theme.id;
            return (
              <article key={theme.id} className={`rounded-xl border p-3 ${selected ? "border-[var(--app-selected-border)] bg-[var(--app-selected-bg)]" : "border-[var(--app-border)] bg-[var(--app-surface-2)]"}`}>
                <div className="flex h-8 overflow-hidden rounded-lg border border-black/10" aria-hidden="true">
                  {Object.entries(theme.inputs).filter(([key]) => key !== "colorScheme").map(([key, color]) => (
                    <span key={key} className="flex-1" style={{ backgroundColor: color }} />
                  ))}
                </div>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div>
                    <h5 className="text-sm font-semibold text-[var(--app-text-primary)]">{theme.name}</h5>
                    <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                      {theme.inputs.colorScheme === "dark" ? "Koyu" : "Açık"} · {report.valid ? "Kontrast uygun" : "Kontrast düzeltmesi gerekli"}
                    </p>
                  </div>
                  {selected && <span className="rounded-full bg-[var(--app-selected-bg)] px-2 py-1 text-[11px] font-semibold text-[var(--app-selected-text)]">Aktif</span>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => appearance.setThemeSelection({ kind: "custom", id: theme.id })} disabled={!report.valid} className="min-h-10 rounded-lg bg-[var(--app-accent)] px-3 text-xs font-semibold text-[var(--app-accent-contrast)] disabled:cursor-not-allowed disabled:bg-[var(--app-disabled-bg)] disabled:text-[var(--app-disabled-text)]">Aktif et</button>
                  <button type="button" onClick={() => openCustom(theme)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-[var(--app-border)] px-3 text-xs hover:bg-[var(--app-hover)]"><Edit3 className="h-3.5 w-3.5" aria-hidden="true" />Düzenle / yeniden adlandır</button>
                  <button type="button" onClick={() => { try { customThemes.duplicate(theme.id); setMessage("Tema kopyalandı."); } catch { setMessage("Tema kopyalanamadı; 20 tema sınırını kontrol et."); } }} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-[var(--app-border)] px-3 text-xs hover:bg-[var(--app-hover)]"><Copy className="h-3.5 w-3.5" aria-hidden="true" />Kopyala</button>
                  <button type="button" onClick={() => removeTheme(theme)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-[var(--app-danger)] px-3 text-xs text-[var(--app-danger)] hover:bg-[var(--app-danger-soft)]"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Sil</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {draft && tokens && contrast && (
        <section className="mt-6 rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface-1)] p-[var(--app-panel-padding)]" aria-labelledby="theme-editor-title">
          <div className="flex items-center justify-between gap-3">
            <h4 id="theme-editor-title" className="text-sm font-semibold text-[var(--app-text-primary)]">
              {draft.id ? "Özel temayı düzenle" : "Özel tema oluştur"}
            </h4>
            <button type="button" aria-label="Tema editörünü kapat" onClick={() => { appearance.clearThemePreview(); setDraft(null); }} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-[var(--app-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"><X className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)]">
            <div className="space-y-4">
              <label className="block text-sm font-medium text-[var(--app-text-primary)]">
                Tema adı
                <input value={draft.name} maxLength={40} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="app-input mt-1 min-h-11 w-full rounded-lg px-3" />
              </label>
              <fieldset>
                <legend className="text-sm font-medium text-[var(--app-text-primary)]">Tema karakteri</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(["light", "dark"] as const).map((scheme) => (
                    <button key={scheme} type="button" aria-pressed={draft.inputs.colorScheme === scheme} onClick={() => updateInput("colorScheme", scheme)} className={`min-h-11 rounded-lg border px-3 text-sm ${draft.inputs.colorScheme === scheme ? "border-[var(--app-selected-border)] bg-[var(--app-selected-bg)] text-[var(--app-selected-text)]" : "border-[var(--app-border)]"}`}>
                      {scheme === "light" ? "Açık" : "Koyu"}
                    </button>
                  ))}
                </div>
              </fieldset>
              <ColorField label="Arka plan" value={draft.inputs.background} defaultValue={DEFAULT_DRAFT.inputs.background} onChange={(value) => updateInput("background", value)} />
              <ColorField label="Ana yüzey" value={draft.inputs.surface} defaultValue={DEFAULT_DRAFT.inputs.surface} onChange={(value) => updateInput("surface", value)} />
              <ColorField label="Ana vurgu" value={draft.inputs.accent} defaultValue={DEFAULT_DRAFT.inputs.accent} onChange={(value) => updateInput("accent", value)} />
              <ColorField label="İkincil vurgu" value={draft.inputs.secondaryAccent} defaultValue={DEFAULT_DRAFT.inputs.secondaryAccent} onChange={(value) => updateInput("secondaryAccent", value)} />
            </div>
            <div className="space-y-4">
              <ThemePreview tokens={tokens} />
              <div className={`rounded-xl border p-3 ${contrast.valid ? "border-[var(--app-action-success-border)] bg-[var(--app-action-success-bg)]" : "border-[var(--app-danger)] bg-[var(--app-danger-soft)]"}`} aria-live="polite">
                <p className={`flex items-center gap-2 text-sm font-semibold ${contrast.valid ? "text-[var(--app-action-success-text)]" : "text-[var(--app-danger)]"}`}>
                  <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                  {contrast.warnings.length === 0 ? "Kontrast kontrolleri uygun" : `${contrast.warnings.length} okunabilirlik uyarısı`}
                </p>
                {contrast.warnings.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-[var(--app-text-secondary)]">
                    {contrast.warnings.map((warning) => <li key={warning.key}>{warning.message}{warning.ratio ? ` (${warning.ratio}:1)` : ""}</li>)}
                  </ul>
                )}
                {contrast.corrections && (
                  <button type="button" onClick={() => setDraft({ ...draft, corrections: contrast.corrections })} className="mt-3 min-h-10 rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-surface-2)] px-3 text-xs font-semibold hover:bg-[var(--app-hover)]">
                    Otomatik düzelt
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => appearance.previewCustomTheme(draftTheme(draft))} className="min-h-11 rounded-lg border border-[var(--app-border-strong)] px-3 text-sm font-medium hover:bg-[var(--app-hover)]">Uygulamada geçici önizle</button>
                <button type="button" onClick={() => save(false)} className="min-h-11 rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-surface-2)] px-3 text-sm font-medium">Yalnız kaydet</button>
                <button type="button" onClick={() => save(true)} className="min-h-11 rounded-lg bg-[var(--app-accent)] px-3 text-sm font-semibold text-[var(--app-accent-contrast)]">Kaydet ve uygula</button>
                <button type="button" onClick={() => { appearance.clearThemePreview(); setDraft(null); }} className="min-h-11 rounded-lg px-3 text-sm text-[var(--app-text-secondary)] hover:bg-[var(--app-hover)]">Vazgeç</button>
              </div>
            </div>
          </div>
        </section>
      )}

      <ThemeTransferPanel />
      <ThemeCloudSyncPanel onConfirm={onConfirm} />

      <p className="mt-4 text-xs text-[var(--app-text-muted)]" role="status" aria-live="polite">{message}</p>
    </div>
  );
}
