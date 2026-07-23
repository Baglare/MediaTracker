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
  return (
    <div>
      <PageHeader
        icon={Compass}
        title="Keşfet"
        subtitle="Film, dizi, anime, manga ve kitapları kaynaklar arasında ara."
      />
      <div className="space-y-6">
        <GlobalSearch
          getLibraryStatus={controller.getLibraryStatus}
          onAddToLibrary={
            controller.addFromGlobalSearch as (
              item: GlobalSearchResult,
              options?: { relatedOnly?: boolean },
            ) => Promise<void>
          }
          prefill={prefill}
        />
        <section className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-1)]">
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
                TVmaze, AniList veya Open Library kaynağını ayrı ara.
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
              <TvmazeSearch
                isInLibrary={controller.isInLibrary}
                onAddToLibrary={controller.addTvmaze}
              />
              <AniListSearch
                isInLibrary={controller.isInLibrary}
                onAddToLibrary={controller.addAniList}
              />
              <OpenLibrarySearch
                isInLibrary={controller.isInLibrary}
                onAddToLibrary={controller.addOpenLibrary}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
