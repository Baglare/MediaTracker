"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  LayoutDashboard,
  PanelsTopLeft,
  RotateCcw,
  Sidebar,
} from "lucide-react";
import type {
  DashboardWidgetId,
  LayoutMove,
  LayoutPreferences,
  LayoutSurface,
  RightRailWidgetId,
  WidgetDefinition,
} from "@/lib/personalization/layout-types";
import {
  DASHBOARD_WIDGET_REGISTRY,
  RIGHT_RAIL_WIDGET_REGISTRY,
} from "@/lib/personalization/widget-registry";

type WidgetId = DashboardWidgetId | RightRailWidgetId;

interface LayoutSettingsCardProps {
  preferences: LayoutPreferences;
  isHydrated: boolean;
  statusMessage: string;
  onVisibilityChange: (surface: LayoutSurface, id: WidgetId, visible: boolean) => void;
  onMove: (surface: LayoutSurface, id: WidgetId, move: LayoutMove, label: string) => void;
  onResetDashboard: () => void;
  onResetRightRail: () => void;
  onResetAll: () => void;
}

interface WidgetOrderEditorProps<TId extends WidgetId> {
  title: string;
  description: string;
  surface: LayoutSurface;
  icon: typeof LayoutDashboard;
  preferences: LayoutPreferences["dashboard"] | LayoutPreferences["rightRail"];
  registry: readonly WidgetDefinition<TId>[];
  isHydrated: boolean;
  mobileNote?: string;
  onVisibilityChange: LayoutSettingsCardProps["onVisibilityChange"];
  onMove: LayoutSettingsCardProps["onMove"];
  onReset: () => void;
}

