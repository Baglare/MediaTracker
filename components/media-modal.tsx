// ============================================
// Medya Ekle / Düzenle Modalı — R22 (Premium redesign)
// ============================================
// Form mantığı / state / validation / save davranışı **birebir** korunur.
// R22'de yalnızca layout & görsel dil yenilendi:
//   - Modal şimdi max-w-2xl, flex-col, sticky header + scroll body + sticky
//     footer. Mobilde tek kolon, sm+ 2 kolon grid.
//   - SectionCard mimarisi: Temel Bilgiler / Durum & İlerleme / Puan & Favori
//     / Etiketler & Notlar / Açıklama / Gelişmiş Metadata / Kaynak Bilgileri.
//   - Tür ve Durum artık select yerine **pill segmented** (touch dostu).
//   - Puan 0–10 number-pad (5×2 grid + "Temizle") — DetailModal/MediaCard ile
//     aynı etkileşim dili. Submit'te `userRating` yine string parse'a düşer
//     ki mevcut handleSubmit doğrulama aynen çalışsın.
//   - Favori büyük toggle chip; Heart fill-current aktif.
//   - data-world scope altında --w-* tokenlarından accent alır (Tümü → nötr).
//
// Davranış dokunulmadı:
//   - editingItem reset pattern (modal-style prev-prop, CLAUDE.md R19).
//   - getStatusOptionsForType, isReading / status auto-switch.
//   - totalProgress=0 "bilinmiyor" semantiği, movie tp=1 / cp clamp.
//   - csvToArray helper'ı ve türe özel alan mapping'i.
//   - Tag chip ekleme (Enter), kişisel notlar, kapak URL placeholder.

"use client";

import { useState } from "react";
import {
  X,
  Plus,
  Heart,
  Star,
  Tv,
  Clapperboard,
  BookOpen,
  Sparkles,
  Tag,
  StickyNote,
  Info,
  Link2,
  Trophy,
  ImageIcon,
  Layers,
} from "lucide-react";
import { MediaItem, MediaType, MediaStatus } from "@/lib/types";
import { getMediaTypeLabel, getStatusLabel } from "@/lib/progress";
import { createManualMediaIdentity, ensureMediaIdentity } from "@/lib/media-identity";

interface MediaModalProps {
  isOpen: boolean;
  editingItem: MediaItem | null;
  onSave: (item: MediaItem) => void;
  onClose: () => void;
}

const mediaTypes: MediaType[] = ["movie", "tv", "anime", "manga", "manhwa", "manhua", "book"];

/**
 * Türe göre uygun durum seçeneklerini döndürür.
 * Okunan türler (kitap/manga/manhwa/manhua) "reading" gösterir, diğerleri "watching".
 */
function getStatusOptionsForType(type: MediaType): MediaStatus[] {
  const isReading = type === "book" || type === "manga" || type === "manhwa" || type === "manhua";
  return ["planning", isReading ? "reading" : "watching", "completed", "paused", "dropped"];
}

