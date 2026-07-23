import {
  DASHBOARD_WIDGET_REGISTRY,
  RIGHT_RAIL_WIDGET_REGISTRY,
} from "./widget-registry";
import {
  LAYOUT_PREFERENCES_VERSION,
  type DashboardWidgetId,
  type LayoutMove,
  type LayoutPreferences,
  type LayoutSurface,
  type LayoutWidgetPreference,
  type RightRailWidgetId,
  type WidgetDefinition,
} from "./layout-types";

export const LAYOUT_PREFERENCES_STORAGE_KEY = "mediaTracker:layoutPreferences:v1";
export const LEGACY_RIGHT_RAIL_STORAGE_KEY = "media-tracker-right-rail-preferences";

export interface LayoutPreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultWidgetPreferences<TId extends string>(
  registry: readonly WidgetDefinition<TId>[],
): Array<LayoutWidgetPreference<TId>> {
  return registry
    .slice()
    .sort((a, b) => a.defaultOrder - b.defaultOrder)
    .map((widget, order) => ({
      id: widget.id,
      visible: widget.defaultVisible || widget.required === true,
      order,
    }));
}

export function defaultLayoutPreferences(): LayoutPreferences {
  return {
    version: LAYOUT_PREFERENCES_VERSION,
    dashboard: defaultWidgetPreferences(DASHBOARD_WIDGET_REGISTRY),
    rightRail: defaultWidgetPreferences(RIGHT_RAIL_WIDGET_REGISTRY),
  };
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

export function normalizeWidgetPreferences<TId extends string>(
  value: unknown,
  registry: readonly WidgetDefinition<TId>[],
): Array<LayoutWidgetPreference<TId>> {
  const definitions = new Map(registry.map((widget) => [widget.id, widget]));
  const seen = new Set<TId>();
  const normalized: Array<LayoutWidgetPreference<TId> & { inputIndex: number }> = [];

  if (Array.isArray(value)) {
    value.forEach((candidate, inputIndex) => {
      const record = recordValue(candidate);
      if (!record) return;
      const id = record.id;
      if (typeof id !== "string" || !definitions.has(id as TId) || seen.has(id as TId)) return;
      const definition = definitions.get(id as TId);
      if (!definition) return;
      seen.add(definition.id);
      normalized.push({
        id: definition.id,
        visible: definition.required === true
          ? true
          : typeof record.visible === "boolean"
            ? record.visible
            : definition.defaultVisible,
        order: typeof record.order === "number" && Number.isFinite(record.order)
          ? record.order
          : definition.defaultOrder,
        inputIndex,
      });
    });
  }

  for (const definition of registry) {
    if (seen.has(definition.id)) continue;
    normalized.push({
      id: definition.id,
      visible: definition.defaultVisible || definition.required === true,
      order: definition.defaultOrder,
      inputIndex: normalized.length,
    });
  }

  return normalized
    .sort((a, b) => a.order - b.order || a.inputIndex - b.inputIndex)
    .map(({ id, visible }, order) => ({ id, visible, order }));
}

export function normalizeLayoutPreferences(value: unknown): LayoutPreferences {
  const record = recordValue(value);
  if (record?.version !== LAYOUT_PREFERENCES_VERSION) return defaultLayoutPreferences();

  return {
    version: LAYOUT_PREFERENCES_VERSION,
    dashboard: normalizeWidgetPreferences(record.dashboard, DASHBOARD_WIDGET_REGISTRY),
    rightRail: normalizeWidgetPreferences(record.rightRail, RIGHT_RAIL_WIDGET_REGISTRY),
  };
}

export function parseLayoutPreferences(raw: string | null): LayoutPreferences | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const record = recordValue(parsed);
    if (record?.version !== LAYOUT_PREFERENCES_VERSION) return null;
    return normalizeLayoutPreferences(parsed);
  } catch {
    return null;
  }
}

