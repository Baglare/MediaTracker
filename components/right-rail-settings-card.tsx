"use client";

import { ArrowDown, ArrowUp, GripVertical, RotateCcw, Sidebar } from "lucide-react";
import {
  resetRightRailPreferences,
  RIGHT_RAIL_WIDGET_REGISTRY,
  type RightRailPreferences,
  type RightRailWidgetId,
} from "@/lib/right-rail-preferences";

interface RightRailSettingsCardProps {
  preferences: RightRailPreferences;
  onChange: (preferences: RightRailPreferences) => void;
}

function moveId(order: RightRailWidgetId[], id: RightRailWidgetId, direction: -1 | 1) {
  const index = order.indexOf(id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return order;

  const next = [...order];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return next;
}

export default function RightRailSettingsCard({
  preferences,
  onChange,
}: RightRailSettingsCardProps) {
  const orderedWidgets = preferences.order
    .map((id) => RIGHT_RAIL_WIDGET_REGISTRY.find((widget) => widget.id === id))
    .filter((widget): widget is (typeof RIGHT_RAIL_WIDGET_REGISTRY)[number] => Boolean(widget));

  const setEnabled = (id: RightRailWidgetId, enabled: boolean) => {
    onChange({
      ...preferences,
      enabled: {
        ...preferences.enabled,
        [id]: enabled,
      },
    });
  };

  const setOrder = (order: RightRailWidgetId[]) => {
    onChange({ ...preferences, order });
  };

  const handleDrop = (targetId: RightRailWidgetId, draggedId: string) => {
    if (!preferences.order.includes(draggedId as RightRailWidgetId)) return;
    const sourceId = draggedId as RightRailWidgetId;
    if (sourceId === targetId) return;

    const withoutSource = preferences.order.filter((id) => id !== sourceId);
    const targetIndex = withoutSource.indexOf(targetId);
    const next = [...withoutSource];
    next.splice(targetIndex, 0, sourceId);
    setOrder(next);
  };

  const enabledCount = orderedWidgets.filter((widget) => preferences.enabled[widget.id]).length;

  return (
    <section className="bg-zinc-900/30 rounded-2xl border border-zinc-800/60 p-4 sm:p-5 min-w-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sidebar className="h-4 w-4 text-amber-300/90" aria-hidden="true" />
            <h3 className="text-base font-semibold text-zinc-100 tracking-tight">
              Sağ Panel
            </h3>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Widget görünürlüğünü ve sırasını bu tarayıcı için düzenle.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange(resetRightRailPreferences())}
          className="inline-flex h-9 w-fit items-center justify-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/35 px-3 text-xs font-medium text-zinc-400 transition-colors hover:border-amber-500/35 hover:bg-amber-500/10 hover:text-amber-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Varsayılana sıfırla
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-zinc-800/60 bg-zinc-950/25 px-3 py-2">
        <span className="text-xs text-zinc-500">Görünen widget</span>
        <span className="font-mono text-xs tabular-nums text-zinc-300">
          {enabledCount}/{orderedWidgets.length}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {orderedWidgets.map((widget, index) => {
          const enabled = preferences.enabled[widget.id];
          return (
            <div
              key={widget.id}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", widget.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                handleDrop(widget.id, event.dataTransfer.getData("text/plain"));
              }}
              className="rounded-xl border border-zinc-800/60 bg-zinc-950/25 p-3"
            >
              <div className="flex items-start gap-3">
                <div
                  className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-800/70 bg-zinc-900/55 text-zinc-500"
                  title="Sürükle"
                  aria-hidden="true"
                >
                  <GripVertical className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-100">{widget.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                        {widget.description}
                      </p>
                      {widget.dataRequirement && (
                        <p className="mt-1 text-[11px] text-zinc-600">
                          Veri: {widget.dataRequirement}
                        </p>
                      )}
                    </div>

                    <label className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-zinc-800/70 bg-zinc-950/40 px-2.5 py-1 text-[11px] font-medium text-zinc-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(event) => setEnabled(widget.id, event.target.checked)}
                        className="h-3.5 w-3.5 accent-amber-400"
                      />
                      {enabled ? "Göster" : "Gizli"}
                    </label>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setOrder(moveId(preferences.order, widget.id, -1))}
                      disabled={index === 0}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800/80 px-2.5 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-40 disabled:hover:border-zinc-800/80 disabled:hover:text-zinc-400 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                      Yukarı
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrder(moveId(preferences.order, widget.id, 1))}
                      disabled={index === orderedWidgets.length - 1}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800/80 px-2.5 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-40 disabled:hover:border-zinc-800/80 disabled:hover:text-zinc-400 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                      Aşağı
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
