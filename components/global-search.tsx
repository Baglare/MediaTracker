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
import { AniListNormalizedResult } from "@/lib/anilist-types";
import { OpenLibraryNormalizedResult } from "@/lib/openlibrary-types";
import { OmdbNormalizedResult } from "@/lib/omdb-types";
import { TmdbNormalizedResult } from "@/lib/tmdb-types";

interface GlobalSearchProps {
  getLibraryStatus: (item: GlobalSearchResult) => Promise<GlobalSearchLibraryStatus> | GlobalSearchLibraryStatus;
  onAddToLibrary: (item: GlobalSearchResult, options?: { relatedOnly?: boolean }) => void | Promise<void>;
  // R40 — Dış kaynaklardan (örn. AI Danışman "Keşfet'te Ara") gelen prefill
  // sinyali. token monoton artar; aynı (query, category) için bile yeni
  // token ile değişirse prefill yeniden uygulanır.
  prefill?: { query: string; category?: GlobalSearchCategory; token: number } | null;
}

// R23.2: Kategori chip seti Kütüphanem'in Dünya taksonomisine paralel
// olarak sadeleşti. "manhwa" ve "manhua" artık kendi chip'leri değil —
// "manga" chip'i bu üç sonuç tipini birden gösterir. "novel" yeni chip:
// AniList format=NOVEL + light/web/visual novel tiplerini toplar. Fetch
// katmanına yeni param geçmiyoruz: chip görünüm filtresi `viewCategoryOf`
// üzerinden client-side yapılır; aynı raw havuz reuse edilir.
const CATEGORIES: { value: GlobalSearchCategory; label: string }[] = [
  { value: "all", label: "Hepsi" },
  { value: "movie", label: "Film" },
  { value: "tv", label: "Dizi" },
  { value: "anime", label: "Anime" },
  { value: "manga", label: "Manga" },
  { value: "novel", label: "Novel" },
  { value: "book", label: "Kitap" },
];

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

// Source-spesifik diagnostic — AniList gibi alt sistem 0 sonuç ya da
// hata dönerse UI'da küçük bir not gösterebilmek için kullanılır.
interface SourceDiag {
  called: boolean;
  count: number;
  failed?: boolean;
  reason?: string;
}

export default function GlobalSearch({ getLibraryStatus, onAddToLibrary, prefill }: GlobalSearchProps) {
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
  // R40 — Prefill: render fazında query/category setter'ları, auto-search
  // useEffect içinde ref-gate ile bir kez tetiklenir. State setter'ı effect
  // içinde çağrılmaz (kuralı tetiklemez); handleSearch async olduğundan
  // setIsSearching gibi iç state'ler effect body'sinin dışında oluşur.
  const [lastPrefillToken, setLastPrefillToken] = useState<number | null>(null);
  const consumedPrefillToken = useRef<number | null>(null);
  if (prefill && prefill.token !== lastPrefillToken) {
    setLastPrefillToken(prefill.token);
    const nextQuery = prefill.query || "";
    const nextCategory: GlobalSearchCategory = prefill.category || "all";
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

      // R23.2: AniList fetch'i yeni chip setine göre.
      //   - anime → category=anime (sadece ANIME bucket)
      //   - manga / novel / all → category=all (ANIME+MANGA bucket, country
      //     filter yok → manhwa/manhua dahil; novel için format=NOVEL
      //     client-side filtre uygulanır).
      // movie/tv/book chip'lerinde anilist hiç çağrılmaz.
      if (
        activeCategory === "all" ||
        activeCategory === "anime" ||
        activeCategory === "manga" ||
        activeCategory === "novel"
      ) {
        const anilistParam = activeCategory === "anime" ? "anime" : "all";
        fetchPromises.push(
          fetch(`/api/anilist/search?q=${encodeURIComponent(query)}&category=${anilistParam}`)
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
      void handleSearch(null, prefill.category || "all");
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
  // Backend tarafları: AniList 12, OpenLibrary 12, TVmaze/OMDb default — 9 hepsiyle uyumlu.
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
          Tüm aktif kaynakları aynı sorguda tara — film, dizi, anime, manga, novel ve kitap.
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
        {CATEGORIES.map((cat) => {
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
                {renderGroup("Novel", groupedResults.novel)}
                {renderGroup("Kitaplar", groupedResults.book)}
              </div>
            ) : (
              // R23.2: Tek-kategori görünümünde sonuçları seçili chip'in
              // ViewCategory'sine göre filtrele. AniList "all" çağrısından
              // gelen MANGA + format=NOVEL kayıtları "manga" chip'inde
              // görünmez, "novel" chip'inde görünür.
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
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
