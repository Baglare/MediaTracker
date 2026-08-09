import {
  MAX_CUSTOM_THEMES,
  normalizeCustomThemeDefinition,
  normalizeCustomThemeName,
  type CustomThemeCollection,
} from "./custom-themes";
import {
  deriveCustomThemeTokens,
  evaluateThemeContrast,
} from "./custom-theme-tokens";
import type { CustomThemeDefinition } from "./types";

export const THEME_BUNDLE_FORMAT = "mediatracker-theme-bundle" as const;
export const THEME_BUNDLE_VERSION = 1 as const;
export const MAX_THEME_BUNDLE_BYTES = 256 * 1024;

export interface MediaTrackerThemeBundleV1 {
  format: typeof THEME_BUNDLE_FORMAT;
  version: typeof THEME_BUNDLE_VERSION;
  exportedAt: string;
  application: "MediaTracker";
  themes: CustomThemeDefinition[];
  activeTheme?: { kind: "custom"; id: string };
}

export type ThemeImportConflictAction = "skip" | "replace" | "duplicate";

export interface ThemeImportCandidate {
  index: number;
  theme?: CustomThemeDefinition;
  validity: "valid" | "warning" | "invalid";
  messages: string[];
  idConflict: "none" | "identical" | "different";
  nameConflict: boolean;
  defaultAction: ThemeImportConflictAction | "add";
}

export interface ThemeImportPreview {
  bundle?: MediaTrackerThemeBundleV1;
  fatalErrors: string[];
  candidates: ThemeImportCandidate[];
  validCount: number;
  warningCount: number;
  invalidCount: number;
  conflictCount: number;
  projectedTotal: number;
}

export interface ThemeImportApplyResult {
  collection: CustomThemeCollection;
  added: number;
  updated: number;
  skipped: number;
  rejected: number;
  importedIdMap: ReadonlyMap<string, string>;
}

const THEME_KEYS = new Set([
  "version", "id", "name", "createdAt", "updatedAt", "inputs", "corrections",
]);
const INPUT_KEYS = new Set([
  "colorScheme", "background", "surface", "accent", "secondaryAccent",
  "textColorMode", "textPrimary", "textSecondary", "textMuted",
]);
const CORRECTION_KEYS = new Set([
  "textPrimary", "textSecondary", "textMuted", "border", "borderStrong", "focus",
]);
const BUNDLE_KEYS = new Set([
  "format", "version", "exportedAt", "application", "themes", "activeTheme",
]);
const ACTIVE_KEYS = new Set(["kind", "id"]);
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key) && !DANGEROUS_KEYS.has(key));
}

function hasDangerousKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasDangerousKey);
  if (!isPlainObject(value)) return false;
  return Object.keys(value).some((key) => (
    DANGEROUS_KEYS.has(key) || hasDangerousKey(value[key])
  ));
}

function strictTheme(value: unknown): { theme?: CustomThemeDefinition; messages: string[] } {
  const messages: string[] = [];
  if (!isPlainObject(value)) return { messages: ["Tema kaydı bir nesne olmalıdır."] };
  if (!hasOnlyKeys(value, THEME_KEYS)) messages.push("Tema kaydı bilinmeyen veya güvensiz alan içeriyor.");
  if (!isPlainObject(value.inputs) || !hasOnlyKeys(value.inputs, INPUT_KEYS)) {
    messages.push("Tema ana renk girdileri geçersiz.");
  }
  if (value.corrections !== undefined
    && (!isPlainObject(value.corrections) || !hasOnlyKeys(value.corrections, CORRECTION_KEYS))) {
    messages.push("Tema düzeltme alanları geçersiz.");
  }
  if (hasDangerousKey(value)) messages.push("Tema kaydı güvensiz anahtar içeriyor.");
  const theme = messages.length === 0 ? normalizeCustomThemeDefinition(value) : null;
  if (!theme) messages.push("Tema kimliği, adı, tarihi veya renkleri geçersiz.");
  if (!theme) return { messages: [...new Set(messages)] };

  try {
    const report = evaluateThemeContrast(deriveCustomThemeTokens(theme.inputs, theme.corrections));
    messages.push(...report.warnings.map((warning) => warning.message));
  } catch {
    return { messages: ["Tema tokenları güvenli biçimde üretilemedi."] };
  }
  return { theme, messages: [...new Set(messages)] };
}

