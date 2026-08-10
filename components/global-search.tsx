// ============================================
// Global Search (Kesfet) Component
// ============================================

"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import {
  GlobalSearchResult,
  GlobalSearchCategory,
  GlobalSearchLibraryStatus,
} from "@/lib/global-search-types";
import GlobalSearchResultCard from "./global-search-result-card";
import { TvmazeNormalizedResult } from "@/lib/tvmaze-types";
import { OpenLibraryNormalizedResult } from "@/lib/openlibrary-types";
import { TmdbNormalizedResult } from "@/lib/tmdb-types";
import type { PublicProviderCapabilities } from "@/lib/providers/types";
import {
  anilistDiagnosticMessage,
  collectFulfilledSearchResults,
  fetchAniListGlobalSearch,
  type AniListSearchDiagnostic,
} from "@/lib/anilist-search-diagnostic";

interface GlobalSearchProps {
  getLibraryStatus: (item: GlobalSearchResult) => Promise<GlobalSearchLibraryStatus> | GlobalSearchLibraryStatus;
  onAddToLibrary: (item: GlobalSearchResult, options?: { relatedOnly?: boolean }) => void | Promise<void>;
  // R40 — Dış kaynaklardan (örn. AI Danışman "Keşfet'te Ara") gelen prefill
  // sinyali. token monoton artar; aynı (query, category) için bile yeni
  // token ile değişirse prefill yeniden uygulanır.
  prefill?: { query: string; category?: GlobalSearchCategory; token: number } | null;
  capabilities: PublicProviderCapabilities;
}

// R23.2: Kategori chip seti Kütüphanem'in Dünya taksonomisine paralel
// olarak sadeleşti. "manhwa" ve "manhua" artık kendi chip'leri değil —
// "manga" chip'i bu üç sonuç tipini birden gösterir. "novel" yeni chip:
// AniList format=NOVEL + light/web/visual novel tiplerini toplar. Fetch
// katmanına yeni param geçmiyoruz: chip görünüm filtresi `viewCategoryOf`
// üzerinden client-side yapılır; aynı raw havuz reuse edilir.
export function categoriesForCapabilities(capabilities: PublicProviderCapabilities): { value: GlobalSearchCategory; label: string }[] {
  const categories: { value: GlobalSearchCategory; label: string }[] = [{ value: "all", label: "Hepsi" }];
  if (capabilities.providers.tmdb.enabled) categories.push({ value: "movie", label: "Film" });
  if (capabilities.providers.tvmaze.enabled) categories.push({ value: "tv", label: "Dizi" });
  if (capabilities.providers.anilist.enabled) categories.push({ value: "anime", label: "Anime" }, { value: "manga", label: "Manga" }, { value: "novel", label: "Novel" });
  if (capabilities.providers.openlibrary.enabled) categories.push({ value: "book", label: "Kitap" });
  return categories;
}

export function categoryForCapabilities(
  category: GlobalSearchCategory | undefined,
  capabilities: PublicProviderCapabilities,
): GlobalSearchCategory {
  const requested = category ?? "all";
  return categoriesForCapabilities(capabilities).some((item) => item.value === requested)
    ? requested
    : "all";
}

// Görsel chip / group anahtarı. AniList raw'ındaki format=NOVEL light novel
// olarak konumlanır; type alanı (manga/manhwa/manhua) tek bir "Manga" grubu
// altında toplanır. Bu fonksiyon SADECE görünüm için — depolama veya add
// flow davranışı bu mapping'i etkilemez (MediaItem type alanı orijinal kalır).
type ViewCategory = "movie" | "tv" | "anime" | "manga" | "novel" | "book";

function viewCategoryOf(r: GlobalSearchResult): ViewCategory {
  if (r.type === "movie") return "movie";
  if (r.type === "tv") return "tv";
  if (r.type === "anime") return "anime";
  if (r.type === "book") return "book";
  if (r.type === "light_novel" || r.type === "web_novel" || r.type === "visual_novel") {
    return "novel";
  }
  // manga / manhwa / manhua: AniList raw format=NOVEL → light novel.
  const fmt =
    r.raw && typeof r.raw === "object" && "format" in r.raw
      ? (r.raw as { format?: unknown }).format
      : undefined;
  if (typeof fmt === "string" && fmt.toUpperCase() === "NOVEL") return "novel";
  return "manga";
}

const DEFAULT_LIBRARY_STATUS: GlobalSearchLibraryStatus = {
  isInLibrary: false,
  hasAddableParts: false,
};

