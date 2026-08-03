"use client";

import { Download, FileJson, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { useAppearanceRuntime } from "./appearance-runtime";
import { useCustomThemesRuntime } from "./custom-themes-runtime";
import { createSecureCustomThemeId } from "@/hooks/use-custom-themes";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  allThemesExportFilename,
  applyThemeImport,
  createThemeBundle,
  parseThemeBundleText,
  safeThemeExportFilename,
  type ThemeImportConflictAction,
  type ThemeImportPreview,
} from "@/lib/personalization/theme-bundle";
import {
  downloadThemeBundle,
  readThemeBundleFile,
} from "@/lib/personalization/theme-bundle-browser";

export function ThemeTransferPanel() {
  const appearance = useAppearanceRuntime();
  const customThemes = useCustomThemesRuntime();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedExportId, setSelectedExportId] = useState("");
  const [preview, setPreview] = useState<ThemeImportPreview | null>(null);
  const [decisions, setDecisions] = useState<Record<number, ThemeImportConflictAction>>({});
  const [applyBundleTheme, setApplyBundleTheme] = useState(false);
  const [message, setMessage] = useState("İçe ve dışa aktarma yalnız bu cihazdaki standart tema verisini kullanır.");

  const activeCustomId = appearance.preferences.theme.kind === "custom"
    ? appearance.preferences.theme.id
    : undefined;

  const exportOne = () => {
    const theme = customThemes.themes.find((item) => item.id === selectedExportId);
    if (!theme) {
      setMessage("Dışa aktarılacak özel temayı seç.");
      return;
    }
    const bundle = createThemeBundle([theme], new Date().toISOString(), activeCustomId);
    downloadThemeBundle(bundle, safeThemeExportFilename(theme.name));
    setMessage(`"${theme.name}" JSON dosyası olarak dışa aktarıldı.`);
  };

  const exportAll = () => {
    if (customThemes.themes.length === 0) {
      setMessage("Dışa aktarılacak özel tema yok.");
      return;
    }
    const now = new Date();
    const bundle = createThemeBundle(customThemes.themes, now.toISOString(), activeCustomId);
    downloadThemeBundle(bundle, allThemesExportFilename(now));
    setMessage(`${customThemes.themes.length} özel tema tek bundle içinde dışa aktarıldı.`);
  };

  const selectFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await readThemeBundleFile(file);
      const next = parseThemeBundleText(text, customThemes.themes, file.size);
      setPreview(next);
      setDecisions(Object.fromEntries(next.candidates
        .filter((candidate) => candidate.idConflict !== "none")
        .map((candidate) => [candidate.index, "skip"])));
      setApplyBundleTheme(false);
      setMessage(next.fatalErrors.length > 0
        ? next.fatalErrors.join(" ")
        : "Dosya doğrulandı. Kaydetmeden önce temaları ve çakışmaları incele.");
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof Error && error.message === "theme_file_size"
        ? "Tema dosyası 256 KB sınırını aşıyor."
        : "Yalnızca 256 KB altındaki güvenli JSON tema dosyaları içe aktarılabilir.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const importThemes = () => {
    if (!preview || preview.fatalErrors.length > 0) return;
    const result = applyThemeImport(
      { version: 1, themes: customThemes.themes },
      preview,
      decisions,
      createSecureCustomThemeId,
      new Date().toISOString(),
    );
    customThemes.replaceAll(result.collection.themes);
    if (applyBundleTheme && preview.bundle?.activeTheme?.id) {
      const mapped = result.importedIdMap.get(preview.bundle.activeTheme.id);
      if (mapped && result.collection.themes.some((theme) => theme.id === mapped)) {
        appearance.setThemeSelection({ kind: "custom", id: mapped });
      }
    }
    setMessage(
      `İçe aktarma tamamlandı: ${result.added} eklendi, ${result.updated} güncellendi, `
      + `${result.skipped} atlandı, ${result.rejected} reddedildi.`,
    );
    setPreview(null);
    setDecisions({});
  };

  return (
    <CollapsibleSection
      storageKey="theme-transfer-tools"
      title="Tema içe / dışa aktarma"
      description="Yalnız özel tema girdilerini JSON olarak taşı; profil, medya ve diğer tercihler ayrı kalır."
      badge={<span className="rounded-md border border-[var(--app-border)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--app-text-secondary)]">{customThemes.themes.length} özel tema</span>}
      icon={<FileJson className="h-4 w-4 text-[var(--app-accent-strong)]" />}
      className="mt-4"
      contentClassName="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-[var(--app-panel-padding)]"
      headingLevel="h4"
    >

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="text-xs text-[var(--app-text-muted)]">
          Tek tema
          <select
            value={selectedExportId}
            onChange={(event) => setSelectedExportId(event.target.value)}
            className="app-input mt-1 min-h-11 w-full rounded-lg px-3"
          >
            <option value="">Özel tema seç</option>
            {customThemes.themes.map((theme) => (
              <option key={theme.id} value={theme.id}>{theme.name}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={exportOne} className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--app-border-strong)] px-3 text-sm hover:bg-[var(--app-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]">
          <Download className="h-4 w-4" aria-hidden="true" />
          Seçileni dışa aktar
        </button>
        <button type="button" onClick={exportAll} className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--app-border-strong)] px-3 text-sm hover:bg-[var(--app-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]">
          <Download className="h-4 w-4" aria-hidden="true" />
          Tümünü dışa aktar
        </button>
      </div>

      <div className="mt-4 border-t border-[var(--app-border)] pt-4">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-[var(--app-accent)] px-3 text-sm font-semibold text-[var(--app-accent-contrast)] focus-within:ring-2 focus-within:ring-[var(--app-focus)]">
          <Upload className="h-4 w-4" aria-hidden="true" />
          Tema JSON dosyası seç
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(event) => void selectFile(event.target.files?.[0])}
          />
        </label>
        <span className="ml-3 text-xs text-[var(--app-text-muted)]">Maksimum 256 KB</span>
      </div>

      {preview && (
        <div className="mt-4 rounded-xl border border-[var(--app-border-strong)] bg-[var(--app-surface-2)] p-3">
          {preview.fatalErrors.length > 0 ? (
            <ul className="space-y-1 text-sm text-[var(--app-danger)]" role="alert">
              {preview.fatalErrors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          ) : (
            <>
              <div className="grid gap-2 text-xs sm:grid-cols-5">
                <span>Geçerli: <strong>{preview.validCount}</strong></span>
                <span>Uyarılı: <strong>{preview.warningCount}</strong></span>
                <span>Geçersiz: <strong>{preview.invalidCount}</strong></span>
                <span>Çakışan: <strong>{preview.conflictCount}</strong></span>
                <span>Tahmini toplam: <strong>{preview.projectedTotal}</strong></span>
              </div>
              <div className="mt-3 space-y-2">
                {preview.candidates.map((candidate) => (
                  <article key={candidate.index} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-card-bg)] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h5 className="text-sm font-semibold text-[var(--app-text-primary)]">
                          {candidate.theme?.name ?? `Geçersiz tema ${candidate.index + 1}`}
                        </h5>
                        {candidate.theme && (
                          <div className="mt-2 flex h-7 w-44 overflow-hidden rounded-md border border-black/10" aria-label={`${candidate.theme.name} ana renkleri`}>
                            {Object.entries(candidate.theme.inputs)
                              .filter(([key]) => key !== "colorScheme")
                              .map(([key, color]) => <span key={key} className="flex-1" style={{ backgroundColor: color }} />)}
                          </div>
                        )}
                        <p className="mt-2 text-xs text-[var(--app-text-muted)]">
                          {candidate.validity === "invalid" ? "İçe aktarılmayacak" : candidate.validity === "warning" ? "Kontrast uyarısı var" : "Geçerli"}
                          {candidate.idConflict !== "none" ? ` · ID çakışması: ${candidate.idConflict === "identical" ? "aynı içerik" : "farklı içerik"}` : ""}
                          {candidate.nameConflict ? " · Aynı isimde başka tema var" : ""}
                        </p>
                        {candidate.messages.length > 0 && (
                          <ul className="mt-1 text-xs text-[var(--app-warning)]">
                            {candidate.messages.map((item) => <li key={item}>{item}</li>)}
                          </ul>
                        )}
                      </div>
                      {candidate.theme && candidate.idConflict !== "none" && (
                        <label className="text-xs text-[var(--app-text-muted)]">
                          Çakışma davranışı
                          <select
                            value={decisions[candidate.index] ?? "skip"}
                            onChange={(event) => setDecisions((current) => ({
                              ...current,
                              [candidate.index]: event.target.value as ThemeImportConflictAction,
                            }))}
                            className="app-input mt-1 min-h-11 rounded-lg px-3"
                          >
                            <option value="skip">Atla</option>
                            <option value="replace">Mevcut temayı değiştir</option>
                            <option value="duplicate">Yeni kopya olarak ekle</option>
                          </select>
                        </label>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              {preview.bundle?.activeTheme && (
                <label className="mt-3 flex min-h-11 items-center gap-3 rounded-lg border border-[var(--app-border)] px-3 text-sm">
                  <input type="checkbox" checked={applyBundleTheme} onChange={(event) => setApplyBundleTheme(event.target.checked)} className="h-4 w-4 accent-[var(--app-accent)]" />
                  Dosyada seçili olan temayı içe aktarma sonunda uygula
                </label>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={importThemes} className="min-h-11 rounded-lg bg-[var(--app-accent)] px-3 text-sm font-semibold text-[var(--app-accent-contrast)]">Seçilen kararlarla içe aktar</button>
                <button type="button" onClick={() => setPreview(null)} className="min-h-11 rounded-lg border border-[var(--app-border)] px-3 text-sm hover:bg-[var(--app-hover)]">Vazgeç</button>
              </div>
            </>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-[var(--app-text-muted)]" role="status" aria-live="polite">{message}</p>
    </CollapsibleSection>
  );
}