export function validateCanonicalThemeList(value: unknown): {
  ok: boolean;
  themes: CustomThemeDefinition[];
  errors: string[];
} {
  if (!Array.isArray(value) || value.length > MAX_CUSTOM_THEMES) {
    return { ok: false, themes: [], errors: ["Tema listesi 0–20 kayıt içermelidir."] };
  }
  const themes: CustomThemeDefinition[] = [];
  const errors: string[] = [];
  const ids = new Set<string>();
  value.forEach((candidate, index) => {
    const result = strictTheme(candidate);
    if (!result.theme) {
      errors.push(`Tema ${index + 1}: ${result.messages.join(" ")}`);
      return;
    }
    if (ids.has(result.theme.id)) {
      errors.push(`Tema ${index + 1}: yinelenen tema kimliği.`);
      return;
    }
    ids.add(result.theme.id);
    themes.push(result.theme);
  });
  return { ok: errors.length === 0, themes, errors };
}

function canonicalTheme(theme: CustomThemeDefinition): CustomThemeDefinition {
  const normalized = normalizeCustomThemeDefinition(theme);
  if (!normalized) throw new Error("invalid_custom_theme");
  return normalized;
}

export function createThemeBundle(
  themes: readonly CustomThemeDefinition[],
  exportedAt: string,
  activeThemeId?: string,
): MediaTrackerThemeBundleV1 {
  const canonical = themes.map(canonicalTheme);
  if (canonical.length === 0 || canonical.length > MAX_CUSTOM_THEMES) {
    throw new Error("invalid_theme_export_count");
  }
  const active = activeThemeId && canonical.some((theme) => theme.id === activeThemeId)
    ? { kind: "custom" as const, id: activeThemeId }
    : undefined;
  return {
    format: THEME_BUNDLE_FORMAT,
    version: THEME_BUNDLE_VERSION,
    exportedAt,
    application: "MediaTracker",
    themes: canonical,
    activeTheme: active,
  };
}