export default function GlobalSearch({ getLibraryStatus, onAddToLibrary, prefill, capabilities }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<GlobalSearchCategory>("all");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [libraryStatuses, setLibraryStatuses] = useState<Record<string, GlobalSearchLibraryStatus>>({});
  // V5A.x bug fix: AniList kaynağının sessiz "0 sonuç" durumu — section
  // hiç render edilmediği için kullanıcı kaynak çağrılmamış sandı. Artık
  // diag tutup empty/error notunu kullanıcıya gösteriyoruz.
  const [anilistDiag, setAnilistDiag] = useState<AniListSearchDiagnostic | null>(null);
  // R40 — Prefill: render fazında query/category setter'ları, auto-search
  // useEffect içinde ref-gate ile bir kez tetiklenir. State setter'ı effect
  // içinde çağrılmaz (kuralı tetiklemez); handleSearch async olduğundan
  // setIsSearching gibi iç state'ler effect body'sinin dışında oluşur.
  const [lastPrefillToken, setLastPrefillToken] = useState<number | null>(null);
  const consumedPrefillToken = useRef<number | null>(null);
  const categories = categoriesForCapabilities(capabilities);
  const enabledLabels = categories.slice(1).map((item) => item.label.toLocaleLowerCase("tr-TR"));
  const anyProviderEnabled = enabledLabels.length > 0;
  if (prefill && prefill.token !== lastPrefillToken) {
    setLastPrefillToken(prefill.token);
    const nextQuery = prefill.query || "";
    const nextCategory = categoryForCapabilities(prefill.category, capabilities);
    setQuery(nextQuery);
    setCategory(nextCategory);
  }

  async function handleSearch(
    e?: React.FormEvent | null,
    overrideCategory?: GlobalSearchCategory,
  ) {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    // BUG FIX: Kategori değişiminde re-search, setCategory henüz commit
    // olmadan çağrıldığı için closure'daki `category` eski kalıyordu — sonuçlar
    // önceki kategoriye göre çekiliyor, kullanıcıya alakasız bir liste düşüyordu.
    // Çağıran taraf yeni değeri `overrideCategory` ile geçebilir.
    const activeCategory = categoryForCapabilities(overrideCategory ?? category, capabilities);

    setIsSearching(true);
    setError(null);
    setHasSearched(true);
    setResults([]);
    setLibraryStatuses({});
    setAnilistDiag(null);

    try {
      const fetchPromises: Promise<GlobalSearchResult[]>[] = [];

      if (capabilities.providers.tmdb.enabled && (activeCategory === "all" || activeCategory === "movie")) {
        const moviePipeline: Promise<GlobalSearchResult[]> = (async () => {
          try {
            const res = await fetch("/api/tmdb/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query }),
            });
            const data = (await res.json().catch(() => ({ results: [] }))) as {
              results?: TmdbNormalizedResult[];
              error?: string;
            };
            if (res.ok) {
              return (data.results || []).map((item): GlobalSearchResult => ({
                source: "tmdb",
                externalId: item.externalId,
                type: "movie",
                title: item.title,
                subtitle: item.originalTitle,
                overview: item.overview,
                releaseYear: item.releaseYear,
                coverUrl: item.coverUrl,
                totalProgress: item.totalProgress,
                sourceUrl: `https://www.themoviedb.org/movie/${encodeURIComponent(item.externalId)}`,
                raw: item,
              }));
            }
          } catch {
            return [];
          }
          return [];
        })();

        fetchPromises.push(moviePipeline);
      }

      if (capabilities.providers.tvmaze.enabled && (activeCategory === "all" || activeCategory === "tv")) {
        fetchPromises.push(
          fetch("/api/tvmaze/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query }),
          })
            .then((res) => (res.ok ? res.json() : { results: [] }))
            .then((data: { results: TvmazeNormalizedResult[] }) => {
              const resArray = data.results || [];
              return resArray.map((item): GlobalSearchResult => ({
                source: "tvmaze",
                externalId: item.externalId,
                type: "tv",
                title: item.title,
                subtitle: item.language,
                overview: item.overview,
                releaseYear: item.releaseYear,
                coverUrl: item.coverUrl,
                genres: item.genres,
                sourceUrl: item.siteUrl,
                raw: item,
              }));
            })
            .catch(() => [])
        );
      }

      // R23.2: AniList fetch'i yeni chip setine göre.
      //   - anime → category=anime (sadece ANIME bucket)
      //   - manga / novel / all → category=all (ANIME+MANGA bucket, country
      //     filter yok → manhwa/manhua dahil; novel için format=NOVEL
      //     client-side filtre uygulanır).
      // movie/tv/book chip'lerinde anilist hiç çağrılmaz.
      if (capabilities.providers.anilist.enabled && (
        activeCategory === "all" ||
        activeCategory === "anime" ||
        activeCategory === "manga" ||
        activeCategory === "novel"
      )) {
        const anilistParam = activeCategory === "anime" ? "anime" : "all";
        fetchPromises.push(
          fetchAniListGlobalSearch({ query, category: anilistParam })
            .then(({ results: resArray, diagnostic }) => {
              setAnilistDiag(diagnostic);
              return resArray.map((item): GlobalSearchResult => ({
                source: "anilist",
                externalId: item.externalId,
                type: item.type,
                title: item.title,
                subtitle: item.originalTitle,
                nativeTitle: item.nativeTitle,
                overview: item.overview,
                releaseYear: item.releaseYear,
                coverUrl: item.coverUrl,
                genres: item.genres,
                totalProgress: item.totalProgress,
                sourceUrl: item.siteUrl,
                raw: item,
              }));
            })
        );
      }

      if (capabilities.providers.openlibrary.enabled && (activeCategory === "all" || activeCategory === "book")) {
        fetchPromises.push(
          fetch("/api/openlibrary/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query }),
          })
            .then((res) => (res.ok ? res.json() : { results: [] }))
            .then((data: { results: OpenLibraryNormalizedResult[] }) => {
              const resArray = data.results || [];
              return resArray.map((item): GlobalSearchResult => ({
                source: "openlibrary",
                externalId: item.externalId,
                type: "book",
                title: item.title,
                subtitle: item.authors?.join(", "),
                overview: item.overview,
                releaseYear: item.releaseYear,
                coverUrl: item.coverUrl,
                subjects: item.subjects,
                authors: item.authors,
                totalProgress: item.totalProgress,
                sourceUrl: item.siteUrl,
                raw: item,
              }));
            })
            .catch(() => [])
        );
      }

      const resultsArrays = await Promise.allSettled(fetchPromises);
      if (activeCategory === "movie") {
        const rejected = resultsArrays.find((result) => result.status === "rejected");
        if (rejected && rejected.reason instanceof Error) {
          throw rejected.reason;
        }
      }

      const combined = collectFulfilledSearchResults(resultsArrays);
      // NOT: Listede zaten olan item'ları sonuçlardan ÇIKARMIYORUZ. Kütüphane
      // durumu ayrıca getLibraryStatus üzerinden çözülüp karta "Listede" rozeti
      // veya "Sezon/Parça Ekle" aksiyonu olarak yansıtılıyor — sonuç görünür kalmalı.
      setResults(combined);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Arama sırasında beklenmeyen bir hata oluştu.");
    } finally {
      setIsSearching(false);
    }
  }

  // R19: results boş olduğunda libraryStatuses'i temizleme kısmı effect'in
  // içinde *senkron* setState çağrısıydı → `react-hooks/set-state-in-effect`
  // hatası. Render-phase guard'a taşındı (yalnızca harita doluyken bir kez
  // setlenir, sonra koşul false olur → loop yok). Async upsert kısmı effect
  // içinde — bu hâlâ async callback olduğu için kuralı tetiklemiyor.
  if (results.length === 0 && Object.keys(libraryStatuses).length > 0) {
    setLibraryStatuses({});
  }

  // R40 — Prefill auto-search: lastPrefillToken render fazında ayarlandıktan
  // sonra (query/category setter'ları commit oldu), bu effect handleSearch'ü
  // bir defalık çalıştırır. consumedPrefillToken ref'i tekrar tetiklenmeyi
  // önler.
  useEffect(() => {
    if (!prefill) return;
    if (lastPrefillToken !== prefill.token) return;
    if (consumedPrefillToken.current === prefill.token) return;
    if (!prefill.query.trim()) return;
    consumedPrefillToken.current = prefill.token;
    // setTimeout ile bir tick defer ediyoruz — handleSearch içinde sync
    // setState'ler (setIsSearching, setResults, ...) effect body'sinin
    // doğrudan zincirinde olmasın diye. Bu, react-hooks/set-state-in-effect
    // ihlalinden kaçınmanın temiz yolu.
    const handle = setTimeout(() => {
      void handleSearch(null, categoryForCapabilities(prefill.category, capabilities));
    }, 0);
    return () => clearTimeout(handle);
    // handleSearch closure'da güncel query/category'i okur (render fazında
    // commit edildi); deps listesi sadece prefill + lastPrefillToken.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill, lastPrefillToken]);

  useEffect(() => {
    if (results.length === 0) return;
    let cancelled = false;

    async function resolveStatuses() {
      const entries = await Promise.all(
        results.map(async (result) => {
          const key = `${result.source}-${result.externalId}`;
          try {
            const status = await Promise.resolve(getLibraryStatus(result));
            return [key, status] as const;
          } catch {
            return [key, DEFAULT_LIBRARY_STATUS] as const;
          }
        })
      );

      if (cancelled) return;
      setLibraryStatuses(Object.fromEntries(entries));
    }

    void resolveStatuses();

    return () => {
      cancelled = true;
    };
  }, [getLibraryStatus, results]);

  async function handleAdd(result: GlobalSearchResult, options?: { relatedOnly?: boolean }) {
    const key = `${result.source}-${result.externalId}`;
    setAddingIds((prev) => new Set(prev).add(key));

    try {
      await onAddToLibrary(result, options);
      const nextStatus = await Promise.resolve(getLibraryStatus(result));
      setLibraryStatuses((prev) => ({ ...prev, [key]: nextStatus }));
    } finally {
      setAddingIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  // Kategori başına gösterilen maksimum sonuç sayısı.
  // Backend tarafları: AniList 12, OpenLibrary 12 ve TVMaze default — 9 hepsiyle uyumlu.
  const PER_CATEGORY_LIMIT = 9;
  // R23.2: Görsel gruplama `viewCategoryOf` üzerinden. Manga grubu
  // manga+manhwa+manhua'yı; novel grubu light/web/visual novel'i ve
  // AniList format=NOVEL kayıtlarını toplar.
  const byView = (target: ViewCategory) =>
    results.filter((r) => viewCategoryOf(r) === target).slice(0, PER_CATEGORY_LIMIT);
  const groupedResults: Record<ViewCategory, GlobalSearchResult[]> = {
    movie: byView("movie"),
    tv: byView("tv"),
    anime: byView("anime"),
    manga: byView("manga"),
    novel: byView("novel"),
    book: byView("book"),
  };

  const renderGroup = (title: string, items: GlobalSearchResult[]) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-6">
        {/* R23: Section başlığı + sayım rozeti — Kütüphanem SectionHead diliyle uyumlu */}
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-[12px] font-semibold text-zinc-300 uppercase tracking-[0.14em]">
            {title}
          </h3>
          <span className="text-[10.5px] font-mono tabular-nums text-zinc-500 px-1.5 py-0.5 rounded-md bg-zinc-900/60 border border-zinc-800/60">
            {items.length}
          </span>
          <div className="flex-1 h-px bg-zinc-800/60" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {items.map((res) => {
            const key = `${res.source}-${res.externalId}`;
            return (
              <GlobalSearchResultCard
                key={key}
                result={res}
                libraryStatus={libraryStatuses[key] ?? DEFAULT_LIBRARY_STATUS}
                isAdding={addingIds.has(key)}
                onAdd={handleAdd}
              />
            );
          })}
        </div>
      </div>
    );
  };

  return (
    // R23: Yüzey dili rafine — `rounded-2xl border-zinc-800/60 bg-zinc-900/30`
    // (page-surface dialect). Section başlığı kompakt; arama formu mobilde
    // dikey, sm+ yatay; kategori pill'leri yatay scroll'a uygun.
    <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-4 sm:p-5 mb-6">
      {/* R23.2: PageHeader zaten "Keşfet" diyor; bu panelin başlığı içerik
          niyetini taşısın. "Global Arama" tek satır, alt açıklama kategori
          niyetini özetler. */}
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold text-zinc-100 flex items-center gap-2 tracking-tight">
          <Search className="w-4 h-4 text-[var(--w-primary-strong)]" />
          Global Arama
        </h2>
        <p className="text-[12px] text-zinc-500 mt-0.5">
          {anyProviderEnabled ? `Aktif kaynaklarda ${enabledLabels.join(", ")} ara.` : "Public arama sağlayıcıları şu anda kullanılamıyor."}
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2.5 mb-4">
        <div className="flex-1 relative min-w-0">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Breaking Bad, Naruto, Mistborn, Solo Leveling..."
            className="w-full pl-9 pr-3 h-10 bg-zinc-950/60 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--w-primary)_45%,transparent)] focus:border-[color-mix(in_srgb,var(--w-primary)_45%,transparent)] transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={!query.trim() || isSearching}
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto h-10 px-5 rounded-lg text-sm font-semibold text-zinc-50 ring-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--w-primary) 30%, transparent), color-mix(in srgb, var(--w-secondary) 22%, transparent))",
            boxShadow:
              "inset 0 0 0 1px color-mix(in srgb, var(--w-primary) 48%, transparent)",
          }}
        >
          {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ara"}
        </button>
      </form>

      {/* R23: Kategori pill'leri mobilde yatay scroll, sm+ wrap.
          Aktif state dünya tonunda; eski sabit violet kaldırıldı. */}
      <div className="-mx-1 flex sm:flex-wrap items-center gap-1.5 overflow-x-auto sm:overflow-visible scrollbar-hide px-1 touch-pan-x mb-5">
        {categories.map((cat) => {
          const active = category === cat.value;
          return (
            <button
              key={cat.value}
              type="button"
              onClick={() => {
                setCategory(cat.value);
                if (query.trim() && hasSearched) {
                  // Kategori değişiminde closure'daki `category` state daha commit
                  // olmadığı için EXPLICIT override geçiyoruz (eski not korundu).
                  setTimeout(() => handleSearch(null, cat.value), 0);
                }
              }}
              aria-pressed={active}
              className={`shrink-0 inline-flex items-center h-8 px-3 rounded-lg text-[12px] font-medium ring-1 transition-colors cursor-pointer ${
                active
                  ? "text-[var(--w-primary-strong)]"
                  : "bg-zinc-900/50 text-zinc-400 ring-zinc-800 hover:bg-zinc-800/60 hover:text-zinc-200"
              }`}
              style={
                active
                  ? {
                      background: "var(--w-soft)",
                      boxShadow:
                        "inset 0 0 0 1px color-mix(in srgb, var(--w-primary) 40%, transparent)",
                    }
                  : undefined
              }
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {/* AniList kaynağına özel diag notu — sadece AniList çağrıldı ve 0 sonuç
            ya da hata döndüyse görünür. Diğer kaynakların sonuçlarını gizlemez. */}
        {hasSearched && !isSearching && anilistDiag && anilistDiag.kind !== "results" && (
          <div className={`mb-4 px-3 py-2.5 rounded-lg text-xs flex items-start justify-between gap-3 flex-wrap ${
            anilistDiag.kind === "empty"
              ? "bg-zinc-500/5 ring-1 ring-zinc-500/20 text-zinc-300"
              : "bg-rose-500/5 ring-1 ring-rose-500/20 text-rose-300/90"
          }`}>
            <div className="flex-1 min-w-0">
              {anilistDiagnosticMessage(anilistDiag)}
            </div>
            <button
              type="button"
              onClick={() => handleSearch(null, category)}
              disabled={isSearching}
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-rose-500/10 text-rose-200 ring-1 ring-rose-500/30 hover:bg-rose-500/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Tekrar Dene
            </button>
          </div>
        )}

        {error ? (
          <div className="text-center py-8 text-red-400 text-sm">{error}</div>
        ) : isSearching ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
            <span className="ml-3 text-sm text-zinc-400">Aranıyor...</span>
          </div>
        ) : hasSearched ? (
          results.length > 0 ? (
            category === "all" ? (
              <div className="space-y-2">
                {renderGroup("Filmler", groupedResults.movie)}
                {renderGroup("Diziler", groupedResults.tv)}
                {renderGroup("Animeler", groupedResults.anime)}
                {renderGroup("Mangalar", groupedResults.manga)}
                {renderGroup("Novel", groupedResults.novel)}
                {renderGroup("Kitaplar", groupedResults.book)}
              </div>
            ) : (
              // R23.2: Tek-kategori görünümünde sonuçları seçili chip'in
              // ViewCategory'sine göre filtrele. AniList "all" çağrısından
              // gelen MANGA + format=NOVEL kayıtları "manga" chip'inde
              // görünmez, "novel" chip'inde görünür.
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {results
                  // category burada "all" değil — render üst seviyesinde
                  // ternary ile narrowed; doğrudan ViewCategory karşılaştırması.
                  .filter((r) => viewCategoryOf(r) === (category as ViewCategory))
                  .map((res) => {
                    const key = `${res.source}-${res.externalId}`;
                    return (
                      <GlobalSearchResultCard
                        key={key}
                        result={res}
                        libraryStatus={libraryStatuses[key] ?? DEFAULT_LIBRARY_STATUS}
                        isAdding={addingIds.has(key)}
                        onAdd={handleAdd}
                      />
                    );
                  })}
              </div>
            )
          ) : (
            <div className="text-center py-12">
              <p className="text-sm text-zinc-400">Sonuç bulunamadı.</p>
              <p className="text-xs text-zinc-600 mt-1">Başka bir arama terimi deneyin.</p>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
