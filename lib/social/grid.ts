import { DEFAULT_PROFILE_MODULES, type ProfileModuleLayout, type ProfileModuleKey } from "@/lib/social/types";
import { validateModuleLayout } from "@/lib/social/validation";

export type GridPreset = "small" | "medium" | "wide" | "full";
const PRESET_WIDTHS: Record<GridPreset, number> = { small: 3, medium: 6, wide: 8, full: 12 };

export function defaultProfileModules(): ProfileModuleLayout[] {
  return DEFAULT_PROFILE_MODULES.map((module) => ({ ...module, config: { ...module.config } }));
}

export function applyGridPreset(module: ProfileModuleLayout, preset: GridPreset): ProfileModuleLayout {
  const gridWidth = PRESET_WIDTHS[preset];
  return { ...module, gridWidth, gridX: Math.min(module.gridX, 12 - gridWidth) };
}

export function normalizeResponsiveModules(modules: ProfileModuleLayout[]): ProfileModuleLayout[] {
  return [...modules]
    .filter((module) => validateModuleLayout(module).ok)
    .sort((a, b) => a.mobileOrder - b.mobileOrder || a.gridY - b.gridY || a.gridX - b.gridX)
    .map((module, index) => ({ ...module, mobileOrder: index }));
}

export function reflowModules(modules: ProfileModuleLayout[]): ProfileModuleLayout[] {
  let gridY = 0;
  return normalizeResponsiveModules(modules).map((module, index) => {
    const next = { ...module, gridX: 0, gridY, mobileOrder: index };
    gridY += module.gridHeight;
    return next;
  });
}

export function moveModule(modules: ProfileModuleLayout[], key: ProfileModuleKey, direction: -1 | 1): ProfileModuleLayout[] {
  const ordered = normalizeResponsiveModules(modules);
  const index = ordered.findIndex((module) => module.moduleKey === key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return ordered;
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return reflowModules(ordered.map((module, mobileOrder) => ({ ...module, mobileOrder })));
}

export function mergeModuleDefaults(modules: ProfileModuleLayout[]): ProfileModuleLayout[] {
  const byKey = new Map(modules.map((module) => [module.moduleKey, module]));
  return defaultProfileModules().map((fallback) => {
    const existing = byKey.get(fallback.moduleKey);
    return existing && validateModuleLayout(existing).ok ? existing : fallback;
  });
}
