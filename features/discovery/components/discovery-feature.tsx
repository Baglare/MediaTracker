"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Compass } from "lucide-react";
import AniListSearch from "@/components/anilist-search";
import GlobalSearch from "@/components/global-search";
import OpenLibrarySearch from "@/components/openlibrary-search";
import PageHeader from "@/components/page-header";
import TvmazeSearch from "@/components/tvmaze-search";
import type { GlobalSearchCategory, GlobalSearchResult } from "@/lib/global-search-types";
import type { useDiscoveryController } from "@/features/discovery/hooks/use-discovery-controller";
import { useProviderCapabilities } from "@/hooks/use-provider-capabilities";

type DiscoveryController = ReturnType<typeof useDiscoveryController>;

interface DiscoveryFeatureProps {
  controller: DiscoveryController;
  prefill: {
    query: string;
    category: GlobalSearchCategory;
    token: number;
  } | null;
}

export default function DiscoveryFeature({
  controller,
  prefill,
}: DiscoveryFeatureProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { capabilities, loading } = useProviderCapabilities();
  const enabled = capabilities.providers;
  const enabledSourceCount = Object.values(enabled).filter((provider) => provider.enabled).length;
  const enabledAdvancedSourceCount = [enabled.tvmaze, enabled.anilist, enabled.openlibrary]
    .filter((provider) => provider.enabled).length;
  const enabledLabels = [enabled.tmdb.enabled && "film", enabled.tvmaze.enabled && "dizi", enabled.anilist.enabled && "anime/manga", enabled.openlibrary.enabled && "kitap"].filter(Boolean);
  return (
    <div>
      <PageHeader
        icon={Compass}
        title="Keşfet"
        subtitle={loading ? "Public arama kaynakları doğrulanıyor." : enabledLabels.length > 0 ? `${enabledLabels.join(", ")} kaynaklarında ara.` : "Public arama kaynakları şu anda kullanılamıyor."}
      />
      <div className="space-y-6">
        {!loading && enabledSourceCount > 0 ? <GlobalSearch
          getLibraryStatus={controller.getLibraryStatus}
          onAddToLibrary={
            controller.addFromGlobalSearch as (
              item: GlobalSearchResult,
              options?: { relatedOnly?: boolean },
            ) => Promise<void>
          }
          prefill={prefill}
          capabilities={capabilities}
        /> : <div className="app-panel rounded-2xl border p-5 text-sm text-[var(--app-text-muted)]">{loading ? "Arama kaynakları doğrulanıyor…" : "Kullanılabilir public arama kaynağı bulunmuyor."}</div>}
        {!loading && enabledAdvancedSourceCount > 0 && <section className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-1)]">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-[var(--app-text-secondary)] transition-colors hover:bg-[var(--app-hover)]"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((value) => !value)}
          >
            <span className="flex min-w-0 flex-col text-left">
              <span className="text-[13.5px] font-semibold tracking-tight text-[var(--app-text-primary)]">
                Kaynak Bazlı Arama
              </span>
              <span className="truncate text-[11.5px] font-normal text-[var(--app-text-muted)]">
                {[enabled.tvmaze.enabled && "TVMaze", enabled.anilist.enabled && "AniList", enabled.openlibrary.enabled && "Open Library"].filter(Boolean).join(", ")} kaynağını ayrı ara.
              </span>
            </span>
            {showAdvanced ? (
              <ChevronUp className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0" />
            )}
          </button>
          {showAdvanced && (
            <div className="space-y-4 border-t border-[var(--app-border)] p-4">
              {enabled.tvmaze.enabled && <TvmazeSearch
                isInLibrary={controller.isInLibrary}
                onAddToLibrary={controller.addTvmaze}
              />}
              {enabled.anilist.enabled && <AniListSearch
                isInLibrary={controller.isInLibrary}
                onAddToLibrary={controller.addAniList}
              />}
              {enabled.openlibrary.enabled && <OpenLibrarySearch
                isInLibrary={controller.isInLibrary}
                onAddToLibrary={controller.addOpenLibrary}
              />}
            </div>
          )}
        </section>}
      </div>
    </div>
  );
}
