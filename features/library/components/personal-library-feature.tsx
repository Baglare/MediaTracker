"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  Heart,
  ListChecks,
  NotebookPen,
  Search,
  Star,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import MediaCard from "@/components/media-card";
import PageHeader from "@/components/page-header";
import {
  DistributionBar,
  PersonalControls,
  PersonalEmptyState,
  PersonalMetricCard,
} from "@/components/personal-tab-ui";
import type { DashboardTabId } from "@/components/app-shell/app-navigation";
import type { DashboardStats } from "@/lib/dashboard-stats";
import type { MediaItem, ProgressLog } from "@/lib/types";
import type { RelatedMediaAction } from "@/features/library/components/library-feature";
import type { MediaCommands } from "@/features/library/hooks/use-media-commands";
import {
  noteText,
  selectLibraryStatistics,
  selectPersonalCollection,
  type PersonalCollectionKind,
  type PersonalSort,
} from "@/features/library/domain/personal-selectors";

type PersonalTab = Extract<
  DashboardTabId,
  "progress" | "watchlist" | "favorites" | "ratings" | "notes" | "stats"
>;

interface PersonalLibraryFeatureProps {
  activeTab: PersonalTab;
  mediaList: MediaItem[];
  progressLogs: ProgressLog[];
  dashboardStats: DashboardStats;
  commands: MediaCommands;
  resolveRelatedAction: (item: MediaItem) => RelatedMediaAction;
  onAddRelatedParts: (item: MediaItem) => void;
}

const CONFIG: Record<
  Exclude<PersonalTab, "stats">,
  {
    icon: LucideIcon;
    title: string;
    subtitle: string;
    emptyTitle: string;
    emptyDescription: string;
    defaultSort: PersonalSort;
    sortOptions: { value: string; label: string }[];
  }
> = {
  progress: {
    icon: TrendingUp,
    title: "İlerlemem",
    subtitle: "Başladığın ve hâlâ açık olan medya ilerlemelerini tek yerde gör.",
    emptyTitle: "Devam eden ilerleme yok",
    emptyDescription: "Bir medyada ilerleme başlattığında burada görünecek.",
    defaultSort: "lastActivity",
    sortOptions: [
      { value: "lastActivity", label: "Son aktivite" },
      { value: "progress", label: "İlerleme yüzdesi" },
      { value: "title", label: "Başlık" },
      { value: "rating", label: "Puan" },
    ],
  },
  watchlist: {
    icon: ListChecks,
    title: "İzleme Listem",
    subtitle: "Kütüphanendeki planlanan medyaları tek yerde gör.",
    emptyTitle: "Planlanan medya yok",
    emptyDescription: "Planlandı durumuyla kaydettiğin içerikler burada görünür.",
    defaultSort: "recent",
    sortOptions: [
      { value: "recent", label: "Son eklenen" },
      { value: "title", label: "Başlık" },
      { value: "rating", label: "Puan" },
    ],
  },
  favorites: {
    icon: Heart,
    title: "Favorilerim",
    subtitle: "Kütüphanende öne çıkardığın medyaları tek yerde gör.",
    emptyTitle: "Henüz favori eklemedin",
    emptyDescription: "Kartların sağ üst köşesindeki kalp şeridiyle medyaları buraya sabitleyebilirsin.",
    defaultSort: "recent",
    sortOptions: [
      { value: "recent", label: "Son eklenen" },
      { value: "title", label: "Başlık" },
      { value: "rating", label: "Puan" },
    ],
  },
  ratings: {
    icon: Star,
    title: "Puanlamalarım",
    subtitle: "Kütüphanende puanladığın medyaları tek yerde gör.",
    emptyTitle: "Henüz puan verilmiş medya yok",
    emptyDescription: "Kartların kapak alanındaki yıldızla puanladığın kayıtlar burada görünür.",
    defaultSort: "ratingDesc",
    sortOptions: [
      { value: "ratingDesc", label: "Puan yüksekten düşüğe" },
      { value: "ratingAsc", label: "Puan düşükten yükseğe" },
      { value: "title", label: "Başlık" },
      { value: "recent", label: "Son eklenen" },
    ],
  },
  notes: {
    icon: NotebookPen,
    title: "Notlarım",
    subtitle: "Kütüphanende not eklediğin medyaları tek yerde gör.",
    emptyTitle: "Henüz not eklenmiş medya yok",
    emptyDescription: "Kişisel not alanını doldurduğun kayıtlar burada görünür.",
    defaultSort: "recent",
    sortOptions: [
      { value: "recent", label: "Son eklenen" },
      { value: "title", label: "Başlık" },
      { value: "rating", label: "Puan" },
    ],
  },
};