export function serializeThemeBundle(bundle: MediaTrackerThemeBundleV1): string {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

export function safeThemeExportFilename(name: string): string {
  const safe = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `mediatracker-theme-${safe || "custom"}.json`;
}

export function allThemesExportFilename(now: Date): string {
  return `mediatracker-themes-${now.toISOString().slice(0, 10)}.json`;
}

export function parseThemeBundleText(
  text: string,
  localThemes: readonly CustomThemeDefinition[],
  byteLength = new TextEncoder().encode(text).byteLength,
): ThemeImportPreview {
  if (byteLength > MAX_THEME_BUNDLE_BYTES) {
    return emptyPreview(["Tema dosyası 256 KB sınırını aşıyor."]);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return emptyPreview(["Tema dosyası geçerli JSON değil."]);
  }
  if (!isPlainObject(parsed) || hasDangerousKey(parsed) || !hasOnlyKeys(parsed, BUNDLE_KEYS)) {
    return emptyPreview(["Tema bundle nesnesi bilinmeyen veya güvensiz alan içeriyor."]);
  }
  if (parsed.format !== THEME_BUNDLE_FORMAT
    || parsed.version !== THEME_BUNDLE_VERSION
    || parsed.application !== "MediaTracker"
    || typeof parsed.exportedAt !== "string"
    || !Number.isFinite(Date.parse(parsed.exportedAt))
    || !Array.isArray(parsed.themes)) {
    return emptyPreview(["Tema bundle formatı veya sürümü desteklenmiyor."]);
  }
  if (parsed.themes.length === 0 || parsed.themes.length > MAX_CUSTOM_THEMES) {
    return emptyPreview(["Bundle 1–20 tema içermelidir."]);
  }
  let activeTheme: MediaTrackerThemeBundleV1["activeTheme"];
  if (parsed.activeTheme !== undefined) {
    if (!isPlainObject(parsed.activeTheme)
      || !hasOnlyKeys(parsed.activeTheme, ACTIVE_KEYS)
      || parsed.activeTheme.kind !== "custom"
      || typeof parsed.activeTheme.id !== "string") {
      return emptyPreview(["Bundle aktif tema bilgisi geçersiz."]);
    }
    activeTheme = { kind: "custom", id: parsed.activeTheme.id };
  }

  const candidates = parsed.themes.map((value, index): ThemeImportCandidate => {
    const validated = strictTheme(value);
    if (!validated.theme) {
      return {
        index,
        validity: "invalid",
        messages: validated.messages,
        idConflict: "none",
        nameConflict: false,
        defaultAction: "skip",
      };
    }
    const current = localThemes.find((theme) => theme.id === validated.theme?.id);
    const idConflict = !current
      ? "none"
      : sameThemeContent(current, validated.theme) ? "identical" : "different";
    const nameConflict = localThemes.some((theme) => (
      theme.id !== validated.theme?.id
      && theme.name.toLocaleLowerCase("tr") === validated.theme?.name.toLocaleLowerCase("tr")
    ));
    return {
      index,
      theme: validated.theme,
      validity: validated.messages.length > 0 ? "warning" : "valid",
      messages: validated.messages,
      idConflict,
      nameConflict,
      defaultAction: idConflict === "none" ? "add" : "skip",
    };
  });
  const usable = candidates.filter((candidate) => candidate.theme && candidate.defaultAction === "add").length;
  const bundle: MediaTrackerThemeBundleV1 = {
    format: THEME_BUNDLE_FORMAT,
    version: THEME_BUNDLE_VERSION,
    exportedAt: parsed.exportedAt,
    application: "MediaTracker",
    themes: candidates.flatMap((candidate) => candidate.theme ? [candidate.theme] : []),
    activeTheme,
  };
  return {
    bundle,
    fatalErrors: [],
    candidates,
    validCount: candidates.filter((candidate) => candidate.validity === "valid").length,
    warningCount: candidates.filter((candidate) => candidate.validity === "warning").length,
    invalidCount: candidates.filter((candidate) => candidate.validity === "invalid").length,
    conflictCount: candidates.filter((candidate) => candidate.idConflict !== "none").length,
    projectedTotal: localThemes.length + usable,
  };
}

function emptyPreview(fatalErrors: string[]): ThemeImportPreview {
  return {
    fatalErrors,
    candidates: [],
    validCount: 0,
    warningCount: 0,
    invalidCount: 0,
    conflictCount: 0,
    projectedTotal: 0,
  };
}

export function sameThemeContent(
  first: CustomThemeDefinition,
  second: CustomThemeDefinition,
): boolean {
  return JSON.stringify({
    name: first.name,
    inputs: first.inputs,
    corrections: first.corrections ?? {},
  }) === JSON.stringify({
    name: second.name,
    inputs: second.inputs,
    corrections: second.corrections ?? {},
  });
}

export function applyThemeImport(
  current: CustomThemeCollection,
  preview: ThemeImportPreview,
  decisions: Readonly<Record<number, ThemeImportConflictAction>>,
  generateId: () => string,
  now: string,
): ThemeImportApplyResult {
  const themes = [...current.themes];
  const importedIdMap = new Map<string, string>();
  let added = 0;
  let updated = 0;
  let skipped = 0;
  let rejected = 0;

  for (const candidate of preview.candidates) {
    if (!candidate.theme) {
      rejected += 1;
      continue;
    }
    const action = candidate.idConflict === "none"
      ? "add"
      : decisions[candidate.index] ?? "skip";
    if (action === "skip") {
      if (candidate.idConflict === "identical") {
        importedIdMap.set(candidate.theme.id, candidate.theme.id);
      }
      skipped += 1;
      continue;
    }
    if (action === "replace") {
      const targetIndex = themes.findIndex((theme) => theme.id === candidate.theme?.id);
      if (targetIndex < 0) {
        skipped += 1;
        continue;
      }
      themes[targetIndex] = canonicalTheme({
        ...candidate.theme,
        createdAt: themes[targetIndex].createdAt,
        updatedAt: now,
      });
      importedIdMap.set(candidate.theme.id, candidate.theme.id);
      updated += 1;
      continue;
    }
    if (themes.length >= MAX_CUSTOM_THEMES) {
      rejected += 1;
      continue;
    }
    const duplicate = action === "duplicate";
    const imported = canonicalTheme({
      ...candidate.theme,
      id: duplicate ? generateId() : candidate.theme.id,
      name: duplicate
        ? importedCopyName(candidate.theme.name)
        : candidate.theme.name,
      createdAt: now,
      updatedAt: now,
    });
    themes.push(imported);
    importedIdMap.set(candidate.theme.id, imported.id);
    added += 1;
  }
  return {
    collection: { version: 1, themes },
    added,
    updated,
    skipped,
    rejected,
    importedIdMap,
  };
}

function importedCopyName(name: string): string {
  const suffix = " · İçe Aktarılan";
  return normalizeCustomThemeName(`${name.slice(0, 40 - suffix.length)}${suffix}`)
    ?? "İçe Aktarılan Tema";
}
