import type {
  ChartPaletteDefinition,
  ChartPaletteId,
  ChartStatusKey,
  ChartStatusPresentation,
  WorldThemeKey,
} from "./types";
import { WORLD_THEME_REGISTRY } from "./world-theme-registry";

const STATUS_COPY: Record<ChartStatusKey, Pick<ChartStatusPresentation, "label" | "description">> = {
  completed: { label: "Tamamlanan", description: "Bitirdiğin medyalar." },
  inProgress: { label: "Devam Eden", description: "Şu anda izlediğin/okuduğun." },
  planning: { label: "Planlanan", description: "İleride başlamayı düşündüğün." },
  paused: { label: "Duraklatılan", description: "Şimdilik ara verdiğin." },
  dropped: { label: "Bırakılan", description: "Vazgeçtiğin kayıtlar." },
};

function status(
  key: ChartStatusKey,
  segmentColor: string,
  dotTone: string,
  rowActiveSurface: string,
  textTone: string,
): ChartStatusPresentation {
  return { ...STATUS_COPY[key], segmentColor, dotTone, rowActiveSurface, textTone };
}

export const STANDARD_CHART_STATUS_PRESENTATION: Record<ChartStatusKey, ChartStatusPresentation> = {
  completed: status(
    "completed",
    "var(--w-primary)",
    "bg-[var(--w-primary)]",
    "bg-[color-mix(in_srgb,var(--w-primary)_14%,transparent)]",
    "text-[var(--w-primary-strong)]",
  ),
  inProgress: status("inProgress", "#a78bfa", "bg-violet-400", "bg-violet-500/12", "text-violet-300"),
  planning: status("planning", "#7dd3fc", "bg-sky-400", "bg-sky-500/12", "text-sky-300"),
  paused: status("paused", "#fb923c", "bg-orange-400", "bg-orange-500/12", "text-orange-300"),
  dropped: status("dropped", "#f87171", "bg-red-400", "bg-red-500/12", "text-red-300"),
};

function fixedStatuses(colors: Record<ChartStatusKey, string>): Record<ChartStatusKey, ChartStatusPresentation> {
  return {
    completed: status("completed", colors.completed, colors.completed, `color-mix(in srgb, ${colors.completed} 14%, transparent)`, colors.completed),
    inProgress: status("inProgress", colors.inProgress, colors.inProgress, `color-mix(in srgb, ${colors.inProgress} 14%, transparent)`, colors.inProgress),
    planning: status("planning", colors.planning, colors.planning, `color-mix(in srgb, ${colors.planning} 14%, transparent)`, colors.planning),
    paused: status("paused", colors.paused, colors.paused, `color-mix(in srgb, ${colors.paused} 14%, transparent)`, colors.paused),
    dropped: status("dropped", colors.dropped, colors.dropped, `color-mix(in srgb, ${colors.dropped} 14%, transparent)`, colors.dropped),
  };
}

export const CHART_PALETTE_REGISTRY: Readonly<Record<ChartPaletteId, ChartPaletteDefinition>> = {
  standard: {
    id: "standard",
    label: "Standart",
    followWorldCompletedColor: true,
    statuses: STANDARD_CHART_STATUS_PRESENTATION,
  },
  ocean: {
    id: "ocean",
    label: "Okyanus",
    followWorldCompletedColor: false,
    statuses: fixedStatuses({ completed: "#22d3ee", inProgress: "#38bdf8", planning: "#60a5fa", paused: "#fbbf24", dropped: "#fb7185" }),
  },
  pastel: {
    id: "pastel",
    label: "Pastel",
    followWorldCompletedColor: false,
    statuses: fixedStatuses({ completed: "#86efac", inProgress: "#c4b5fd", planning: "#bae6fd", paused: "#fed7aa", dropped: "#fecaca" }),
  },
  high_contrast: {
    id: "high_contrast",
    label: "Yüksek Kontrast",
    followWorldCompletedColor: false,
    statuses: fixedStatuses({ completed: "#22c55e", inProgress: "#a855f7", planning: "#0ea5e9", paused: "#f97316", dropped: "#ef4444" }),
  },
  monochrome: {
    id: "monochrome",
    label: "Monokrom",
    followWorldCompletedColor: false,
    statuses: fixedStatuses({ completed: "#fafafa", inProgress: "#d4d4d8", planning: "#a1a1aa", paused: "#71717a", dropped: "#52525b" }),
  },
  world_aware: {
    id: "world_aware",
    label: "Dünya Uyumlu",
    followWorldCompletedColor: true,
    statuses: {
      ...fixedStatuses({ completed: "var(--w-primary)", inProgress: "#a78bfa", planning: "#7dd3fc", paused: "#fb923c", dropped: "#f87171" }),
      completed: STANDARD_CHART_STATUS_PRESENTATION.completed,
    },
  },
};

export function resolveChartStatusPresentation(
  paletteId: unknown,
  statusKey: ChartStatusKey,
  worldKey?: WorldThemeKey,
): ChartStatusPresentation {
  const palette = typeof paletteId === "string" && paletteId in CHART_PALETTE_REGISTRY
    ? CHART_PALETTE_REGISTRY[paletteId as ChartPaletteId]
    : CHART_PALETTE_REGISTRY.standard;
  const presentation = palette.statuses[statusKey];
  if (statusKey !== "completed" || !palette.followWorldCompletedColor) return presentation;
  const world = WORLD_THEME_REGISTRY[worldKey ?? "neutral"];
  return { ...presentation, segmentColor: world.chartPrimary };
}
