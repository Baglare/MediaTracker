"use client";

import { LayoutDashboard } from "lucide-react";
import EnhancedDashboard from "@/components/enhanced-dashboard";
import PageHeader from "@/components/page-header";
import type { DashboardStats } from "@/lib/dashboard-stats";
import type { MediaItem, ProgressLog } from "@/lib/types";

export const DASHBOARD_WIDGET_IDS = {
  summary: "summary",
  journey: "journey",
  continue: "continue",
  recentActivity: "recent-activity",
  worlds: "worlds",
} as const;

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
}

export default function DashboardFeature(props: DashboardFeatureProps) {
  return (
    <div>
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        subtitle="Genel istatistikler ve son aktiviteler"
      />
      <EnhancedDashboard {...props} />
    </div>
  );
}
