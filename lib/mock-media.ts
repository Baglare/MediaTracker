// ============================================
// Sahte (Mock) Medya Verileri
// ============================================
// Gerçek bir API veya veritabanı yerine bu verileri kullanıyoruz.
// İleride Supabase, TMDB, AniList gibi servislerle değiştirilecek.

import { MediaItem } from "./types";

export const mockMediaList: MediaItem[] = [
  // --- FİLMLER ---
  {
    id: "1",
    title: "Inception",
    type: "movie",
    status: "completed",
    coverImage: "/placeholders/movie.svg",
    currentProgress: 148,
    totalProgress: 148,
  },
  {
    id: "2",
    title: "Interstellar",
    type: "movie",
    status: "planning",
    coverImage: "/placeholders/movie.svg",
    currentProgress: 0,
    totalProgress: 169,
  },
  {
    id: "3",
    title: "The Dark Knight",
    type: "movie",
    status: "completed",
    coverImage: "/placeholders/movie.svg",
    currentProgress: 152,
    totalProgress: 152,
  },

  // --- DİZİLER ---
  {
    id: "4",
    title: "Breaking Bad",
    type: "tv",
    status: "watching",
    coverImage: "/placeholders/tv.svg",
    currentProgress: 42,
    totalProgress: 62,
  },
  {
    id: "5",
    title: "Stranger Things",
    type: "tv",
    status: "paused",
    coverImage: "/placeholders/tv.svg",
    currentProgress: 17,
    totalProgress: 34,
  },

  // --- ANİME ---
  {
    id: "6",
    title: "Attack on Titan",
    type: "anime",
    status: "completed",
    coverImage: "/placeholders/anime.svg",
    currentProgress: 87,
    totalProgress: 87,
  },
  {
    id: "7",
    title: "Jujutsu Kaisen",
    type: "anime",
    status: "watching",
    coverImage: "/placeholders/anime.svg",
    currentProgress: 35,
    totalProgress: 47,
  },
  {
    id: "8",
    title: "Demon Slayer",
    type: "anime",
    status: "watching",
    coverImage: "/placeholders/anime.svg",
    currentProgress: 26,
    totalProgress: 44,
  },

  // --- MANGA ---
  {
    id: "9",
    title: "One Piece",
    type: "manga",
    status: "reading",
    coverImage: "/placeholders/manga.svg",
    currentProgress: 1089,
    totalProgress: 1120,
  },
  {
    id: "10",
    title: "Berserk",
    type: "manga",
    status: "paused",
    coverImage: "/placeholders/manga.svg",
    currentProgress: 220,
    totalProgress: 374,
  },

  // --- MANHWA ---
  {
    id: "11",
    title: "Solo Leveling",
    type: "manhwa",
    status: "completed",
    coverImage: "/placeholders/manhwa.svg",
    currentProgress: 179,
    totalProgress: 179,
  },
  {
    id: "12",
    title: "Tower of God",
    type: "manhwa",
    status: "reading",
    coverImage: "/placeholders/manhwa.svg",
    currentProgress: 380,
    totalProgress: 600,
  },

  // --- KİTAPLAR ---
  {
    id: "13",
    title: "Dune",
    type: "book",
    status: "reading",
    coverImage: "/placeholders/book.svg",
    currentProgress: 280,
    totalProgress: 688,
  },
  {
    id: "14",
    title: "1984",
    type: "book",
    status: "planning",
    coverImage: "/placeholders/book.svg",
    currentProgress: 0,
    totalProgress: 328,
  },
  {
    id: "15",
    title: "Sapiens",
    type: "book",
    status: "dropped",
    coverImage: "/placeholders/book.svg",
    currentProgress: 120,
    totalProgress: 464,
  },
];
