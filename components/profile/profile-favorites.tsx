import { Heart } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { PageSection } from "@/components/ui/page-section";
import type { MediaItem } from "@/lib/types";

export function ProfileFavorites({ items, onOpen }: { items: MediaItem[]; onOpen?: (item: MediaItem) => void }) {
  const favorites = items.filter((item) => item.favorite).slice().sort((a, b) => a.title.localeCompare(b.title, "tr")).slice(0, 10);
  return (
    <PageSection title="Favori Vitrini" description="Öne çıkan favori içerikler" count={favorites.length}>
      {favorites.length === 0 ? <EmptyState compact title="Henüz favori vitrin yok" description="Favori olarak işaretlediğin medyalar burada sergilenecek." icon={<Heart className="h-5 w-5" aria-hidden="true"/>}/> : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {favorites.map((item) => (
            <button key={item.id} type="button" onClick={() => onOpen?.(item)} className="group min-w-0 cursor-pointer rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-focus)]" title={item.title}>
              <span className="block aspect-[2/3] overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-3)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.coverImage || "/placeholders/book.svg"} alt="" className="h-full w-full object-cover transition-transform motion-safe:group-hover:scale-[1.03]" loading="lazy" />
              </span>
              <span className="mt-2 block truncate text-xs text-[var(--app-text-secondary)]">{item.title}</span>
            </button>
          ))}
        </div>
      )}
    </PageSection>
  );
}
