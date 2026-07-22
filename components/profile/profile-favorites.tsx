import type { MediaItem } from "@/lib/types";

export function ProfileFavorites({ items, onOpen }: { items: MediaItem[]; onOpen?: (item: MediaItem) => void }) {
  const favorites = items.filter((item) => item.favorite).slice().sort((a, b) => a.title.localeCompare(b.title, "tr")).slice(0, 10);
  return (
    <section className="app-card rounded-2xl border p-4 sm:p-5">
      <div className="mb-4 flex items-end justify-between gap-3"><div><h2 className="text-sm font-semibold">Favori Vitrini</h2><p className="mt-1 text-xs text-[var(--app-text-muted)]">Öne çıkan favori içerikler</p></div><span className="text-xs tabular-nums text-[var(--app-text-muted)]">{favorites.length}</span></div>
      {favorites.length === 0 ? <p className="rounded-xl border border-dashed border-[var(--app-border)] px-4 py-8 text-center text-sm text-[var(--app-text-muted)]">Henüz favori vitrin yok.</p> : (
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
    </section>
  );
}

