// ============================================
// Open Library Kitap Arama Bileşeni
// ============================================
// Open Library API üzerinden kitap araması yapar.
// Sonuçları listeler, kullanıcı "Listeme Ekle" deyince
// kitabı listeye ekler. Detail endpoint gerekmez çünkü
// arama sonuçları zaten sayfa sayısı içerir.

"use client";

import { useState, useCallback } from "react";
import { Search, BookOpen, Loader2, X, ChevronDown, ChevronUp } from "lucide-react";
import { OpenLibraryNormalizedResult } from "@/lib/openlibrary-types";
import OpenLibraryResultCard from "./openlibrary-result-card";

interface OpenLibrarySearchProps {
  // Belirli bir Open Library key'inin zaten listede olup olmadığını kontrol eder
  isInLibrary: (externalSource: string, externalId: string) => boolean;
  // Sonucu listeye ekler
  onAddToLibrary: (result: OpenLibraryNormalizedResult) => void;
}

export default function OpenLibrarySearch({
  isInLibrary,
  onAddToLibrary,
}: OpenLibrarySearchProps) {
  // Panel açık/kapalı durumu
  const [isExpanded, setIsExpanded] = useState(false);
  // Arama metni
  const [query, setQuery] = useState("");
  // Arama sonuçları
  const [results, setResults] = useState<OpenLibraryNormalizedResult[]>([]);
  // Yükleniyor mu?
  const [isLoading, setIsLoading] = useState(false);
  // Hata mesajı
  const [error, setError] = useState<string | null>(null);
  // En az bir arama yapıldı mı?
  const [hasSearched, setHasSearched] = useState(false);
  // Şu anda hangi kitap ekleniyor? (ID → loading durumu)
  const [addingId, setAddingId] = useState<string | null>(null);

  /**
   * Open Library araması yapar.
   */
  async function handleSearch() {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const response = await fetch("/api/openlibrary/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message = data?.error || `Hata: ${response.status}`;
        setError(message);
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

  /**
   * Enter tuşuna basılınca arama yap.
   */
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleSearch();
    }
  }

  /**
   * Temizle
   */
  function handleClear() {
    setQuery("");
    setResults([]);
    setError(null);
    setHasSearched(false);
  }

  /**
   * Listeye ekle: Open Library arama sonuçları zaten sayfa sayısını
   * içerdiği için ayrı bir detail endpoint çağırmaya gerek yok.
   */
  const handleAdd = useCallback(
    (result: OpenLibraryNormalizedResult) => {
      // Zaten listede mi kontrol et
      if (isInLibrary("openlibrary", result.externalId)) return;
      if (addingId === result.externalId) return;

      setAddingId(result.externalId);

      // Kısa bir gecikme ekleyerek "Ekleniyor" animasyonunu göster
      setTimeout(() => {
        onAddToLibrary(result);
        setAddingId(null);
      }, 300);
    },
    [isInLibrary, onAddToLibrary, addingId]
  );

  return (
    <div className="mb-4">
      {/* Başlık çubuğu — tıklayınca panel açılır/kapanır */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/50 rounded-xl border border-zinc-800/50 hover:border-zinc-700/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-green-400" />
          </div>
          <div className="text-left">
            <span className="text-sm font-medium text-zinc-200">
              Kitap Ara
            </span>
            <p className="text-[11px] text-zinc-500">
              Open Library üzerinden kitap arayın ve listenize ekleyin
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
          {/* Arama çubuğu */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Kitap adı yaz..."
                className="w-full pl-10 pr-9 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 transition-all"
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
                    : "bg-green-500/20 text-green-300 ring-1 ring-green-500/40 hover:bg-green-500/30"
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

          {/* Hata mesajı */}
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Yükleniyor göstergesi */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-green-400 animate-spin" />
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
                <OpenLibraryResultCard
                  key={`ol-${result.externalId}`}
                  result={result}
                  isAlreadyAdded={isInLibrary("openlibrary", result.externalId)}
                  isAdding={addingId === result.externalId}
                  onAdd={handleAdd}
                />
              ))}
            </div>
          )}

          {/* Sonuç bulunamadı */}
          {!isLoading && hasSearched && results.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-8">
              <p className="text-zinc-400 text-sm">Sonuç bulunamadı</p>
              <p className="text-zinc-600 text-xs mt-1">
                Farklı bir arama terimi deneyin
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