function getDefaultCover(type: MediaType): string {
  return `/placeholders/${type}.svg`;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Ortak input / label class'ları — R22'de "Kontrol" hissi: zinc-950 zemin,
// hafif ring, focus'ta dünya tonuna geçiş.
const inputCls =
  "w-full px-3 py-2 bg-zinc-950/60 border border-zinc-800 rounded-lg text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--w-primary)_45%,transparent)] focus:border-[color-mix(in_srgb,var(--w-primary)_45%,transparent)] transition-colors";
const labelCls = "block text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-1.5";

// SectionCard — DetailModal ile aynı dil (border zinc-800/70, bg zinc-950/40)
// ama modal içinde p-4. İçinde grid kolonlar serbest.
function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-4">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 mb-3">
        <Icon className="w-3.5 h-3.5 text-[var(--w-primary-strong)]" />
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

// Type pill ikonları — segmented control'de hızlı görsel ayrım için.
// MediaType union'ında light/web/visual novel de var; bu form onları manuel
// seçenek olarak listelemiyor (`mediaTypes` sabiti aşağıda), bu yüzden
// Partial. `getTypeIcon` eşleşmezse BookOpen fallback.
const TYPE_ICONS: Partial<Record<MediaType, React.ComponentType<{ className?: string }>>> = {
  movie: Clapperboard,
  tv: Tv,
  anime: Sparkles,
  manga: BookOpen,
  manhwa: BookOpen,
  manhua: BookOpen,
  book: BookOpen,
};
function getTypeIcon(t: MediaType): React.ComponentType<{ className?: string }> {
  return TYPE_ICONS[t] ?? BookOpen;
}

function getStatusPillColor(status: MediaStatus, active: boolean): string {
  if (!active) {
    return "bg-zinc-900/60 text-zinc-400 ring-zinc-800 hover:text-zinc-200";
  }
  switch (status) {
    case "watching":
    case "reading":
      return "bg-blue-500/15 text-blue-200 ring-blue-500/40";
    case "planning":
      return "bg-amber-500/15 text-amber-200 ring-amber-500/40";
    case "completed":
      return "bg-emerald-500/15 text-emerald-200 ring-emerald-500/40";
    case "paused":
      return "bg-orange-500/15 text-orange-200 ring-orange-500/40";
    case "dropped":
      return "bg-rose-500/15 text-rose-200 ring-rose-500/40";
    default:
      return "bg-zinc-800/70 text-zinc-200 ring-zinc-700";
  }
}

export default function MediaModal({ isOpen, editingItem, onSave, onClose }: MediaModalProps) {
  // Temel
  const [title, setTitle] = useState("");
  const [type, setType] = useState<MediaType>("movie");
  const [status, setStatus] = useState<MediaStatus>("planning");
  const [currentProgress, setCurrentProgress] = useState(0);
  const [totalProgress, setTotalProgress] = useState(0);
  const [coverImage, setCoverImage] = useState("");
  const [releaseYear, setReleaseYear] = useState("");
  const [overview, setOverview] = useState("");

  // Kişisel
  const [userRating, setUserRating] = useState<string>("");
  const [favorite, setFavorite] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [personalNotes, setPersonalNotes] = useState("");

  // Türe özel
  const [runtime, setRuntime] = useState("");
  const [nativeTitle, setNativeTitle] = useState("");
  const [volumes, setVolumes] = useState("");
  const [format, setFormat] = useState("");
  const [anilistStatus, setAnilistStatus] = useState("");
  const [countryOfOrigin, setCountryOfOrigin] = useState("");
  const [numberOfSeasons, setNumberOfSeasons] = useState("");
  const [networkName, setNetworkName] = useState("");
  const [genresInput, setGenresInput] = useState("");
  const [authorsInput, setAuthorsInput] = useState("");
  const [isbnInput, setIsbnInput] = useState("");
  const [languagesInput, setLanguagesInput] = useState("");
  const [subjectsInput, setSubjectsInput] = useState("");

  // Modal her açıldığında veya editingItem değiştiğinde formu sıfırla.
  // CLAUDE.md R19: modal-style prev-prop karşılaştırma — render fazında guard'lı.
  const [resetKey, setResetKey] = useState<string | null>(null);
  const desiredKey = isOpen ? (editingItem?.id ?? "__new__") : null;
  if (resetKey !== desiredKey) {
    setResetKey(desiredKey);
    if (editingItem) {
      setTitle(editingItem.title);
      setType(editingItem.type);
      setStatus(editingItem.status);
      setCurrentProgress(editingItem.currentProgress);
      setTotalProgress(editingItem.totalProgress);
      const isPlaceholder = editingItem.coverImage.startsWith("/placeholders/");
      setCoverImage(isPlaceholder ? "" : editingItem.coverImage);
      setReleaseYear(editingItem.releaseYear?.toString() || "");
      setOverview(editingItem.overview || "");
      setUserRating(editingItem.userRating != null ? String(editingItem.userRating) : "");
      setFavorite(editingItem.favorite || false);
      setTags(editingItem.tags || []);
      setPersonalNotes(editingItem.personalNotes || "");
      setRuntime(editingItem.runtime?.toString() || "");
      setNativeTitle(editingItem.nativeTitle || "");
      setVolumes(editingItem.volumes?.toString() || "");
      setFormat(editingItem.format || "");
      setAnilistStatus(editingItem.anilistStatus || "");
      setCountryOfOrigin(editingItem.countryOfOrigin || "");
      setNumberOfSeasons(editingItem.numberOfSeasons?.toString() || "");
      setNetworkName(editingItem.networkName || "");
      setGenresInput(editingItem.genres?.join(", ") || "");
      setAuthorsInput(editingItem.authors?.join(", ") || "");
      setIsbnInput(editingItem.isbn?.join(", ") || "");
      setLanguagesInput(editingItem.languages?.join(", ") || "");
      setSubjectsInput(editingItem.subjects?.join(", ") || "");
    } else {
      setTitle(""); setType("movie"); setStatus("planning");
      setCurrentProgress(0); setTotalProgress(0); setCoverImage("");
      setReleaseYear(""); setOverview("");
      setUserRating(""); setFavorite(false); setTags([]); setTagInput(""); setPersonalNotes("");
      setRuntime(""); setNativeTitle("");
      setVolumes(""); setFormat(""); setAnilistStatus(""); setCountryOfOrigin("");
      setNumberOfSeasons(""); setNetworkName(""); setGenresInput("");
      setAuthorsInput(""); setIsbnInput("");
      setLanguagesInput(""); setSubjectsInput("");
    }
  }

  if (!isOpen) return null;

  const isEditMode = editingItem !== null;
  const isMovie = type === "movie";
  const isTV = type === "tv";
  const isAnime = type === "anime";
  const isManga = type === "manga" || type === "manhwa" || type === "manhua";
  const isBook = type === "book";

  // Virgülle ayrılmış input'u array'e çevir (mevcut helper'ın aynısı).
  function csvToArray(val: string): string[] | undefined {
    const arr = val.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    return arr.length > 0 ? arr : undefined;
  }

  function handleAddTag() {
    const trimmed = tagInput.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    if (tags.some((t) => t.toLowerCase() === lower)) return;
    setTags([...tags, trimmed]);
    setTagInput("");
  }

  function handleRemoveTag(index: number) {
    setTags(tags.filter((_, i) => i !== index));
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); handleAddTag(); }
  }

  function handleTypeChange(nextType: MediaType) {
    setType(nextType);
    // Tür değişince watching↔reading karışmasın diye uygun aktif duruma otomatik geçiş.
    const isReading = nextType === "book" || nextType === "manga" || nextType === "manhwa" || nextType === "manhua";
    if (status === "watching" && isReading) setStatus("reading");
    else if (status === "reading" && !isReading) setStatus("watching");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    const finalCover = coverImage.trim() || getDefaultCover(type);

    // totalProgress: film=1; diğerlerinde 0 ("bilinmiyor") da geçerli.
    let tp = isMovie ? 1 : Math.max(0, Number(totalProgress) || 0);
    let cp = Math.max(0, Number(currentProgress) || 0);
    if (isMovie) { cp = status === "completed" ? 1 : cp > 0 ? 1 : 0; tp = 1; }
    // Bilinen total varsa cp > tp olamaz; bilinmiyorsa (tp=0) cp serbest kalır.
    if (tp > 0 && cp > tp) tp = cp;

    // userRating doğrulama — formatı korumak için yine string parse.
    let rating: number | null = null;
    if (userRating !== "") {
      const n = parseInt(userRating, 10);
      if (!isNaN(n) && n >= 0 && n <= 10) rating = n;
    }

    const item: MediaItem = {
      ...(editingItem || {}),
      id: editingItem?.id || generateId(),
      identity: editingItem
        ? ensureMediaIdentity(editingItem).item.identity
        : createManualMediaIdentity(),
      title: title.trim(),
      type, status,
      coverImage: finalCover,
      currentProgress: cp,
      totalProgress: tp,
      userRating: rating,
      favorite,
      tags,
      personalNotes: personalNotes.trim(),
      releaseYear: releaseYear ? Number(releaseYear) : undefined,
      overview: overview.trim() || undefined,
    };

    if (isMovie) {
      item.runtime = runtime ? Number(runtime) : undefined;
    }
    if (isTV) {
      item.numberOfSeasons = numberOfSeasons ? Number(numberOfSeasons) : undefined;
      item.numberOfEpisodes = tp;
      item.networkName = networkName.trim() || undefined;
      item.genres = csvToArray(genresInput);
    }
    if (isAnime) {
      item.nativeTitle = nativeTitle.trim() || undefined;
      item.episodes = tp;
      item.format = format.trim() || undefined;
      item.anilistStatus = anilistStatus.trim() || undefined;
      item.genres = csvToArray(genresInput);
    }
    if (isManga) {
      item.nativeTitle = nativeTitle.trim() || undefined;
      item.chapters = tp;
      item.volumes = volumes ? Number(volumes) : undefined;
      item.format = format.trim() || undefined;
      item.countryOfOrigin = countryOfOrigin.trim() || undefined;
      item.genres = csvToArray(genresInput);
    }
    if (isBook) {
      item.authors = csvToArray(authorsInput);
      item.pageCount = tp;
      item.isbn = csvToArray(isbnInput);
      item.languages = csvToArray(languagesInput);
      item.subjects = csvToArray(subjectsInput);
    }

    onSave(item);
  }

  // Türe göre ilerleme label'ları
  const progressCurrentLabel = isBook ? "Mevcut Sayfa" : "Mevcut Bölüm";
  const progressTotalLabel = isBook ? "Toplam Sayfa" : "Toplam Bölüm";

  const sourceLabel =
    editingItem?.externalSource === "tvmaze"
      ? "TVMaze"
      : editingItem?.externalSource === "anilist"
        ? "AniList"
        : editingItem?.externalSource === "openlibrary"
          ? "Open Library"
          : editingItem?.externalSource === "omdb"
            ? "OMDb"
            : editingItem?.externalSource === "tmdb"
              ? "TMDB"
              : editingItem?.externalSource === "manual"
                ? "Manuel"
                : null;

  const ratingValue = userRating === "" ? null : parseInt(userRating, 10);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[var(--app-overlay)] backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={isEditMode ? "Medya Düzenle" : "Yeni Medya Ekle"}
    >
      <div
        className="app-panel relative w-full sm:max-w-2xl border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:my-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* === STICKY HEADER === */}
        <div className="relative shrink-0 px-5 py-4 border-b border-zinc-800/70 bg-zinc-950/60 backdrop-blur-sm">
          <div
            aria-hidden
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              background:
                "linear-gradient(135deg, var(--w-soft) 0%, transparent 60%)",
            }}
          />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-8 h-8 rounded-lg grid place-items-center"
                style={{
                  background: "var(--w-soft)",
                  boxShadow:
                    "inset 0 0 0 1px color-mix(in srgb, var(--w-primary) 35%, transparent)",
                }}
              >
                <Layers className="w-4 h-4 text-[var(--w-primary-strong)]" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-zinc-50 tracking-tight truncate">
                  {isEditMode ? "Medya Düzenle" : "Yeni Medya Ekle"}
                </h2>
                <p className="text-[11px] text-zinc-500 truncate">
                  {isEditMode
                    ? "Mevcut alanları güncelle ve kaydet."
                    : "Türünü seç, temel alanları doldur, ekle."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center text-zinc-400 hover:text-white bg-zinc-900/60 hover:bg-zinc-800 ring-1 ring-zinc-800 transition-colors cursor-pointer"
              aria-label="Modalı kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* === BODY === */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-5 space-y-4"
          id="media-modal-form"
        >
          {/* --- 1) Temel Bilgiler --- */}
          <SectionCard icon={Info} title="Temel Bilgiler">
            <div>
              <label className={labelCls}>Başlık *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Örn: Attack on Titan"
                required
                className={inputCls}
              />
            </div>

            {(isAnime || isManga) && (
              <div>
                <label className={labelCls}>
                  Orijinal Başlık <span className="text-zinc-600 font-normal normal-case tracking-normal">(opsiyonel)</span>
                </label>
                <input
                  type="text"
                  value={nativeTitle}
                  onChange={(e) => setNativeTitle(e.target.value)}
                  placeholder="進撃の巨人"
                  className={inputCls}
                />
              </div>
            )}

            <div>
              <label className={labelCls}>Medya Türü</label>
              {/* R22: Pill segmented — touch dostu; aktif state dünya tonunda. */}
              <div className="-mx-1 flex sm:flex-wrap items-center gap-1.5 overflow-x-auto sm:overflow-visible scrollbar-hide px-1 touch-pan-x">
                {mediaTypes.map((t) => {
                  const Icon = getTypeIcon(t);
                  const active = type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleTypeChange(t)}
                      aria-pressed={active}
                      className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12px] font-medium ring-1 transition-colors cursor-pointer ${
                        active
                          ? "text-[var(--w-primary-strong)]"
                          : "bg-zinc-900/60 text-zinc-400 ring-zinc-800 hover:text-zinc-200"
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
                      <Icon className="w-3.5 h-3.5" />
                      {getMediaTypeLabel(t)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>
                  Yayın Yılı <span className="text-zinc-600 font-normal normal-case tracking-normal">(opsiyonel)</span>
                </label>
                <input
                  type="number"
                  value={releaseYear}
                  onChange={(e) => setReleaseYear(e.target.value)}
                  placeholder="2024"
                  className={inputCls}
                />
              </div>
              {isMovie && (
                <div>
                  <label className={labelCls}>Süre (dakika)</label>
                  <input
                    type="number"
                    value={runtime}
                    onChange={(e) => setRuntime(e.target.value)}
                    placeholder="148"
                    className={inputCls}
                  />
                </div>
              )}
              {isTV && (
                <div>
                  <label className={labelCls}>Toplam Sezon</label>
                  <input
                    type="number"
                    min={0}
                    value={numberOfSeasons}
                    onChange={(e) => setNumberOfSeasons(e.target.value)}
                    className={inputCls}
                  />
                </div>
              )}
              {(isAnime || isManga) && (
                <div>
                  <label className={labelCls}>Format</label>
                  <input
                    type="text"
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    placeholder={isAnime ? "TV, OVA, Movie" : "MANGA, ONE_SHOT"}
                    className={inputCls}
                  />
                </div>
              )}
              {isBook && (
                <div>
                  <label className={labelCls}>
                    ISBN <span className="text-zinc-600 font-normal normal-case tracking-normal">(virgülle)</span>
                  </label>
                  <input
                    type="text"
                    value={isbnInput}
                    onChange={(e) => setIsbnInput(e.target.value)}
                    placeholder="978-..."
                    className={inputCls}
                  />
                </div>
              )}
            </div>

            <div>
              <label className={labelCls}>
                <span className="inline-flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" />
                  Kapak URL{" "}
                  <span className="text-zinc-600 font-normal normal-case tracking-normal">(opsiyonel)</span>
                </span>
              </label>
              <input
                type="text"
                value={coverImage}
                onChange={(e) => setCoverImage(e.target.value)}
                placeholder="https://example.com/cover.jpg"
                className={inputCls}
              />
            </div>
          </SectionCard>

          {/* --- 2) Durum & İlerleme --- */}
          <SectionCard icon={Trophy} title="Durum & İlerleme">
            <div>
              <label className={labelCls}>Durum</label>
              <div className="-mx-1 flex sm:flex-wrap items-center gap-1.5 overflow-x-auto sm:overflow-visible scrollbar-hide px-1 touch-pan-x">
                {getStatusOptionsForType(type).map((s) => {
                  const active = status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      aria-pressed={active}
                      className={`shrink-0 inline-flex items-center justify-center h-9 px-3 rounded-lg text-[12px] font-medium ring-1 transition-colors cursor-pointer ${getStatusPillColor(s, active)}`}
                    >
                      {getStatusLabel(s)}
                    </button>
                  );
                })}
              </div>
            </div>

            {!isMovie && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>{progressCurrentLabel}</label>
                    <input
                      type="number"
                      min={0}
                      value={currentProgress === 0 ? "" : currentProgress}
                      placeholder="0"
                      onChange={(e) => setCurrentProgress(Number(e.target.value) || 0)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>
                      {progressTotalLabel}{" "}
                      <span className="text-zinc-600 font-normal normal-case tracking-normal">
                        (bilinmiyorsa 0)
                      </span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={totalProgress === 0 ? "" : totalProgress}
                      placeholder="0"
                      onChange={(e) => setTotalProgress(Number(e.target.value) || 0)}
                      className={inputCls}
                    />
                  </div>
                </div>
                {totalProgress === 0 && (
                  <p className="text-[11px] text-zinc-500 -mt-1">
                    Toplam <span className="font-mono">0</span> bırakılırsa
                    bilgi <span className="text-zinc-300">??</span> olarak gösterilir; ilerleme bar&apos;ı placeholder hâle düşer.
                  </p>
                )}
                {isManga && (
                  <div>
                    <label className={labelCls}>
                      Cilt Sayısı{" "}
                      <span className="text-zinc-600 font-normal normal-case tracking-normal">(opsiyonel)</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={volumes}
                      onChange={(e) => setVolumes(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                )}
              </>
            )}
            {isMovie && (
              <p className="text-[11.5px] text-zinc-500">
                Film kayıtlarında toplam 1 olarak sabittir; durumu{" "}
                <span className="text-zinc-300">Tamamlandı</span> seçmek izlendi olarak işaretler.
              </p>
            )}
          </SectionCard>

          {/* --- 3) Puan & Favori --- */}
          <SectionCard icon={Star} title="Puan & Favori">
            <div>
              <label className={labelCls}>Puanım</label>
              {/* R22: Number-pad. MediaCard / DetailModal popover ile aynı 5×2
                  grid; submit yine string parse'a düştüğü için validation
                  yolu aynen çalışır. */}
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                  const isCurrent = ratingValue === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setUserRating(String(n))}
                      aria-pressed={isCurrent}
                      className={`h-9 rounded-md text-[12.5px] font-mono tabular-nums font-semibold transition-colors cursor-pointer ring-1 ${
                        isCurrent
                          ? "bg-amber-500/20 text-amber-200 ring-amber-500/40"
                          : "bg-zinc-900/60 text-zinc-300 ring-zinc-800 hover:bg-zinc-800/80 hover:text-amber-300"
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-2 mt-2">
                <span className="text-[11px] text-zinc-500">
                  {ratingValue !== null && !isNaN(ratingValue) ? (
                    <>
                      Seçili puan:{" "}
                      <span className="text-amber-300 font-semibold tabular-nums">
                        {ratingValue} / 10
                      </span>
                    </>
                  ) : (
                    "Henüz puan verilmedi."
                  )}
                </span>
                {ratingValue !== null && !isNaN(ratingValue) && (
                  <button
                    type="button"
                    onClick={() => setUserRating("")}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-rose-300 hover:bg-rose-500/10 ring-1 ring-zinc-800 hover:ring-rose-500/30 px-2 py-1 rounded-md transition-colors cursor-pointer"
                  >
                    Puanı Temizle
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className={labelCls}>Favori</label>
              <button
                type="button"
                onClick={() => setFavorite(!favorite)}
                aria-pressed={favorite}
                className={`inline-flex items-center gap-2 h-10 px-4 rounded-lg text-[13px] font-semibold ring-1 transition-colors cursor-pointer ${
                  favorite
                    ? "bg-rose-500/15 text-rose-200 ring-rose-500/40 hover:bg-rose-500/25"
                    : "bg-zinc-900/60 text-zinc-400 ring-zinc-800 hover:text-rose-200 hover:ring-rose-500/35"
                }`}
              >
                <Heart
                  className={`w-4 h-4 ${favorite ? "fill-current" : ""}`}
                  strokeWidth={favorite ? 1.5 : 1.75}
                />
                {favorite ? "Favoride" : "Favoriye Ekle"}
              </button>
            </div>
          </SectionCard>

          {/* --- 4) Etiketler & Notlar --- */}
          <SectionCard icon={Tag} title="Etiketler & Notlar">
            <div>
              <label className={labelCls}>Kişisel Etiketler</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  placeholder="Etiket yaz, Enter ile ekle"
                  className={`flex-1 ${inputCls}`}
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="shrink-0 inline-flex items-center justify-center w-10 h-10 sm:w-9 sm:h-9 rounded-lg bg-zinc-900/60 text-zinc-300 ring-1 ring-zinc-800 hover:bg-zinc-800 transition-colors cursor-pointer"
                  aria-label="Etiket ekle"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tags.map((tag, i) => (
                    <span
                      key={`${tag}-${i}`}
                      className="inline-flex items-center gap-1 text-[11.5px] px-2 py-1 rounded-md bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/30"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(i)}
                        className="text-violet-200/70 hover:text-rose-300 cursor-pointer"
                        aria-label={`${tag} etiketini kaldır`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className={labelCls}>
                <span className="inline-flex items-center gap-1">
                  <StickyNote className="w-3 h-3" />
                  Kişisel Notlar
                </span>
              </label>
              <textarea
                value={personalNotes}
                onChange={(e) => setPersonalNotes(e.target.value)}
                placeholder="Nerede kaldığını, düşüncelerini yaz..."
                rows={3}
                className={`${inputCls} resize-y min-h-[80px]`}
              />
            </div>
          </SectionCard>

          {/* --- 5) Açıklama --- */}
          <SectionCard icon={BookOpen} title="Açıklama">
            <textarea
              value={overview}
              onChange={(e) => setOverview(e.target.value)}
              placeholder="Kısa özet..."
              rows={3}
              className={`${inputCls} resize-y min-h-[80px]`}
            />
          </SectionCard>

          {/* --- 6) Gelişmiş Metadata (türe göre koşullu) --- */}
          {(isTV || isAnime || isManga || isBook) && (
            <SectionCard icon={Sparkles} title="Gelişmiş Metadata">
              {(isTV || isAnime || isManga) && (
                <div>
                  <label className={labelCls}>
                    Türler <span className="text-zinc-600 font-normal normal-case tracking-normal">(virgülle)</span>
                  </label>
                  <input
                    type="text"
                    value={genresInput}
                    onChange={(e) => setGenresInput(e.target.value)}
                    placeholder="Action, Drama, Fantasy"
                    className={inputCls}
                  />
                </div>
              )}

              {isTV && (
                <div>
                  <label className={labelCls}>Kanal / Yayıncı</label>
                  <input
                    type="text"
                    value={networkName}
                    onChange={(e) => setNetworkName(e.target.value)}
                    placeholder="HBO, Netflix..."
                    className={inputCls}
                  />
                </div>
              )}

              {isAnime && (
                <div>
                  <label className={labelCls}>AniList Durumu</label>
                  <input
                    type="text"
                    value={anilistStatus}
                    onChange={(e) => setAnilistStatus(e.target.value)}
                    placeholder="FINISHED, RELEASING"
                    className={inputCls}
                  />
                </div>
              )}

              {isManga && (
                <div>
                  <label className={labelCls}>Ülke Kökeni</label>
                  <input
                    type="text"
                    value={countryOfOrigin}
                    onChange={(e) => setCountryOfOrigin(e.target.value)}
                    placeholder="JP, KR, CN"
                    className={inputCls}
                  />
                </div>
              )}

              {isBook && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>
                      Yazarlar <span className="text-zinc-600 font-normal normal-case tracking-normal">(virgülle)</span>
                    </label>
                    <input
                      type="text"
                      value={authorsInput}
                      onChange={(e) => setAuthorsInput(e.target.value)}
                      placeholder="Brandon Sanderson, Robert Jordan"
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>
                      Konular <span className="text-zinc-600 font-normal normal-case tracking-normal">(virgülle)</span>
                    </label>
                    <input
                      type="text"
                      value={subjectsInput}
                      onChange={(e) => setSubjectsInput(e.target.value)}
                      placeholder="fantasy, magic, epic"
                      className={inputCls}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>
                      Diller <span className="text-zinc-600 font-normal normal-case tracking-normal">(virgülle)</span>
                    </label>
                    <input
                      type="text"
                      value={languagesInput}
                      onChange={(e) => setLanguagesInput(e.target.value)}
                      placeholder="English, Türkçe"
                      className={inputCls}
                    />
                  </div>
                </div>
              )}
            </SectionCard>
          )}

          {/* --- 7) Kaynak Bilgileri (sadece edit + external) --- */}
          {isEditMode && (sourceLabel || editingItem?.externalId) && (
            <SectionCard icon={Link2} title="Kaynak Bilgileri">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]">
                {sourceLabel && (
                  <div className="inline-flex items-center gap-1.5">
                    <span className="text-zinc-500">Kaynak:</span>
                    <span className="text-zinc-200 font-medium">{sourceLabel}</span>
                  </div>
                )}
                {editingItem?.externalId && (
                  <div className="inline-flex items-center gap-1.5 font-mono">
                    <span className="text-zinc-500">id:</span>
                    <span className="text-zinc-300 break-all">{editingItem.externalId}</span>
                  </div>
                )}
                {editingItem?.siteUrl && (
                  <a
                    href={editingItem.siteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto text-[12px] font-medium text-[var(--w-primary-strong)] hover:underline cursor-pointer"
                  >
                    Kaynakta Aç ↗
                  </a>
                )}
              </div>
              <p className="text-[11px] text-zinc-500">
                Bu alanlar otomatik olarak doldu; düzenlenemez ama orijinal kayda işaret eder.
              </p>
            </SectionCard>
          )}
        </form>

        {/* === STICKY FOOTER === */}
        <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-zinc-800/70 bg-zinc-950/60 backdrop-blur-sm flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center h-10 sm:h-9 px-4 rounded-lg text-[13px] font-medium text-zinc-300 bg-zinc-900/60 hover:bg-zinc-800/70 ring-1 ring-zinc-800 transition-colors cursor-pointer"
          >
            İptal
          </button>
          <button
            type="submit"
            form="media-modal-form"
            disabled={!title.trim()}
            className="ml-auto inline-flex items-center justify-center h-10 sm:h-9 px-5 rounded-lg text-[13px] font-semibold text-zinc-50 ring-1 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--w-primary) 30%, transparent), color-mix(in srgb, var(--w-secondary) 22%, transparent))",
              boxShadow:
                "inset 0 0 0 1px color-mix(in srgb, var(--w-primary) 50%, transparent)",
            }}
          >
            {isEditMode ? "Güncelle" : "Ekle"}
          </button>
        </div>
      </div>
    </div>
  );
}
