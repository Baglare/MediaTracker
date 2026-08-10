import {
  bestContrastingText,
  contrastRatio,
  hexToRgba,
  mixHexColors,
  normalizeHexColor,
} from "./color-utils";
import type {
  AppThemeTokens,
  CustomThemeCorrections,
  CustomThemeInputs,
  ThemeContrastReport,
} from "./types";

function minimumContrast(foreground: string, backgrounds: string[]): number {
  return Math.min(...backgrounds.map((background) => contrastRatio(foreground, background)));
}

function bestForegroundFor(backgrounds: string[]): "#000000" | "#FFFFFF" {
  return minimumContrast("#000000", backgrounds) >= minimumContrast("#FFFFFF", backgrounds)
    ? "#000000"
    : "#FFFFFF";
}

function accessibleForeground(
  preferred: string,
  backgrounds: string[],
  threshold: number,
): string {
  if (minimumContrast(preferred, backgrounds) >= threshold) return preferred;
  return bestForegroundFor(backgrounds);
}

function tonedForeground(
  primary: string,
  backgrounds: string[],
  threshold: number,
  maximumSurfaceWeight: number,
): string {
  const reference = backgrounds[0];
  for (let weight = maximumSurfaceWeight; weight >= 0; weight -= 0.02) {
    const candidate = mixHexColors(primary, reference, Math.max(0, weight));
    if (minimumContrast(candidate, backgrounds) >= threshold) return candidate;
  }
  return primary;
}

const RGBA_COLOR = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0(?:\.\d+)?|1(?:\.0+)?)\s*\)$/i;

function opaqueColorOn(color: string, background: string): string {
  const hex = normalizeHexColor(color);
  if (hex) return hex;
  const match = color.match(RGBA_COLOR);
  if (!match) return background;
  const alpha = Number(match[4]);
  const foreground = `#${[match[1], match[2], match[3]]
    .map((channel) => Math.min(255, Number(channel)).toString(16).padStart(2, "0"))
    .join("")}`;
  return mixHexColors(background, foreground, alpha);
}

export function normalizeCustomThemeInputs(value: unknown): CustomThemeInputs | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const input = value as Partial<Record<keyof CustomThemeInputs, unknown>>;
  if (input.colorScheme !== "light" && input.colorScheme !== "dark") return null;
  const background = normalizeHexColor(input.background);
  const surface = normalizeHexColor(input.surface);
  const accent = normalizeHexColor(input.accent);
  const secondaryAccent = normalizeHexColor(input.secondaryAccent);
  if (!background || !surface || !accent || !secondaryAccent) return null;
  const textColorMode = input.textColorMode === "custom" ? "custom" : "auto";
  const textPrimary = textColorMode === "custom" ? normalizeHexColor(input.textPrimary) : undefined;
  const textSecondary = textColorMode === "custom" ? normalizeHexColor(input.textSecondary) : undefined;
  const textMuted = textColorMode === "custom" ? normalizeHexColor(input.textMuted) : undefined;
  if (textColorMode === "custom" && (!textPrimary || !textSecondary || !textMuted)) return null;
  return {
    colorScheme: input.colorScheme,
    background,
    surface,
    accent,
    secondaryAccent,
    textColorMode,
    ...(textPrimary && textSecondary && textMuted ? { textPrimary, textSecondary, textMuted } : {}),
  };
}

