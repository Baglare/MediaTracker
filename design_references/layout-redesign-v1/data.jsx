/* ============================================================
   MediaTracker — Mock data
   ============================================================ */

const TYPE_LABELS = {
  anime: "Anime",
  manga: "Manga",
  manhwa: "Manhwa",
  manhua: "Manhua",
  novel: "Novel",
  ln: "Light Novel",
  wn: "Web Novel",
  movie: "Film",
  tv: "Dizi",
  book: "Kitap",
};

const TYPE_TONES = {
  anime: { bg: "linear-gradient(135deg, #5d3a8a, #2a1845)", accent: "#c79afc" },
  manga: { bg: "linear-gradient(135deg, #8a3a52, #45182b)", accent: "#ff9eb0" },
  manhwa: { bg: "linear-gradient(135deg, #3a5d8a, #182a45)", accent: "#9ec3ff" },
  manhua: { bg: "linear-gradient(135deg, #8a6a3a, #453218)", accent: "#e8b86a" },
  novel: { bg: "linear-gradient(135deg, #3a8a6a, #184532)", accent: "#9ee8c3" },
  ln: { bg: "linear-gradient(135deg, #3a8a8a, #184545)", accent: "#9ee0e8" },
  wn: { bg: "linear-gradient(135deg, #6a3a8a, #321845)", accent: "#cb9ee8" },
  movie: { bg: "linear-gradient(135deg, #6fb0e0, #2a5d8a)", accent: "#9ec3ff" },
  tv: { bg: "linear-gradient(135deg, #e8b86a, #8a6a3a)", accent: "#f3c878" },
  book: { bg: "linear-gradient(135deg, #8e7556, #4a3d2c)", accent: "#d4b893" },
};

const CONTINUE_ITEMS = [
  {
    id: "c1",
    title: "Frieren: Beyond Journey's End",
    type: "anime",
    subtype: "TV",
    status: "watching",
    total: 28,
    current: 1,
    pct: 4,
    nextLabel: "S2 · Bölüm 2",
    favorite: true,
    cover: "FRIEREN",
  },
  {
    id: "c2",
    title: "Solo Leveling",
    type: "manhwa",
    subtype: "Çevrimiçi",
    status: "watching",
    total: 200,
    current: 72,
    pct: 36,
    nextLabel: "Bölüm 73",
    favorite: true,
    cover: "SOLO LV",
  },
  {
    id: "c3",
    title: "Jujutsu Kaisen",
    type: "anime",
    subtype: "TV",
    status: "watching",
    total: 47,
    current: 29,
    pct: 62,
    nextLabel: "S2 · Bölüm 7",
    favorite: false,
    cover: "JJK",
  },
  {
    id: "c4",
    title: "Your Name.",
    type: "movie",
    subtype: "2016",
    status: "watching",
    total: 107,
    current: 83,
    pct: 78,
    nextLabel: "01:23 / 01:47",
    favorite: true,
    cover: "KIMI",
  },
];

const SERIES_GROUP = {
  title: "Game of Thrones",
  badge: "SERİ",
  tags: ["Drama", "Adventure", "Fantasy"],
  seasons: 8,
  totalEp: 73,
  completed: 1,
  pct: 50,
  type: "tv",
  children: [
    { label: "1. Sezon", state: "completed", ep: 10, total: 10, pct: 100 },
    { label: "2. Sezon", state: "watching", ep: 5, total: 10, pct: 50, current: true },
    { label: "3. Sezon", state: "planned", ep: 0, total: 10, pct: 0 },
    { label: "4. Sezon", state: "planned", ep: 0, total: 10, pct: 0 },
    { label: "5. Sezon", state: "planned", ep: 0, total: 10, pct: 0 },
    { label: "6. Sezon", state: "planned", ep: 0, total: 10, pct: 0 },
    { label: "7. Sezon", state: "planned", ep: 0, total: 6, pct: 0 },
  ],
};

const LIBRARY = [
  { id: "l1",  title: "Demon Slayer",     type: "anime",   total: 56,   pct: 84, rating: 9.1, status: "watching",  fav: true,  cover: "DS" },
  { id: "l2",  title: "Attack on Titan",  type: "anime",   total: 98,   pct: 100, rating: 9.6, status: "completed", fav: true,  cover: "AOT" },
  { id: "l3",  title: "Violet Evergarden",type: "anime",   total: 13,   pct: 100, rating: 9.4, status: "completed", fav: false, cover: "VEG" },
  { id: "l4",  title: "Spirited Away",    type: "movie",   total: 1,    pct: 100, rating: 9.2, status: "completed", fav: true,  cover: "SPRT" },
  { id: "l5",  title: "Berserk",          type: "manga",   total: 364,  pct: 41, rating: 9.8, status: "watching",  fav: true,  cover: "BSRK" },
  { id: "l6",  title: "Vinland Saga",     type: "manga",   total: 210,  pct: 60, rating: 9.3, status: "watching",  fav: false, cover: "VNLD" },
  { id: "l7",  title: "One Piece",        type: "anime",   total: 1112, pct: 22, rating: 9.0, status: "watching",  fav: false, cover: "OP"   },
  { id: "l8",  title: "The Beginning After the End", type: "ln", total: 10, pct: 70, rating: 8.7, status: "watching", fav: false, cover: "TBATE" },
  { id: "l9",  title: "Tomorrow, and Tomorrow, and Tomorrow", type: "book", total: 1, pct: 100, rating: 8.4, status: "completed", fav: false, cover: "TTT" },
  { id: "l10", title: "Mistborn: Final Empire", type: "novel", total: 1, pct: 45, rating: 9.0, status: "watching", fav: false, cover: "MSTB" },
  { id: "l11", title: "Omniscient Reader",type: "manhwa",  total: 220,  pct: 12, rating: 8.9, status: "watching",  fav: true,  cover: "ORV"  },
  { id: "l12", title: "Tower of God",     type: "manhwa",  total: 590,  pct: 0,  rating: null, status: "planned",   fav: false, cover: "TOG"  },
];

const UPCOMING = [
  { title: "Frieren: Beyond Journey's End", meta: "2. Sezon 3. Bölüm", when: "BUGÜN", tone: "accent", cover: "FRN" },
  { title: "Solo Leveling",                 meta: "2. Sezon 6. Bölüm", when: "2 GÜN", tone: "muted", cover: "SLV" },
  { title: "Jujutsu Kaisen",                meta: "2. Sezon 8. Bölüm", when: "4 GÜN", tone: "muted", cover: "JJK" },
  { title: "One Piece",                     meta: "Bölüm 1113",         when: "PZR",   tone: "muted", cover: "OP" },
];

const ACTIVITY = [
  { tone: "watching",  text: <><strong>Solo Leveling</strong> · Bölüm 72 izlendi</>, time: "13dk" },
  { tone: "completed", text: <><strong>Attack on Titan</strong> tamamlandı</>,        time: "1s" },
  { tone: "added",     text: <>Listeye <strong>Berserk</strong> eklendi</>,            time: "3s" },
  { tone: "watching",  text: <><strong>Jujutsu Kaisen</strong> · S2 B6 izlendi</>,    time: "Dün" },
  { tone: "added",     text: <><strong>Mistborn</strong> notlandı</>,                  time: "2g" },
];

Object.assign(window, {
  TYPE_LABELS, TYPE_TONES,
  CONTINUE_ITEMS, SERIES_GROUP, LIBRARY, UPCOMING, ACTIVITY,
});