function Statistics({
  mediaList,
  progressLogs,
  dashboardStats,
}: Pick<PersonalLibraryFeatureProps, "mediaList" | "progressLogs" | "dashboardStats">) {
  const [snapshotAt] = useState(() => Date.now());
  const model = useMemo(
    () => selectLibraryStatistics(mediaList, progressLogs, dashboardStats, snapshotAt),
    [dashboardStats, mediaList, progressLogs, snapshotAt],
  );
  const maxWorld = Math.max(1, ...Object.values(model.worlds));
  const maxStatus = Math.max(1, ...Object.values(model.statuses));
  const maxRating = Math.max(1, ...model.ratingCounts.map((row) => row.count));
  return (
    <div>
      <PageHeader
        icon={BarChart3}
        title="İstatistikler"
        subtitle="Kütüphanendeki dağılımı, puanları ve aktiviteyi tek yerde gör."
      />
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <PersonalMetricCard label="Toplam medya" value={model.dashboard.totalItems} />
          <PersonalMetricCard label="Tamamlanan" value={model.dashboard.completedItems} />
          <PersonalMetricCard label="Devam eden" value={model.dashboard.inProgressItems} />
          <PersonalMetricCard label="Planlanan" value={model.dashboard.planningItems} />
          <PersonalMetricCard label="Ortalama puan" value={model.averageRating?.toFixed(1) ?? "—"} accent />
          <PersonalMetricCard label="Favoriler" value={model.dashboard.favoriteItems} />
        </div>
        {mediaList.length === 0 ? (
          <PersonalEmptyState
            icon={BarChart3}
            title="Henüz istatistik yok"
            description="Kütüphanene medya ekledikçe dağılımlar burada görünür."
          />
        ) : (
          <>
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
            <section className="app-panel rounded-2xl border p-4">
              <h2 className="mb-4 text-sm font-semibold text-[var(--app-text-primary)]">Dünya dağılımı</h2>
              <div className="space-y-3">
                <DistributionBar label="Doğu" count={model.worlds.east} max={maxWorld} tone="violet" />
                <DistributionBar label="Kadraj" count={model.worlds.screen} max={maxWorld} tone="sky" />
                <DistributionBar label="Arşiv" count={model.worlds.library} max={maxWorld} tone="amber" />
              </div>
            </section>
            <section className="app-panel rounded-2xl border p-4">
              <h2 className="mb-4 text-sm font-semibold text-[var(--app-text-primary)]">Durum dağılımı</h2>
              <div className="space-y-3">
                <DistributionBar label="Tamamlandı" count={model.statuses.completed} max={maxStatus} tone="emerald" />
                <DistributionBar label="Devam ediyor" count={model.statuses.active} max={maxStatus} tone="sky" />
                <DistributionBar label="Planlandı" count={model.statuses.planning} max={maxStatus} tone="amber" />
                <DistributionBar label="Duraklatıldı" count={model.statuses.paused} max={maxStatus} tone="violet" />
                <DistributionBar label="Bırakıldı" count={model.statuses.dropped} max={maxStatus} tone="rose" />
              </div>
            </section>
            <section className="app-panel rounded-2xl border p-4">
              <h2 className="text-sm font-semibold text-[var(--app-text-primary)]">Aktivite özeti</h2>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--app-text-muted)]">
                Son 7 gün
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--app-text-primary)]">
                {model.recentActivityCount}
              </p>
              <div className="mt-4 space-y-2">
                {model.recentLogs.map((log) => (
                  <div key={log.id} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-[12px] font-medium text-[var(--app-text-primary)]">
                        {log.mediaTitle}
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--app-text-muted)]">
                        {log.action === "complete" ? "Tamamlandı" : "İlerleme"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <section className="app-panel rounded-2xl border p-4">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-[var(--app-text-primary)]">Rating dağılımı</h2>
              <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                {model.ratedCount} puanlı içerik · ortalama {model.averageRating?.toFixed(1) ?? "—"}
              </p>
            </div>
            {model.ratedCount === 0 ? (
              <p className="text-sm text-[var(--app-text-muted)]">Henüz puanlanmış içerik yok.</p>
            ) : (
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)]">
                <div className="min-w-0 space-y-2">
                  {model.ratingCounts.map((row) => (
                    <DistributionBar
                      key={row.rating}
                      label={`${row.rating} puan`}
                      count={row.count}
                      max={maxRating}
                      tone={row.rating >= 8 ? "emerald" : row.rating >= 5 ? "amber" : "rose"}
                    />
                  ))}
                </div>
                <div className="min-w-0 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] p-3">
                  <h3 className="mb-3 text-[12px] font-semibold text-[var(--app-text-primary)]">
                    En yüksek puanlılar
                  </h3>
                  <div className="space-y-2">
                    {model.topRated.map((item) => (
                      <div key={item.id} className="flex min-w-0 items-center justify-between gap-3">
                        <span className="truncate text-[12px] text-[var(--app-text-secondary)]">
                          {item.title}
                        </span>
                        <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--app-accent)]">
                          {item.userRating}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
          </>
        )}
      </div>
    </div>
  );
}

