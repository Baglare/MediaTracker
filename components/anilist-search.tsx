// ============================================
// AniList Anime & Manga Arama Bileşeni
// ============================================
// AniList API üzerinden anime, manga, manhwa ve manhua arar.
// Sonuçları listeler, "Listeme Ekle" butonuyla detay çekip
// kullanıcının kütüphanesine ekler.

"use client";

import { useState, useCallback } from "react";
import {
  Search,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import {
  AniListNormalizedResult,
  AniListCategory,
} from "@/lib/anilist-types";
import AniListResultCard from "./anilist-result-card";

interface AniListSearchProps {
  /** Belirli bir dış kaynaktaki ID'nin zaten listede olup olmadığını kontrol eder */
  isInLibrary: (externalSource: string, externalId: string) => boolean;
  /** Detay sonucuyla birlikte listeye ekler */
  onAddToLibrary: (result: AniListNormalizedResult) => void;
}

/** Kategori seçenekleri */
const CATEGORIES: { label: string; value: AniListCategory }[] = [
  { label: "Hepsi", value: "all" },
  { label: "Anime", value: "anime" },
  { label: "Manga", value: "manga" },
  { label: "Manhwa", value: "manhwa" },
  { label: "Manhua", value: "manhua" },
];

export default function AniListSearch({
  isInLibrary,
  onAddToLibrary,
}: AniListSearchProps) {
  // Panel açık/kapalı
  const [isExpanded, setIsExpanded] = useState(false);
  // Arama metni
  const [query, setQuery] = useState("");
  // Seçili kategori
  const [category, setCategory] = useState<AniListCategory>("all");
  // Sonuçlar
  const [results, setResults] = useState<AniListNormalizedResult[]>([]);
  // Yükleniyor mu?
  const [isLoading, setIsLoading] = useState(false);
  // Hata
  const [error, setError] = useState<string | null>(null);
  // Arama yapıldı mı?
  const [hasSearched, setHasSearched] = useState(false);
  // Hangi sonuç ekleniyor? (externalId)
  const [addingId, setAddingId] = useState<string | null>(null);

  /**
   * AniList araması yapar.
   */
  async function handleSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const url = `/api/anilist/search?q=${encodeURIComponent(
        trimmed
      )}&category=${category}`;

      const response = await fetch(url);

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error || `Hata: ${response.status}`);
        setResults([]);
        return;
      }

      const data = await response.json();
      setResults(data.results || []);
    } catch {
      setError("Arama sırasında bir bağlantı hatası oluştu.");
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }

  /** Enter tuşuna basınca arama yap */
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleSearch();
    }
  }

  /** Temizle */
  function handleClear() {
    setQuery("");
    setResults([]);
    setError(null);
    setHasSearched(false);
  }

  /**
   * Listeme ekle: Önce /api/anilist/details çağır,
   * detay verisiyle kütüphaneye ekle.
   */
  const handleAdd = useCallback(
    async (result: AniListNormalizedResult) => {
      if (isInLibrary("anilist", result.externalId)) return;
      if (addingId === result.externalId) return;

      setAddingId(result.externalId);

      try {
        // Detay endpoint'ini çağır
        const detailRes = await fetch(
          `/api/anilist/details?id=${result.externalId}`
        );

        if (detailRes.ok) {
          const detailData = await detailRes.json();
          // Detay sonucu daha dolu veri sağlar
          onAddToLibrary(detailData.result);
        } else {
          // Detay çekilemezse search sonucunu doğrudan kullan
          onAddToLibrary(result);
        }
      } catch {
        // Hata durumunda search sonucunu kullan
        onAddToLibrary(result);
      } finally {
        setAddingId(null);
      }
    },
    [isInLibrary, onAddToLibrary, addingId]
  );

  return (
    <div className="mb-4">
      {/* Başlık çubuğu */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/50 rounded-xl border border-zinc-800/50 hover:border-zinc-700/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-pink-400" />
          </div>
          <div className="text-left">
            <span className="text-sm font-medium text-zinc-200">
              Anime & Manga Ara
            </span>
            <p className="text-[11px] text-zinc-500">
              AniList üzerinden anime, manga, manhwa ve manhua arayın
            </p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-zinc-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-zinc-500" />
        )}
      </button>

      {/* Genişletilmiş panel */}
      {isExpanded && (
        <div className="mt-3 space-y-4">
          {/* Kategori seçimi */}
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setCategory(cat.value)}
                className={`
                  px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer
                  ${
                    category === cat.value
                      ? "bg-pink-500/20 text-pink-300 ring-1 ring-pink-500/40"
                      : "bg-zinc-800/50 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-400 ring-1 ring-zinc-700/30"
                  }
                `}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Arama çubuğu */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Anime veya manga adı yaz..."
                className="w-full pl-10 pr-9 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500/50 transition-all"
              />
              {query && (
                <button
                  onClick={handleClear}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              onClick={handleSearch}
              disabled={isLoading || !query.trim()}
              className={`
                px-5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer flex items-center gap-2
                ${
                  isLoading || !query.trim()
                    ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                    : "bg-pink-500/20 text-pink-300 ring-1 ring-pink-500/40 hover:bg-pink-500/30"
                }
              `}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              <span>Ara</span>
            </button>
          </div>

          {/* Hata */}
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-pink-400 animate-spin" />
              <span className="ml-2 text-sm text-zinc-500">Aranıyor...</span>
            </div>
          )}

          {/* Sonuçlar */}
          {!isLoading && results.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-500 mb-2">
                <span className="text-zinc-300 font-medium">
                  {results.length}
                </span>{" "}
                sonuç bulundu
              </p>
              {results.map((result) => (
                <AniListResultCard
                  key={`al-${result.externalId}`}
                  result={result}
                  isAlreadyAdded={isInLibrary("anilist", result.externalId)}
                  isAdding={addingId === result.externalId}
                  onAdd={handleAdd}
                />
              ))}
            </div>
          )}

          {/* Sonuç yok */}
          {!isLoading && hasSearched && results.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-8">
              <p className="text-zinc-400 text-sm">Sonuç bulunamadı</p>
              <p className="text-zinc-600 text-xs mt-1">
                Farklı bir arama terimi veya kategori deneyin
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
