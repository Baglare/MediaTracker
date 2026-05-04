// ============================================
// Global Search (Keşfet) Component
// ============================================

"use client";

import { useState } from "react";
import { Search, Loader2, Info } from "lucide-react";
import { GlobalSearchResult, GlobalSearchCategory } from "@/lib/global-search-types";
import GlobalSearchResultCard from "./global-search-result-card";
import { TvmazeNormalizedResult } from "@/lib/tvmaze-types";
import { AniListNormalizedResult } from "@/lib/anilist-types";
import { OpenLibraryNormalizedResult } from "@/lib/openlibrary-types";

interface GlobalSearchProps {
  isInLibrary: (source: string, externalId: string) => boolean;
  onAddToLibrary: (item: GlobalSearchResult) => void;
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

export default function GlobalSearch({ isInLibrary, onAddToLibrary }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<GlobalSearchCategory>("all");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());

  // Arama işlemi
  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    if (category === "movie") {
      setHasSearched(true);
      setResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);
    setHasSearched(true);
    setResults([]);

    try {
      const fetchPromises: Promise<GlobalSearchResult[]>[] = [];

      // TVmaze araması
      if (category === "all" || category === "tv") {
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

      // AniList araması
      if (["all", "anime", "manga", "manhwa", "manhua"].includes(category)) {
        fetchPromises.push(
          fetch(`/api/anilist/search?q=${encodeURIComponent(query)}&category=${category}`)
            .then((res) => (res.ok ? res.json() : { results: [] }))
            .then((data: { results: AniListNormalizedResult[] }) => {
              const resArray = data.results || [];
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
            .catch(() => [])
        );
      }

      // Open Library araması
      if (category === "all" || category === "book") {
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
      let combined: GlobalSearchResult[] = [];

      resultsArrays.forEach((result) => {
        if (result.status === "fulfilled") {
          combined = [...combined, ...result.value];
        }
      });

      setResults(combined);
    } catch (err) {
      console.error(err);
      setError("Arama sırasında beklenmeyen bir hata oluştu.");
    } finally {
      setIsSearching(false);
    }
  }

  // Ekleme butonu handler'ı
  async function handleAdd(result: GlobalSearchResult) {
    const key = `${result.source}-${result.externalId}`;
    setAddingIds((prev) => new Set(prev).add(key));

    try {
      await onAddToLibrary(result);
    } finally {
      setAddingIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  // Gruplama mantığı
  const groupedResults = {
    tv: results.filter((r) => r.type === "tv").slice(0, 6),
    anime: results.filter((r) => r.type === "anime").slice(0, 6),
    manga: results.filter((r) => r.type === "manga").slice(0, 6),
    manhwa: results.filter((r) => r.type === "manhwa").slice(0, 6),
    manhua: results.filter((r) => r.type === "manhua").slice(0, 6),
    book: results.filter((r) => r.type === "book").slice(0, 6),
  };

  const renderGroup = (title: string, items: GlobalSearchResult[]) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3 uppercase tracking-wider">{title}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map((res) => (
            <GlobalSearchResultCard
              key={`${res.source}-${res.externalId}`}
              result={res}
              isInLibrary={isInLibrary(res.source, res.externalId)}
              isAdding={addingIds.has(`${res.source}-${res.externalId}`)}
              onAdd={handleAdd}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800/50 p-5 mb-8">
      {/* Başlık ve Açıklama */}
      <div className="mb-5">
        <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <Search className="w-5 h-5 text-violet-400" />
          Keşfet
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Dizi, anime, manga, manhwa, manhua ve kitapları tek yerden ara.
        </p>
      </div>

      {/* Arama Formu */}
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

      {/* Kategori Filtreleri */}
      <div className="flex flex-wrap gap-2 mb-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => {
              setCategory(cat.value);
              if (query.trim()) {
                // Kategori değişince otomatik ara, eğer arama yapıldıysa
                if (hasSearched) {
                  setTimeout(() => handleSearch(), 0);
                }
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

      {/* Mesajlar ve Sonuçlar */}
      <div className="mt-4">
        {category === "movie" ? (
          <div className="flex items-start gap-3 p-4 bg-amber-500/10 rounded-xl border border-amber-500/20">
            <Info className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-400">Film araması geçici olarak devre dışı.</p>
              <p className="text-xs text-amber-500/80 mt-1">
                TMDB erişimi düzeldiğinde buraya eklenecek. Şimdilik filmleri manuel ekleyebilirsin.
              </p>
            </div>
          </div>
        ) : error ? (
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
                {renderGroup("Diziler", groupedResults.tv)}
                {renderGroup("Animeler", groupedResults.anime)}
                {renderGroup("Mangalar", groupedResults.manga)}
                {renderGroup("Manhwalar", groupedResults.manhwa)}
                {renderGroup("Manhualar", groupedResults.manhua)}
                {renderGroup("Kitaplar", groupedResults.book)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {results.map((res) => (
                  <GlobalSearchResultCard
                    key={`${res.source}-${res.externalId}`}
                    result={res}
                    isInLibrary={isInLibrary(res.source, res.externalId)}
                    isAdding={addingIds.has(`${res.source}-${res.externalId}`)}
                    onAdd={handleAdd}
                  />
                ))}
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