function WidgetOrderEditor<TId extends WidgetId>({
  title,
  description,
  surface,
  icon: Icon,
  preferences,
  registry,
  isHydrated,
  mobileNote,
  onVisibilityChange,
  onMove,
  onReset,
}: WidgetOrderEditorProps<TId>) {
  const definitions = new Map(registry.map((widget) => [widget.id, widget]));
  const ordered = preferences
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((preference) => {
      const definition = definitions.get(preference.id as TId);
      return definition ? { preference, definition } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  const visibleCount = ordered.filter(({ preference }) => preference.visible).length;

  return (
    <section className="app-card rounded-2xl border p-4 sm:p-5" aria-labelledby={`${surface}-layout-title`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-[var(--app-accent-strong)]" aria-hidden="true" />
            <h3 id={`${surface}-layout-title`} className="font-semibold text-[var(--app-text-primary)]">
              {title}
            </h3>
          </div>
          <p className="mt-1 text-sm text-[var(--app-text-muted)]">{description}</p>
          {mobileNote && (
            <p className="mt-1 text-xs text-[var(--app-text-muted)]">{mobileNote}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onReset}
          disabled={!isHydrated}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-1)] px-3 text-xs font-medium text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Varsayılana dön
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] px-3 py-2">
        <span className="text-xs text-[var(--app-text-muted)]">Görünen panel</span>
        <span className="font-mono text-xs tabular-nums text-[var(--app-text-secondary)]">
          {visibleCount}/{ordered.length}
        </span>
      </div>

      <ol className="mt-3 space-y-2">
        {ordered.map(({ preference, definition }, index) => (
          <li key={definition.id} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-[var(--app-text-primary)]">
                    {definition.label}
                  </p>
                  {definition.required && (
                    <span className="rounded-full border border-[var(--app-border-strong)] px-2 py-0.5 text-[10px] font-semibold text-[var(--app-text-muted)]">
                      Zorunlu
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--app-text-muted)]">
                  {definition.description}
                </p>
                {definition.dataRequirement && (
                  <p className="mt-1 text-[11px] text-[var(--app-text-muted)]">
                    Veri: {definition.dataRequirement}
                  </p>
                )}
              </div>

              <label className="inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-input-bg)] px-3 text-xs font-medium text-[var(--app-text-secondary)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--app-focus)]">
                <input
                  type="checkbox"
                  checked={preference.visible}
                  disabled={!isHydrated || definition.required === true}
                  onChange={(event) => onVisibilityChange(surface, definition.id, event.target.checked)}
                  className="h-4 w-4 accent-[var(--app-accent)] disabled:cursor-not-allowed"
                  aria-describedby={definition.required ? `${surface}-${definition.id}-required` : undefined}
                />
                {preference.visible ? "Gösteriliyor" : "Gizli"}
              </label>
            </div>

            {definition.required && (
              <p id={`${surface}-${definition.id}-required`} className="sr-only">
                Bu panel Dashboard temel özetini korumak için gizlenemez.
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2" aria-label={`${definition.label} sıra kontrolleri`}>
              {([
                ["top", ChevronsUp, "En üste"],
                ["up", ArrowUp, "Yukarı"],
                ["down", ArrowDown, "Aşağı"],
                ["bottom", ChevronsDown, "En alta"],
              ] as const).map(([move, MoveIcon, label]) => {
                const disabled =
                  !isHydrated ||
                  ((move === "top" || move === "up") && index === 0) ||
                  ((move === "bottom" || move === "down") && index === ordered.length - 1);
                return (
                  <button
                    key={move}
                    type="button"
                    disabled={disabled}
                    onClick={() => onMove(surface, definition.id, move, definition.label)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--app-border)] px-2.5 text-xs text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`${definition.label}: ${label}`}
                  >
                    <MoveIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {label}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function LayoutSettingsCard({
  preferences,
  isHydrated,
  statusMessage,
  onVisibilityChange,
  onMove,
  onResetDashboard,
  onResetRightRail,
  onResetAll,
}: LayoutSettingsCardProps) {
  return (
    <section id="layout" className="app-panel scroll-mt-24 rounded-2xl border p-4 sm:p-6 lg:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <PanelsTopLeft className="h-5 w-5 text-[var(--app-accent-strong)]" aria-hidden="true" />
            <h2 className="text-base font-semibold text-[var(--app-text-primary)]">
              Düzen ve Paneller
            </h2>
          </div>
          <p className="mt-1 text-sm text-[var(--app-text-muted)]">
            Dashboard ve sağ panel sırasını bu cihaz için düzenle. Değişiklikler otomatik kaydedilir.
          </p>
        </div>
        <button
          type="button"
          onClick={onResetAll}
          disabled={!isHydrated}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-1)] px-3 text-xs font-medium text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Tüm düzeni sıfırla
        </button>
      </div>

      <p
        className="mt-2 min-h-4 text-xs text-[var(--app-text-muted)]"
        aria-live="polite"
        aria-atomic="true"
      >
        {statusMessage || (isHydrated ? "Değişiklikler bu cihazda otomatik kaydedilir." : "Düzen tercihleri yükleniyor...")}
      </p>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <WidgetOrderEditor
          title="Dashboard"
          description="Ana sayfadaki özet ve içerik bölümlerini yönet."
          surface="dashboard"
          icon={LayoutDashboard}
          preferences={preferences.dashboard}
          registry={DASHBOARD_WIDGET_REGISTRY}
          isHydrated={isHydrated}
          onVisibilityChange={onVisibilityChange}
          onMove={onMove}
          onReset={onResetDashboard}
        />
        <WidgetOrderEditor
          title="Sağ Panel"
          description="Desktop görünümündeki yardımcı panelleri yönet."
          mobileNote="Sağ panel küçük ekranlarda gösterilmez; tercihin desktop için saklanır."
          surface="rightRail"
          icon={Sidebar}
          preferences={preferences.rightRail}
          registry={RIGHT_RAIL_WIDGET_REGISTRY}
          isHydrated={isHydrated}
          onVisibilityChange={onVisibilityChange}
          onMove={onMove}
          onReset={onResetRightRail}
        />
      </div>
    </section>
  );
}
