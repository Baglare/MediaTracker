// ============================================
// Open Library Kitap Arama API Route'u
// ============================================
// GET /api/openlibrary/search?q=mistborn
//
// Open Library API'sine sunucu tarafında istek atar.
// Token gerektirmez (Open Library ücretsiz API).
// Sonuçları normalize edip JSON olarak döndürür.

import { NextRequest, NextResponse } from "next/server";
import {
  OpenLibrarySearchResponse,
  OpenLibraryRawDoc,
  OpenLibraryNormalizedResult,
} from "@/lib/openlibrary-types";

/**
 * Tek bir Open Library doc'unu normalize eder.
 */
export function normalizeDoc(doc: OpenLibraryRawDoc): OpenLibraryNormalizedResult {
  // Kapak URL'si oluştur: cover_i değeri varsa resim URL'si yap
  // ?default=false → kapak yoksa 404 döndürür (kırık resim yerine)
  const coverUrl = doc.cover_i
    ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg?default=false`
    : undefined;

  // Sayfa sayısı: number_of_pages_median varsa kullan, yoksa 1 fallback
  const pageCount = doc.number_of_pages_median || undefined;
  const totalProgress = pageCount || 1;

  // Konular: çok kalabalık olmasın diye en fazla 5 tane al
  const subjects = doc.subject
    ? doc.subject.slice(0, 5)
    : undefined;

  // ISBN'ler: çok kalabalık olmasın diye en fazla 3 tane al
  const isbn = doc.isbn
    ? doc.isbn.slice(0, 3)
    : undefined;

  return {
    externalSource: "openlibrary",
    externalId: doc.key,
    type: "book",
    title: doc.title,
    authors: doc.author_name || undefined,
    releaseYear: doc.first_publish_year || undefined,
    coverUrl,
    totalProgress,
    pageCount,
    editionCount: doc.edition_count || undefined,
    languages: doc.language || undefined,
    subjects,
    isbn,
    workId: doc.key,
    editionId: doc.edition_key?.[0] ? `/books/${doc.edition_key[0]}` : undefined,
  };
}

/**
 * GET /api/openlibrary/search?q=mistborn
 */
export async function GET(request: NextRequest) {
  // 1) Arama metnini al
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");

  if (!query || query.trim().length === 0) {
    return NextResponse.json(
      { error: "Arama metni (q) gerekli." },
      { status: 400 }
    );
  }

  // 2) Open Library API'sine istek at
  try {
    const params = new URLSearchParams({
      q: query.trim(),
      limit: "12",
      fields:
        "key,title,author_name,first_publish_year,cover_i,edition_count,edition_key,isbn,language,number_of_pages_median,subject",
    });

    const url = `https://openlibrary.org/search.json?${params.toString()}`;

    const olResponse = await fetch(url, {
      headers: { accept: "application/json" },
    });

    if (!olResponse.ok) {
      return NextResponse.json(
        { error: `Open Library API hatası: ${olResponse.status}` },
        { status: 502 }
      );
    }

    const data = (await olResponse.json()) as OpenLibrarySearchResponse;

    // 3) Sonuçları normalize et
    const results = data.docs.map(normalizeDoc);

    return NextResponse.json({
      results,
      totalFound: data.numFound,
    });
  } catch (err) {
    console.error("Open Library arama hatası:", err);
    return NextResponse.json(
      { error: "Open Library'e bağlanırken bir hata oluştu." },
      { status: 502 }
    );
  }
}