function migrateLegacyRightRail(raw: string | null): LayoutPreferences["rightRail"] | null {
  if (!raw) return null;
  try {
    const legacy = recordValue(JSON.parse(raw));
    const order = Array.isArray(legacy?.order) ? legacy.order : [];
    const enabled = recordValue(legacy?.enabled);
    const indexById = new Map<string, number>();
    order.forEach((id, index) => {
      if (typeof id === "string" && !indexById.has(id)) indexById.set(id, index);
    });
    const candidates = RIGHT_RAIL_WIDGET_REGISTRY.map((widget) => ({
      id: widget.id,
      visible: typeof enabled?.[widget.id] === "boolean"
        ? enabled[widget.id] as boolean
        : widget.defaultVisible,
      order: indexById.get(widget.id) ?? widget.defaultOrder + order.length,
    }));
    return normalizeWidgetPreferences(candidates, RIGHT_RAIL_WIDGET_REGISTRY);
  } catch {
    return null;
  }
}

export function loadLayoutPreferences(
  storage: LayoutPreferencesStorage | null = typeof window === "undefined" ? null : window.localStorage,
): LayoutPreferences {
  if (!storage) return defaultLayoutPreferences();
  try {
    const current = parseLayoutPreferences(storage.getItem(LAYOUT_PREFERENCES_STORAGE_KEY));
    if (current) return current;
    const defaults = defaultLayoutPreferences();
    const migratedRightRail = migrateLegacyRightRail(
      storage.getItem(LEGACY_RIGHT_RAIL_STORAGE_KEY),
    );
    return migratedRightRail
      ? { ...defaults, rightRail: migratedRightRail }
      : defaults;
  } catch {
    return defaultLayoutPreferences();
  }
}

export function saveLayoutPreferences(
  preferences: LayoutPreferences,
  storage: LayoutPreferencesStorage | null = typeof window === "undefined" ? null : window.localStorage,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      LAYOUT_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalizeLayoutPreferences(preferences)),
    );
  } catch {
    // Storage erişimi kısıtlıysa uygulama geçerli bellek içi tercihle devam eder.
  }
}

export function setLayoutWidgetVisibility(
  preferences: LayoutPreferences,
  surface: LayoutSurface,
  id: DashboardWidgetId | RightRailWidgetId,
  visible: boolean,
): LayoutPreferences {
  const registry = surface === "dashboard"
    ? DASHBOARD_WIDGET_REGISTRY
    : RIGHT_RAIL_WIDGET_REGISTRY;
  const definition = registry.find((widget) => widget.id === id);
  if (!definition || definition.required) return preferences;
  return {
    ...preferences,
    [surface]: preferences[surface].map((widget) =>
      widget.id === id ? { ...widget, visible } : widget
    ),
  };
}

export function moveLayoutWidget(
  preferences: LayoutPreferences,
  surface: LayoutSurface,
  id: DashboardWidgetId | RightRailWidgetId,
  move: LayoutMove,
): LayoutPreferences {
  const items = [...preferences[surface]].sort((a, b) => a.order - b.order);
  const index = items.findIndex((widget) => widget.id === id);
  if (index < 0) return preferences;
  const nextIndex =
    move === "top" ? 0
      : move === "bottom" ? items.length - 1
        : move === "up" ? index - 1
          : index + 1;
  if (nextIndex < 0 || nextIndex >= items.length || nextIndex === index) return preferences;
  const [item] = items.splice(index, 1);
  items.splice(nextIndex, 0, item);
  const normalized = items.map((widget, order) => ({ ...widget, order }));
  return { ...preferences, [surface]: normalized };
}

export function resetLayoutSurface(
  preferences: LayoutPreferences,
  surface: LayoutSurface,
): LayoutPreferences {
  const defaults = defaultLayoutPreferences();
  return { ...preferences, [surface]: defaults[surface] };
}

export function visibleWidgetIds<TId extends string>(
  preferences: readonly LayoutWidgetPreference<TId>[],
): TId[] {
  return preferences
    .filter((widget) => widget.visible)
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((widget) => widget.id);
}
