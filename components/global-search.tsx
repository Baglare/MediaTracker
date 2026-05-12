// ============================================
// Global Search (Kesfet) Component
// ============================================

"use client";

import { useEffect, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import {
  GlobalSearchResult,
  GlobalSearchCategory,
  GlobalSearchLibraryStatus,
} from "@/lib/global-search-types";
import GlobalSearchResultCard from "./global-search-result-card";
import { TvmazeNormalizedResult } from "@/lib/tvmaze-types";
import { AniListNormalizedResult } from "@/lib/anilist-types";
import { OpenLibraryNormalizedResult } from "@/lib/openlibrary-types";
import { OmdbNormalizedResult } from "@/lib/omdb-types";
import { TmdbNormalizedResult } from "@/lib/tmdb-types";

interface GlobalSearchProps {
  getLibraryStatus: (item: GlobalSearchResult) => Promise<GlobalSearchLibraryStatus> | GlobalSearchLibraryStatus;
  onAddToLibrary: (item: GlobalSearchResult, options?: { relatedOnly?: boolean }) => void | Promise<void>;
}

const CATEGORIES: { value: GlobalSearchCategory; label: string }[] = [
  { value: "all", label: "Hepsi" },
  { value: "tv", label: "Dizi" },
  { value: "anime", label: "Anime" },
  { value: "manga", label: "Manga" },
  { value: "manhwa", label: "Manhwa" },
  { value: "manhua", label: "Manhua" },
  { value: "book", label: "Kitap" },
  { value: "movie", label: "Film" },
];

const DEFAULT_LIBRARY_STATUS: GlobalSearchLibraryStatus = {
  isInLibrary: false,
  hasAddableParts: false,
};

// Source-spesifik diagnostic — AniList gibi alt sistem 0 sonuç ya da
// hata dönerse UI'da küçük bir not gösterebilmek için kullanılır.
interface SourceDiag {
  called: boolean;
  count: number;
  failed?: boolean;
  reason?: string;
}

export default function GlobalSearch({ getLibraryStatus, onAddToLibrary }: GlobalSearchProps) {
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
  const [anilistDiag, setAnilistDiag] = useState<SourceDiag | null>(null);

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
    const activeCategory = overrideCategory ?? category;

    setIsSearching(true);
    setError(null);
    setHasSearched(true);
    setResults([]);
    setLibraryStatuses({});
    setAnilistDiag(null);

    try {
      const fetchPromises: Promise<GlobalSearchResult[]>[] = [];

      if (activeCategory === "all" || activeCategory === "movie") {
        // R21.2: Film pipeline'ı — TMDB **birincil**, OMDb fallback.
        //
        // Akış:
        //   1) /api/tmdb/search → 200 + results.length > 0 ise TMDB sonuçlarını döndür.
        //   2) TMDB unavailable (503), upstream hata (502), network exception veya
        //      0 sonuç durumunda /api/omdb/search'e düş.
        //   3) Kategori "movie" iken her iki kaynak da kırılırsa hatayı yukarı fırlat
        //      ki kullanıcıya "Sonuç bulunamadı / arama başarısız" notu çıksın
        //      (eski OMDb-only davranışın korunması).
        //   4) Kategori "all" iken iki kaynak da boşsa sessizce boş döner —
        //      diğer kaynaklar (tvmaze/anilist/openlibrary) etkilenmez.
        //
        // Bilinçli karar: paralel çalıştırıp dedupe ETMİYORUZ. Sıralı çalışma
        // hem rate-limit dostu hem de "TMDB başarılıysa OMDb karışmasın"
        // şartını doğal olarak sağlıyor. Sadece düşülen fallback'te OMDb
        // sonuçları görünür — duplicate yüzeyi yok.
        const moviePipeline: Promise<GlobalSearchResult[]> = (async () => {
          // --- 1) TMDB dene ---
          let tmdbResults: GlobalSearchResult[] = [];
          let tmdbOk = false;
          try {
            const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query)}`);
            const data = (await res.json().catch(() => ({ results: [] }))) as {
              results?: TmdbNormalizedResult[];
              error?: string;
            };
            if (res.ok) {
              tmdbOk = true;
              const arr = data.results || [];
              tmdbResults = arr.map((item): GlobalSearchResult => ({
                source: "tmdb",
                externalId: item.externalId,
                type: "movie",
                title: item.title,
                subtitle: item.originalTitle,
                overview: item.overview,
                releaseYear: item.releaseYear,
                coverUrl: item.coverUrl,
                totalProgress: item.totalProgress,
                raw: item,
              }));
            } else {
              // 502/503 vb. → fallback'e geç; logu sessizce bırak.
              console.warn(
                `[tmdb] arama başarısız (${res.status}) — OMDb fallback'ine düşülüyor.`,
                data?.error,
              );
            }
          } catch (err) {
            console.warn("[tmdb] fetch exception — OMDb fallback'ine düşülüyor:", err);
          }

          if (tmdbOk && tmdbResults.length > 0) {
            return tmdbResults;
          }

          // --- 2) OMDb fallback ---
          try {
            const res = await fetch(`/api/omdb/search?q=${encodeURIComponent(query)}`);
            const data = (await res.json().catch(() => ({ results: [] }))) as {
              results?: OmdbNormalizedResult[];
              error?: string;
            };
            if (!res.ok) {
              if (activeCategory === "movie") {
                // Hem TMDB hem OMDb kırıldı → kullanıcıya görünür hata.
                throw new Error(data?.error || "Film araması başarısız.");
              }
              return [];
            }
            const arr = data.results || [];
            return arr.map((item): GlobalSearchResult => ({
              source: "omdb",
              externalId: item.externalId,
              type: "movie",
              title: item.title,
              subtitle: item.director,
              overview: item.overview,
              releaseYear: item.releaseYear,
              coverUrl: item.coverUrl,
              genres: item.genres,
              totalProgress: item.totalProgress,
              raw: item,
            }));
          } catch (err) {
            if (activeCategory === "movie") throw err;
            return [];
          }
        })();

        fetchPromises.push(moviePipeline);
      }

      if (activeCategory === "all" || activeCategory === "tv") {
        fetchPromises.push(
          fetch(`/api/tvmaze/search?q=${encodeURIComponent(query)}`)
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
                raw: item,
              }));
            })
            .catch(() => [])
        );
      }

      if (["all", "anime", "manga", "manhwa", "manhua"].includes(activeCategory)) {
        fetchPromises.push(
          fetch(`/api/anilist/search?q=${encodeURIComponent(query)}&category=${activeCategory}`)
            .then(async (res) => {
              const data = (await res.json().catch(() => ({}))) as {
                results?: AniListNormalizedResult[];
                error?: string;
                meta?: { failed?: boolean; reason?: string; count?: number };
              };
              if (!res.ok) {
                // Diag'i kullanıcıya görünür kıl; pipeline'ı kırma.
                setAnilistDiag({
                  called: true,
                  count: 0,
                  failed: true,
                  reason: data?.meta?.reason || data?.error || `HTTP ${res.status}`,
                });
                console.warn("[anilist] route hata döndü:", data?.error || res.status);
                return { results: [] as AniListNormalizedResult[] };
              }
              return { results: data.results || [] };
            })
            .then(({ results }) => {
              const resArray = results || [];
              setAnilistDiag({ called: true, count: resArray.length });
              if (resArray.length === 0) {
                console.warn(
                  `[anilist] 0 sonuç döndü (q="${query}", category="${activeCategory}") — search index geçici sorun yaşıyor olabilir.`,
                );
              }
              return resArray.map((item): GlobalSearchResult => ({
                source: "anilist",
                externalId: item.externalId,
                type: item.type,
                title: item.title,
                subtitle: item.nativeTitle,
                overview: item.overview,
                releaseYear: item.releaseYear,
                coverUrl: item.coverUrl,
                genres: item.genres,
                totalProgress: item.totalProgress,
                raw: item,
              }));
            })
            .catch((err) => {
              setAnilistDiag({
                called: true,
                count: 0,
                failed: true,
                reason: err instanceof Error ? err.message : String(err),
              });
              console.warn("[anilist] fetch exception:", err);
              return [];
            })
        );
      }

      if (activeCategory === "all" || activeCategory === "book") {
        fetchPromises.push(
          fetch(`/api/openlibrary/search?q=${encodeURIComponent(query)}`)
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

      let combined: GlobalSearchResult[] = [];
      resultsArrays.forEach((result) => {
        if (result.status === "fulfilled") {
          combined = [...combined, ...result.value];
        }
      });
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
  // Backend tarafları: AniList 12, OpenLibrary 12, TVmaze/OMDb default — 9 hepsiyle uyumlu.
  const PER_CATEGORY_LIMIT = 9;
  const groupedResults = {
    movie: results.filter((r) => r.type === "movie").slice(0, PER_CATEGORY_LIMIT),
    tv: results.filter((r) => r.type === "tv").slice(0, PER_CATEGORY_LIMIT),
    anime: results.filter((r) => r.type === "anime").slice(0, PER_CATEGORY_LIMIT),
    manga: results.filter((r) => r.type === "manga").slice(0, PER_CATEGORY_LIMIT),
    manhwa: results.filter((r) => r.type === "manhwa").slice(0, PER_CATEGORY_LIMIT),
    manhua: results.filter((r) => r.type === "manhua").slice(0, PER_CATEGORY_LIMIT),
    book: results.filter((r) => r.type === "book").slice(0, PER_CATEGORY_LIMIT),
  };

  const renderGroup = (title: string, items: GlobalSearchResult[]) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3 uppercase tracking-wider">{title}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
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
    <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800/50 p-5 mb-8">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <Search className="w-5 h-5 text-violet-400" />
          Kesfet
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Film, dizi, anime, manga, manhwa, manhua ve kitaplari tek yerden ara.
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex-1 relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Breaking Bad, Naruto, Mistborn, Solo Leveling..."
            className="w-full pl-10 pr-4 py-3 bg-zinc-950/50 border border-zinc-800/80 rounded-xl text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all"
          />
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5" />
        </div>
        <button
          type="submit"
          disabled={!query.trim() || isSearching}
          className="px-6 py-3 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ara"}
        </button>
      </form>

      <div className="flex flex-wrap gap-2 mb-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => {
              setCategory(cat.value);
              if (query.trim() && hasSearched) {
                // Yeni kategoriyi handleSearch'e EXPLICIT geçiyoruz; aksi halde
                // closure içindeki `category` state daha commit olmadığı için
                // eski kategoriyle search yapılır ve kullanıcıya alakasız sonuç döner.
                setTimeout(() => handleSearch(null, cat.value), 0);
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              category === cat.value
                ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40"
                : "bg-zinc-800/50 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {/* AniList kaynağına özel diag notu — sadece AniList çağrıldı ve 0 sonuç
            ya da hata döndüyse görünür. Diğer kaynakların sonuçlarını gizlemez. */}
        {hasSearched && !isSearching && anilistDiag?.called && anilistDiag.count === 0 && (
          <div className="mb-4 px-3 py-2.5 rounded-lg text-xs bg-rose-500/5 ring-1 ring-rose-500/20 text-rose-300/90 flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              {anilistDiag.failed ? (
                <>
                  <span className="font-medium text-rose-200">
                    AniList kaynağına ulaşılamadı
                  </span>
                  {anilistDiag.reason ? (
                    <span className="text-rose-200/60"> · {anilistDiag.reason}</span>
                  ) : null}
                  . Anime / Manga sonuçları bu sorgu için listelenemiyor.
                </>
              ) : (
                <>
                  <span className="font-medium text-rose-200">
                    AniList anime/manga sonucu döndürmedi
                  </span>{" "}
                  (server <span className="font-medium">0 sonuç</span> raporladı).
                  {" Bu MediaTracker tarafında bir hata değil — AniList GraphQL’in `search` alanı şu sıralar global olarak yanıt vermiyor (doğrulandı: id ile arama çalışıyor, metin araması her sorgu için 0 dönüyor)."}
                  {" Diğer kaynaklar etkilenmedi; birkaç dakika sonra tekrar deneyin."}
                </>
              )}
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
                {renderGroup("Manhwalar", groupedResults.manhwa)}
                {renderGroup("Manhualar", groupedResults.manhua)}
                {renderGroup("Kitaplar", groupedResults.book)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {results.map((res) => {
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
