import { LoadingState } from "@/components/ui/loading-state";
import { PageHero, type PageHeroTone } from "@/components/ui/page-hero";

export function PageLoading({
  title,
  description,
  tone = "neutral",
}: {
  title: string;
  description: string;
  tone?: PageHeroTone;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl" aria-label={`${title} yükleniyor`}>
      <PageHero title={title} description={description} tone={tone} />
      <div className="grid gap-4 lg:grid-cols-2">
        <LoadingState label={`${title} özeti yükleniyor…`} rows={4} />
        <LoadingState label={`${title} içeriği yükleniyor…`} rows={4} />
      </div>
    </div>
  );
}
