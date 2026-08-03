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
  completed: status("completed", "#34d399", "#34d399", "color-mix(in srgb, #34d399 14%, transparent)", "color-mix(in srgb, #34d399 68%, var(--app-text-primary))"),
  inProgress: status("inProgress", "#a78bfa", "#a78bfa", "color-mix(in srgb, #a78bfa 14%, transparent)", "color-mix(in srgb, #a78bfa 68%, var(--app-text-primary))"),
  planning: status("planning", "#7dd3fc", "#7dd3fc", "color-mix(in srgb, #7dd3fc 14%, transparent)", "color-mix(in srgb, #7dd3fc 68%, var(--app-text-primary))"),
  paused: status("paused", "#fb923c", "#fb923c", "color-mix(in srgb, #fb923c 14%, transparent)", "color-mix(in srgb, #fb923c 68%, var(--app-text-primary))"),
  dropped: status("dropped", "#f87171", "#f87171", "color-mix(in srgb, #f87171 14%, transparent)", "color-mix(in srgb, #f87171 68%, var(--app-text-primary))"),
};

function fixedStatuses(
  colors: Record<ChartStatusKey, string>,
  textColors: Partial<Record<ChartStatusKey, string>> = {},
): Record<ChartStatusKey, ChartStatusPresentation> {
  return {
    completed: status("completed", colors.completed, colors.completed, `color-mix(in srgb, ${colors.completed} 14%, transparent)`, textColors.completed ?? `color-mix(in srgb, ${colors.completed} 68%, var(--app-text-primary))`),
    inProgress: status("inProgress", colors.inProgress, colors.inProgress, `color-mix(in srgb, ${colors.inProgress} 14%, transparent)`, textColors.inProgress ?? `color-mix(in srgb, ${colors.inProgress} 68%, var(--app-text-primary))`),
    planning: status("planning", colors.planning, colors.planning, `color-mix(in srgb, ${colors.planning} 14%, transparent)`, textColors.planning ?? `color-mix(in srgb, ${colors.planning} 68%, var(--app-text-primary))`),
    paused: status("paused", colors.paused, colors.paused, `color-mix(in srgb, ${colors.paused} 14%, transparent)`, textColors.paused ?? `color-mix(in srgb, ${colors.paused} 68%, var(--app-text-primary))`),
    dropped: status("dropped", colors.dropped, colors.dropped, `color-mix(in srgb, ${colors.dropped} 14%, transparent)`, textColors.dropped ?? `color-mix(in srgb, ${colors.dropped} 68%, var(--app-text-primary))`),
  };
}

export const CHART_PALETTE_REGISTRY: Readonly<Record<ChartPaletteId, ChartPaletteDefinition>> = {
  standard: {
    id: "standard",
    label: "Standart",
    description: "Mevcut durum renklerini dengeli ve tanıdık biçimde kullanır.",
    followWorldCompletedColor: true,
    statuses: STANDARD_CHART_STATUS_PRESENTATION,
  },
  ocean: {
    id: "ocean",
    label: "Okyanus",
    description: "Mavi ve turkuaz ağırlıklı, sakin bir grafik paleti.",
    followWorldCompletedColor: false,
    statuses: fixedStatuses({ completed: "#22d3ee", inProgress: "#38bdf8", planning: "#60a5fa", paused: "#fbbf24", dropped: "#fb7185" }),
  },
  pastel: {
    id: "pastel",
    label: "Pastel",
    description: "Yumuşak segment renkleri ve okunabilir koyu aktif metinler.",
    followWorldCompletedColor: false,
    statuses: fixedStatuses({ completed: "#86efac", inProgress: "#c4b5fd", planning: "#bae6fd", paused: "#fed7aa", dropped: "#fecaca" }),
  },
  high_contrast: {
    id: "high_contrast",
    label: "Yüksek Kontrast",
    description: "Segmentleri birbirinden daha güçlü ayıran doygun renkler.",
    followWorldCompletedColor: false,
    statuses: fixedStatuses({ completed: "#22c55e", inProgress: "#a855f7", planning: "#0ea5e9", paused: "#f97316", dropped: "#ef4444" }),
  },
  monochrome: {
    id: "monochrome",
    label: "Monokrom",
    description: "Charcoal, slate ve silver aralığında belirgin açık-koyu basamakları kullanır.",
    followWorldCompletedColor: false,
    statuses: fixedStatuses({
      completed: "color-mix(in srgb, var(--app-text-primary) 94%, var(--app-bg))",
      inProgress: "color-mix(in srgb, var(--app-text-primary) 76%, var(--app-bg))",
      planning: "color-mix(in srgb, var(--app-text-primary) 56%, var(--app-bg))",
      paused: "color-mix(in srgb, var(--app-text-primary) 36%, var(--app-bg))",
      dropped: "color-mix(in srgb, var(--app-text-primary) 18%, var(--app-bg))",
    }),
  },
  world_aware: {
    id: "world_aware",
    label: "Dünya Uyumlu",
    description: "Tamamlanan dilimi aktif dünyaya, diğerlerini standart palete bağlar.",
    followWorldCompletedColor: true,
    statuses: {
      ...STANDARD_CHART_STATUS_PRESENTATION,
    },
  },
};

export function resolveChartStatusPresentation(
  paletteId: unknown,
  statusKey: ChartStatusKey,
  worldKey?: WorldThemeKey,
  followWorldCompletedColor?: boolean,
): ChartStatusPresentation {
  const palette = typeof paletteId === "string" && paletteId in CHART_PALETTE_REGISTRY
    ? CHART_PALETTE_REGISTRY[paletteId as ChartPaletteId]
    : CHART_PALETTE_REGISTRY.standard;
  const presentation = palette.statuses[statusKey];
  const followsWorld = followWorldCompletedColor ?? palette.followWorldCompletedColor;
  if (statusKey !== "completed" || !followsWorld) return presentation;
  const world = WORLD_THEME_REGISTRY[worldKey ?? "neutral"] ?? WORLD_THEME_REGISTRY.neutral;
  return {
    ...presentation,
    segmentColor: world.chartPrimary,
    dotTone: world.chartPrimary,
    rowActiveSurface: `color-mix(in srgb, ${world.chartPrimary} 14%, transparent)`,
    textTone: world.primaryStrong,
  };
}

export function resolveChartPaletteStatuses(
  paletteId: unknown,
  worldKey: WorldThemeKey,
  followWorldCompletedColor: boolean,
): Record<ChartStatusKey, ChartStatusPresentation> {
  return {
    completed: resolveChartStatusPresentation(paletteId, "completed", worldKey, followWorldCompletedColor),
    inProgress: resolveChartStatusPresentation(paletteId, "inProgress", worldKey, followWorldCompletedColor),
    planning: resolveChartStatusPresentation(paletteId, "planning", worldKey, followWorldCompletedColor),
    paused: resolveChartStatusPresentation(paletteId, "paused", worldKey, followWorldCompletedColor),
    dropped: resolveChartStatusPresentation(paletteId, "dropped", worldKey, followWorldCompletedColor),
  };
}
