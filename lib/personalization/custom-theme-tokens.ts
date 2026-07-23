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

export function normalizeCustomThemeInputs(value: unknown): CustomThemeInputs | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const input = value as Partial<Record<keyof CustomThemeInputs, unknown>>;
  if (input.colorScheme !== "light" && input.colorScheme !== "dark") return null;
  const background = normalizeHexColor(input.background);
  const surface = normalizeHexColor(input.surface);
  const accent = normalizeHexColor(input.accent);
  const secondaryAccent = normalizeHexColor(input.secondaryAccent);
  if (!background || !surface || !accent || !secondaryAccent) return null;
  return {
    colorScheme: input.colorScheme,
    background,
    surface,
    accent,
    secondaryAccent,
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
  const textPrimary = dark ? "#F8FAFC" : "#1C1917";
  const surface2 = mixHexColors(inputs.surface, textPrimary, dark ? 0.08 : 0.07);
  const surface3 = mixHexColors(inputs.surface, textPrimary, dark ? 0.15 : 0.13);
  const border = mixHexColors(inputs.surface, textPrimary, dark ? 0.20 : 0.16);
  const borderStrong = mixHexColors(inputs.surface, textPrimary, dark ? 0.34 : 0.28);
  const accentStrong = mixHexColors(inputs.accent, dark ? "#FFFFFF" : "#000000", 0.18);
  const selectedBackground = mixHexColors(inputs.surface, inputs.accent, dark ? 0.22 : 0.14);
  const base: AppThemeTokens = {
    background: inputs.background,
    surface1: inputs.surface,
    surface2,
    surface3,
    elevated: mixHexColors(inputs.surface, dark ? "#FFFFFF" : "#FFFFFF", dark ? 0.05 : 0.32),
    textPrimary,
    textSecondary: mixHexColors(textPrimary, inputs.background, dark ? 0.23 : 0.20),
    textMuted: mixHexColors(textPrimary, inputs.background, dark ? 0.48 : 0.43),
    border,
    borderStrong,
    scrollbarThumbHover: mixHexColors(inputs.surface, textPrimary, 0.42),
    shadow: hexToRgba(dark ? "#000000" : "#1C1917", dark ? 0.38 : 0.15),
    overlay: hexToRgba(dark ? "#020617" : "#1C1917", dark ? 0.76 : 0.48),
    focus: accentStrong,
    accent: inputs.accent,
    accentStrong,
    accentSoft: hexToRgba(inputs.accent, dark ? 0.20 : 0.14),
    accentContrast: bestContrastingText(inputs.accent),
    danger: dark ? "#FB7185" : "#BE123C",
    dangerSoft: hexToRgba(dark ? "#FB7185" : "#BE123C", 0.12),
    success: dark ? "#34D399" : "#047857",
    successSoft: hexToRgba(dark ? "#34D399" : "#047857", 0.12),
    warning: dark ? "#FBBF24" : "#B45309",
    warningSoft: hexToRgba(dark ? "#FBBF24" : "#B45309", 0.12),
    inputBackground: mixHexColors(inputs.surface, inputs.background, dark ? 0.42 : 0.22),
    hover: mixHexColors(surface2, textPrimary, dark ? 0.07 : 0.05),
    selected: hexToRgba(inputs.accent, dark ? 0.18 : 0.12),
    secondaryAccent: inputs.secondaryAccent,
    disabledText: mixHexColors(textPrimary, inputs.background, dark ? 0.55 : 0.46),
    disabledBackground: surface2,
    disabledBorder: border,
    actionSuccessText: dark ? "#6EE7B7" : "#065F46",
    actionSuccessBackground: hexToRgba(dark ? "#34D399" : "#047857", 0.12),
    actionSuccessBorder: mixHexColors(dark ? "#34D399" : "#047857", inputs.surface, 0.42),
    actionAccentText: mixHexColors(accentStrong, textPrimary, dark ? 0.25 : 0.16),
    actionAccentBackground: hexToRgba(inputs.accent, dark ? 0.16 : 0.11),
    actionAccentBorder: mixHexColors(inputs.accent, textPrimary, dark ? 0.22 : 0.16),
    selectedText: bestContrastingText(selectedBackground),
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
  const primaryBackground = roundedRatio(tokens.textPrimary, tokens.background);
  const primarySurface = roundedRatio(tokens.textPrimary, tokens.surface1);
  const secondarySurface = roundedRatio(tokens.textSecondary, tokens.surface1);
  const mutedSurface = roundedRatio(tokens.textMuted, tokens.surface1);
  const focusSurface = roundedRatio(tokens.focus, tokens.surface1);
  const borderSurface = roundedRatio(tokens.borderStrong, tokens.surface1);

  if (primaryBackground < 4.5 || primarySurface < 4.5) {
    const corrected = bestContrastingText(
      primaryBackground < primarySurface ? tokens.background : tokens.surface1,
    );
    corrections.textPrimary = corrected;
    corrections.textSecondary = mixHexColors(corrected, tokens.background, 0.14);
    corrections.textMuted = mixHexColors(corrected, tokens.background, 0.34);
    warnings.push({
      key: "text-primary",
      message: "Ana metin seçilen yüzeylerde yeterince okunaklı değil.",
      ratio: Math.min(primaryBackground, primarySurface),
    });
  }
  if (secondarySurface < 4.5) {
    corrections.textSecondary ??= mixHexColors(bestContrastingText(tokens.surface1), tokens.surface1, 0.12);
    warnings.push({
      key: "text-secondary",
      message: "İkincil metin kontrastı önerilen 4.5 seviyesinin altında.",
      ratio: secondarySurface,
    });
  }
  if (mutedSurface < 3) {
    corrections.textMuted ??= mixHexColors(bestContrastingText(tokens.surface1), tokens.surface1, 0.28);
    warnings.push({
      key: "text-muted",
      message: "Sessiz metin yüzeyden yeterince ayrılmıyor.",
      ratio: mutedSurface,
    });
  }
  if (focusSurface < 3) {
    corrections.focus = bestContrastingText(tokens.surface1);
    warnings.push({
      key: "focus",
      message: "Odak halkası yüzey üzerinde yeterince belirgin değil.",
      ratio: focusSurface,
    });
  }
  if (borderSurface < 1.3) {
    const contrast = bestContrastingText(tokens.surface1);
    corrections.border = mixHexColors(tokens.surface1, contrast, 0.22);
    corrections.borderStrong = mixHexColors(tokens.surface1, contrast, 0.34);
    warnings.push({
      key: "border",
      message: "Panel sınırları yüzey katmanlarını yeterince ayırmıyor.",
      ratio: borderSurface,
    });
  }

  const critical = warnings.some((warning) => (
    warning.key === "text-primary" || warning.key === "text-secondary"
  ));
  return {
    valid: !critical,
    warnings,
    corrections: Object.keys(corrections).length > 0 ? corrections : undefined,
  };
}
