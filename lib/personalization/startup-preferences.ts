import type { DashboardTabId } from "@/components/app-shell/app-navigation";

export const STARTUP_PREFERENCES_STORAGE_KEY = "mediaTracker:startupPreferences:v1";
export const STARTUP_PREFERENCES_VERSION = 1 as const;

export const DEFAULT_DASHBOARD_TABS = [
  "dashboard",
  "library",
  "discover",
  "calendar",
  "settings",
] as const satisfies readonly DashboardTabId[];

export type DefaultDashboardTab = (typeof DEFAULT_DASHBOARD_TABS)[number];

export interface StartupPreferences {
  version: typeof STARTUP_PREFERENCES_VERSION;
  defaultDashboardTab: DefaultDashboardTab;
}

export interface StartupPreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const DEFAULT_STARTUP_PREFERENCES: StartupPreferences = {
  version: STARTUP_PREFERENCES_VERSION,
  defaultDashboardTab: "dashboard",
};

export function isDefaultDashboardTab(value: unknown): value is DefaultDashboardTab {
  return typeof value === "string" &&
    DEFAULT_DASHBOARD_TABS.includes(value as DefaultDashboardTab);
}

export function normalizeStartupPreferences(value: unknown): StartupPreferences {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (value as { version?: unknown }).version !== STARTUP_PREFERENCES_VERSION
  ) {
    return { ...DEFAULT_STARTUP_PREFERENCES };
  }
  const defaultDashboardTab = (value as { defaultDashboardTab?: unknown }).defaultDashboardTab;
  return {
    version: STARTUP_PREFERENCES_VERSION,
    defaultDashboardTab: isDefaultDashboardTab(defaultDashboardTab)
      ? defaultDashboardTab
      : DEFAULT_STARTUP_PREFERENCES.defaultDashboardTab,
  };
}

export function readStartupPreferences(
  storage: StartupPreferencesStorage,
): StartupPreferences {
  try {
    const raw = storage.getItem(STARTUP_PREFERENCES_STORAGE_KEY);
    return raw
      ? normalizeStartupPreferences(JSON.parse(raw))
      : { ...DEFAULT_STARTUP_PREFERENCES };
  } catch {
    return { ...DEFAULT_STARTUP_PREFERENCES };
  }
}

export function writeStartupPreferences(
  storage: StartupPreferencesStorage,
  value: unknown,
): StartupPreferences {
  const normalized = normalizeStartupPreferences(value);
  try {
    storage.setItem(STARTUP_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Storage kapalıysa geçerli runtime seçimi korunur.
  }
  return normalized;
}

export function resetStartupPreferences(
  storage: StartupPreferencesStorage,
): StartupPreferences {
  try {
    storage.removeItem(STARTUP_PREFERENCES_STORAGE_KEY);
  } catch {
    // Reset çağrısı storage erişiminden bağımsız olarak default döndürür.
  }
  return { ...DEFAULT_STARTUP_PREFERENCES };
}
