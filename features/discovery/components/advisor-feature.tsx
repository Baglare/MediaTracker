"use client";

import { Sparkles } from "lucide-react";
import AiAdvisor from "@/components/ai-advisor";
import PageHeader from "@/components/page-header";
import type { GlobalSearchResult } from "@/lib/global-search-types";
import type { MediaItem, MediaType, ProgressLog } from "@/lib/types";

interface AdvisorFeatureProps {
  mediaList: MediaItem[];
  progressLogs: ProgressLog[];
  onAddToLibrary: (result: GlobalSearchResult) => void | Promise<void>;
  onOpenDiscover: (title: string, mediaType: MediaType) => void;
}

export default function AdvisorFeature({
  mediaList,
  progressLogs,
  onAddToLibrary,
  onOpenDiscover,
}: AdvisorFeatureProps) {
  return (
    <div>
      <PageHeader
        icon={Sparkles}
        title="AI Danışman"
        subtitle="Kütüphanenden yola çıkarak öneriler ve analizler"
      />
      <AiAdvisor
        mediaList={mediaList}
        progressLogs={progressLogs}
        resetSignal={0}
        onAddToLibrary={onAddToLibrary}
        onOpenDiscover={(recommendation) =>
          onOpenDiscover(recommendation.title, recommendation.mediaType)
        }
      />
    </div>
  );
}