export function normalizeThemeCorrections(value: unknown): CustomThemeCorrections | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const keys: Array<keyof CustomThemeCorrections> = [
    "textPrimary",
    "textSecondary",
    "textMuted",
    "border",
    "borderStrong",
    "focus",
  ];
  const normalized: CustomThemeCorrections = {};
  for (const key of keys) {
    const color = normalizeHexColor(input[key]);
    if (color) normalized[key] = color;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function deriveCustomThemeTokens(
  value: CustomThemeInputs,
  corrections?: CustomThemeCorrections,
): AppThemeTokens {
  const inputs = normalizeCustomThemeInputs(value);
  if (!inputs) throw new Error("invalid_custom_theme_inputs");

  const dark = inputs.colorScheme === "dark";
  const initialPrimary = inputs.textColorMode === "custom"
    ? inputs.textPrimary!
    : bestForegroundFor([inputs.background, inputs.surface]);
  const textPrimary = initialPrimary;
  const surface2 = mixHexColors(inputs.surface, textPrimary, dark ? 0.08 : 0.07);
  const surface3 = mixHexColors(inputs.surface, textPrimary, dark ? 0.15 : 0.13);
  const textSurfaces = [inputs.background, inputs.surface, surface2];
  const border = mixHexColors(inputs.surface, textPrimary, dark ? 0.20 : 0.16);
  const borderStrong = mixHexColors(inputs.surface, textPrimary, dark ? 0.34 : 0.28);
  const accentStrong = mixHexColors(inputs.accent, bestForegroundFor([inputs.accent]), 0.18);
  const selectedBackground = mixHexColors(inputs.surface, inputs.accent, dark ? 0.22 : 0.14);
  const dangerBase = dark ? "#FB7185" : "#BE123C";
  const successBase = dark ? "#34D399" : "#047857";
  const warningBase = dark ? "#FBBF24" : "#B45309";
  const dangerSoft = mixHexColors(inputs.surface, dangerBase, 0.12);
  const successSoft = mixHexColors(inputs.surface, successBase, 0.12);
  const warningSoft = mixHexColors(inputs.surface, warningBase, 0.12);
  const actionAccentBackground = mixHexColors(inputs.surface, inputs.accent, dark ? 0.16 : 0.11);
  const base: AppThemeTokens = {
    background: inputs.background,
    surface1: inputs.surface,
    surface2,
    surface3,
    elevated: mixHexColors(inputs.surface, dark ? "#FFFFFF" : "#FFFFFF", dark ? 0.05 : 0.32),
    textPrimary,
    textSecondary: inputs.textColorMode === "custom"
      ? inputs.textSecondary!
      : tonedForeground(textPrimary, textSurfaces, 4.5, dark ? 0.23 : 0.20),
    textMuted: inputs.textColorMode === "custom"
      ? inputs.textMuted!
      : tonedForeground(textPrimary, textSurfaces, 3, dark ? 0.48 : 0.43),
    border,
    borderStrong,
    scrollbarThumbHover: mixHexColors(inputs.surface, textPrimary, 0.42),
    shadow: hexToRgba(dark ? "#000000" : "#1C1917", dark ? 0.38 : 0.15),
    overlay: hexToRgba(dark ? "#020617" : "#1C1917", dark ? 0.76 : 0.48),
    focus: accessibleForeground(accentStrong, textSurfaces, 3),
    accent: inputs.accent,
    accentStrong,
    accentSoft: hexToRgba(inputs.accent, dark ? 0.20 : 0.14),
    accentContrast: bestForegroundFor([inputs.accent]),
    danger: accessibleForeground(dangerBase, [dangerSoft], 4.5),
    dangerSoft,
    success: accessibleForeground(successBase, [successSoft], 4.5),
    successSoft,
    warning: accessibleForeground(warningBase, [warningSoft], 4.5),
    warningSoft,
    inputBackground: mixHexColors(inputs.surface, inputs.background, dark ? 0.42 : 0.22),
    hover: mixHexColors(surface2, textPrimary, dark ? 0.07 : 0.05),
    selected: hexToRgba(inputs.accent, dark ? 0.18 : 0.12),
    secondaryAccent: inputs.secondaryAccent,
    disabledText: tonedForeground(textPrimary, [surface2], 3, dark ? 0.55 : 0.46),
    disabledBackground: surface2,
    disabledBorder: border,
    actionSuccessText: accessibleForeground(successBase, [successSoft], 4.5),
    actionSuccessBackground: successSoft,
    actionSuccessBorder: mixHexColors(dark ? "#34D399" : "#047857", inputs.surface, 0.42),
    actionAccentText: accessibleForeground(accentStrong, [actionAccentBackground], 4.5),
    actionAccentBackground,
    actionAccentBorder: mixHexColors(inputs.accent, textPrimary, dark ? 0.22 : 0.16),
    selectedText: bestForegroundFor([selectedBackground]),
    selectedBackground,
    selectedBorder: accentStrong,
    heroBackground: `linear-gradient(135deg, ${mixHexColors(inputs.surface, inputs.accent, 0.10)} 0%, ${inputs.background} 100%)`,
    panelBackground: inputs.surface,
    cardBackground: surface2,
    cardHover: mixHexColors(surface2, textPrimary, dark ? 0.08 : 0.05),
    sectionDivider: border,
    subtleHighlight: hexToRgba(textPrimary, 0.06),
  };

  return corrections ? { ...base, ...normalizeThemeCorrections(corrections) } : base;
}

function roundedRatio(foreground: string, background: string): number {
  return Math.round(contrastRatio(foreground, background) * 100) / 100;
}

export function evaluateThemeContrast(tokens: AppThemeTokens): ThemeContrastReport {
  const warnings: ThemeContrastReport["warnings"] = [];
  const corrections: NonNullable<ThemeContrastReport["corrections"]> = {};
  const mainSurfaces = [tokens.background, tokens.surface1, tokens.cardBackground, tokens.panelBackground];
  const primaryBackground = roundedRatio(tokens.textPrimary, tokens.background);
  const primarySurface = Math.min(...mainSurfaces.map((surface) => roundedRatio(tokens.textPrimary, surface)));
  const secondarySurface = Math.min(...mainSurfaces.map((surface) => roundedRatio(tokens.textSecondary, surface)));
  const mutedSurface = Math.min(...mainSurfaces.map((surface) => roundedRatio(tokens.textMuted, surface)));
  const focusSurface = Math.min(...[tokens.background, tokens.surface1, tokens.surface2].map((surface) => roundedRatio(tokens.focus, surface)));
  const borderSurface = roundedRatio(tokens.borderStrong, tokens.surface1);
  const accentText = roundedRatio(tokens.accentContrast, tokens.accent);
  const selectedText = roundedRatio(tokens.selectedText, tokens.selectedBackground);
  const disabledText = roundedRatio(tokens.disabledText, tokens.disabledBackground);
  const actionAccentText = roundedRatio(tokens.actionAccentText, opaqueColorOn(tokens.actionAccentBackground, tokens.surface1));
  const actionSuccessText = roundedRatio(tokens.actionSuccessText, opaqueColorOn(tokens.actionSuccessBackground, tokens.surface1));
  const statusPairs = [
    ["danger", tokens.danger, tokens.dangerSoft],
    ["success", tokens.success, tokens.successSoft],
    ["warning", tokens.warning, tokens.warningSoft],
  ] as const;

  function warn(key: string, message: string, ratio: number, threshold: number, severity: "critical" | "warning" = "critical") {
    warnings.push({ key, message, ratio, threshold, severity });
  }

  if (primaryBackground < 4.5 || primarySurface < 4.5) {
    const corrected = bestContrastingText(
      primaryBackground < primarySurface ? tokens.background : tokens.surface1,
    );
    corrections.textPrimary = corrected;
    corrections.textSecondary = mixHexColors(corrected, tokens.background, 0.14);
    corrections.textMuted = mixHexColors(corrected, tokens.background, 0.34);
    warn("text-primary", "Ana metin seçilen yüzeylerde yeterince okunaklı değil.", Math.min(primaryBackground, primarySurface), 4.5);
  }
  if (secondarySurface < 4.5) {
    corrections.textSecondary ??= mixHexColors(bestContrastingText(tokens.surface1), tokens.surface1, 0.12);
    warn("text-secondary", "İkincil metin kontrastı önerilen 4.5 seviyesinin altında.", secondarySurface, 4.5);
  }
  if (mutedSurface < 3) {
    corrections.textMuted ??= mixHexColors(bestContrastingText(tokens.surface1), tokens.surface1, 0.28);
    warn("text-muted", "Sessiz metin yüzeyden yeterince ayrılmıyor.", mutedSurface, 3);
  }
  if (focusSurface < 3) {
    corrections.focus = bestContrastingText(tokens.surface1);
    warn("focus", "Odak halkası yüzey üzerinde yeterince belirgin değil.", focusSurface, 3);
  }
  if (borderSurface < 1.3) {
    const contrast = bestContrastingText(tokens.surface1);
    corrections.border = mixHexColors(tokens.surface1, contrast, 0.22);
    corrections.borderStrong = mixHexColors(tokens.surface1, contrast, 0.34);
    warn("border", "Panel sınırları yüzey katmanlarını yeterince ayırmıyor.", borderSurface, 1.3, "warning");
  }
  if (accentText < 4.5) {
    warn("accent-text", "Vurgu üzerindeki metin kontrastı 4.5 seviyesinin altında.", accentText, 4.5);
  }
  if (selectedText < 4.5) warn("selected-text", "Seçili durum metni yeterince okunaklı değil.", selectedText, 4.5);
  if (disabledText < 3) warn("disabled-text", "Devre dışı kontrol metni yüzeyden yeterince ayrılmıyor.", disabledText, 3, "warning");
  if (actionAccentText < 4.5) warn("action-accent", "Ana aksiyon metni yeterince okunaklı değil.", actionAccentText, 4.5);
  if (actionSuccessText < 4.5) warn("action-success", "Başarı aksiyonu metni yeterince okunaklı değil.", actionSuccessText, 4.5);
  for (const [key, foreground, soft] of statusPairs) {
    const ratio = roundedRatio(foreground, opaqueColorOn(soft, tokens.surface1));
    if (ratio < 4.5) warn(`status-${key}`, `${key} durum metni kendi yumuşak yüzeyinde yeterince okunaklı değil.`, ratio, 4.5);
  }

  const critical = warnings.some((warning) => warning.severity === "critical");
  return {
    valid: !critical,
    status: critical ? "critical" : warnings.length > 0 ? "warning" : "valid",
    warnings,
    corrections: Object.keys(corrections).length > 0 ? corrections : undefined,
  };
}
