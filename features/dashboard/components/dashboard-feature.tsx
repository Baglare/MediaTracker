"use client";

import Link from "next/link";
import { LayoutDashboard, SlidersHorizontal } from "lucide-react";
import EnhancedDashboard from "@/components/enhanced-dashboard";
import PageHeader from "@/components/page-header";
import type { DashboardStats } from "@/lib/dashboard-stats";
import type {
  DashboardWidgetId,
  LayoutWidgetPreference,
} from "@/lib/personalization/layout-types";
import type { ChartPaletteId, WorldThemeKey } from "@/lib/personalization/types";
import type { MediaItem, ProgressLog } from "@/lib/types";

interface DashboardFeatureProps {
  stats: DashboardStats;
  mediaList: MediaItem[];
  progressLogs: ProgressLog[];
  onSelectMedia: (item: MediaItem) => void;
  onIncrement: (id: string) => void;
  onComplete: (id: string) => void;
  onEdit: (item: MediaItem) => void;
  onToggleFavorite: (id: string) => void;
  onDeleteMedia: (id: string) => void;
  onUpdateRating: (id: string, rating: number | null) => void;
  widgetPreferences: Array<LayoutWidgetPreference<DashboardWidgetId>>;
  isLayoutHydrated: boolean;
  chartPaletteId: ChartPaletteId;
  followWorldCompletedColor: boolean;
  chartWorld: WorldThemeKey;
}

export default function DashboardFeature({
  isLayoutHydrated,
  ...props
}: DashboardFeatureProps) {
  return (
    <div>
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        subtitle="Genel istatistikler ve son aktiviteler"
        actions={
          <Link
            href="/?tab=settings#layout"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-1)] px-3 text-xs font-medium text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)] hover:text-[var(--app-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Düzeni özelleştir</span>
            <span className="sm:hidden">Düzen</span>
          </Link>
        }
      />
      {isLayoutHydrated ? (
        <EnhancedDashboard {...props} />
      ) : (
        <div
          className="app-panel grid min-h-40 place-items-center rounded-2xl border"
          aria-busy="true"
        >
          <p className="text-sm text-[var(--app-text-muted)]">Dashboard düzeni yükleniyor...</p>
        </div>
      )}
    </div>
  );
}