export default function PersonalLibraryFeature(props: PersonalLibraryFeatureProps) {
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [sorts, setSorts] = useState<Record<string, PersonalSort>>({});
  const [renderedAt] = useState(() => Date.now());
  if (props.activeTab === "stats") return <Statistics {...props} />;

  const config = CONFIG[props.activeTab];
  const query = queries[props.activeTab] ?? "";
  const sort = sorts[props.activeTab] ?? config.defaultSort;
  const model = selectPersonalCollection({
    media: props.mediaList,
    logs: props.progressLogs,
    kind: props.activeTab as PersonalCollectionKind,
    query,
    sort,
  });
  const nearCompletion =
    props.activeTab === "progress"
      ? model.all.filter(
          (item) =>
            item.totalProgress > 0 &&
            item.currentProgress / item.totalProgress >= 0.75 &&
            item.currentProgress < item.totalProgress,
        )
      : [];
  const ratings =
    props.activeTab === "ratings"
      ? model.all.map((item) => item.userRating ?? 0)
      : [];
  const renderMediaCard = (item: MediaItem) => {
    const related = props.resolveRelatedAction(item);
    return (
      <div key={item.id} className="space-y-2">
        {props.activeTab === "notes" && (
          <div className="app-panel rounded-2xl border p-3">
            <p className="line-clamp-3 text-[12.5px] leading-relaxed text-[var(--app-text-secondary)]">
              {noteText(item)}
            </p>
          </div>
        )}
        <MediaCard
          item={item}
          onIncrement={props.commands.mutations.increment}
          onComplete={props.commands.mutations.complete}
          onEdit={props.commands.openEdit}
          onDelete={props.commands.requestDelete}
          onToggleFavorite={props.commands.mutations.toggleFavorite}
          onOpenDetail={props.commands.openDetail}
          onAddRelatedParts={props.onAddRelatedParts}
          relatedPartsLabel={related.label}
          canAddRelatedParts={related.canAdd}
          onOpenGroupEdit={props.commands.openGroup}
          onUpdateRating={props.commands.mutations.updateRating}
        />
      </div>
    );
  };

  return (
    <div>
      <PageHeader icon={config.icon} title={config.title} subtitle={config.subtitle} />
      {model.all.length === 0 ? (
        <PersonalEmptyState
          icon={config.icon}
          title={config.emptyTitle}
          description={config.emptyDescription}
        />
      ) : (
        <div className="min-w-0 space-y-5">
          {props.activeTab === "progress" && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <PersonalMetricCard label="Devam eden toplam" value={model.all.length} />
                <PersonalMetricCard label="Bitirmeye yakın" value={nearCompletion.length} accent />
                <PersonalMetricCard
                  label="Duraklatılmış"
                  value={model.all.filter((item) => item.status === "paused").length}
                />
                <PersonalMetricCard
                  label="Son 7 gün ilerleme"
                  value={props.progressLogs.filter(
                    (log) =>
                      log.action !== "added" &&
                      Date.parse(log.createdAt) >= renderedAt - 7 * 24 * 60 * 60 * 1000,
                  ).length}
                  hint="aktivite"
                />
              </div>
              {nearCompletion.length > 0 && (
                <section aria-label="Bitirmeye Yakın" className="space-y-3">
                  <div className="flex items-center gap-2 border-b border-[var(--app-border)] pb-2">
                    <TrendingUp className="h-4 w-4 text-[var(--app-accent)]" />
                    <h2 className="text-[15px] font-semibold text-[var(--app-text-primary)]">
                      Bitirmeye Yakın
                    </h2>
                    <span className="text-[11px] text-[var(--app-text-muted)]">
                      {nearCompletion.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {nearCompletion.map(renderMediaCard)}
                  </div>
                </section>
              )}
            </>
          )}
          {props.activeTab === "ratings" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <PersonalMetricCard label="Puanlanan" value={ratings.length} />
              <PersonalMetricCard
                label="Ortalama"
                value={(ratings.reduce((total, value) => total + value, 0) / ratings.length).toFixed(1)}
                accent
              />
              <PersonalMetricCard
                label="En yüksek"
                value={Math.max(...ratings)}
                hint={`${ratings.filter((value) => value === Math.max(...ratings)).length} adet`}
              />
            </div>
          )}
          <PersonalControls
            searchValue={query}
            onSearchChange={(value) => setQueries((current) => ({ ...current, [props.activeTab]: value }))}
            searchPlaceholder={`${config.title} içinde ara...`}
            sortValue={sort}
            onSortChange={(value) =>
              setSorts((current) => ({ ...current, [props.activeTab]: value as PersonalSort }))
            }
            sortOptions={config.sortOptions}
            countLabel={`${model.visible.length} / ${model.all.length}`}
          />
          {model.visible.length === 0 ? (
            <PersonalEmptyState
              icon={Search}
              title="Sonuç bulunamadı"
              description="Arama terimini değiştirerek tekrar deneyebilirsin."
              tone="text-zinc-500"
            />
          ) : (
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
              {model.visible.map(renderMediaCard)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
