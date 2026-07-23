"use client";

import { ErrorState } from "@/components/ui/error-state";
import { PageHero, type PageHeroTone } from "@/components/ui/page-hero";

export function PageError({
  title,
  description,
  retry,
  tone = "neutral",
}: {
  title: string;
  description: string;
  retry: () => void;
  tone?: PageHeroTone;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHero title={title} description={description} tone={tone} />
      <ErrorState title={`${title} açılamadı`} description="Veriler yüklenirken beklenmeyen bir sorun oluştu. Daha sonra tekrar deneyebilirsin." onRetry={retry} />
    </div>
  );
}
