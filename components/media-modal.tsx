// ============================================
// Medya Ekle / Düzenle Modalı (Akıllı Form)
// ============================================
// Medya türüne göre ilgili alanları gösterir.
// Kişisel metadata: puan, favori, etiketler, notlar.

"use client";

import { useState } from "react";
import { X, Plus, Heart } from "lucide-react";
import { MediaItem, MediaType, MediaStatus } from "@/lib/types";
import { getMediaTypeLabel, getStatusLabel } from "@/lib/progress";

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
 * "watching" ve "reading" aynı anda asla seçenek olarak çıkmaz.
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

// Ortak input stili
const inputCls = "w-full px-3.5 py-2.5 bg-zinc-800/50 border border-zinc-700/50 rounded-xl text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all";
const labelCls = "block text-xs font-medium text-zinc-400 mb-1.5";
const sectionCls = "text-[11px] font-semibold text-zinc-500 uppercase tracking-wider pt-3 pb-1 border-t border-zinc-800/30 mt-2";

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
  // Prop kimliğini izleyip render sırasında state'i ayarlamak React 19 önerisidir.
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

  // Virgülle ayrılmış input'u array'e çevir
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    const finalCover = coverImage.trim() || getDefaultCover(type);

    // totalProgress: film=1, diğerleri en az 1
    let tp = isMovie ? 1 : Math.max(1, Number(totalProgress) || 1);
    let cp = Math.max(0, Number(currentProgress) || 0);
    if (isMovie) { cp = status === "completed" ? 1 : cp > 0 ? 1 : 0; tp = 1; }
    if (cp > tp) tp = cp;

    // userRating doğrulama
    let rating: number | null = null;
    if (userRating !== "") {
      const n = parseInt(userRating, 10);
      if (!isNaN(n) && n >= 0 && n <= 10) rating = n;
    }

    const item: MediaItem = {
      // Düzenlemede mevcut alanları koru
      ...(editingItem || {}),
      id: editingItem?.id || generateId(),
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

    // Türe özel alanlar
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
  const progressCurrentLabel = isBook ? "Mevcut Sayfa" : isManga ? "Mevcut Chapter" : "Mevcut Bölüm";
  const progressTotalLabel = isBook ? "Toplam Sayfa" : isManga ? "Toplam Chapter" : "Toplam Bölüm";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Başlık */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800/50">
          <h2 className="text-lg font-semibold text-zinc-100">
            {isEditMode ? "Medya Düzenle" : "Yeni Medya Ekle"}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          {/* ---- TEMEL BİLGİLER ---- */}
          <p className={sectionCls}>Temel Bilgiler</p>

          <div>
            <label className={labelCls}>Başlık *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Örn: Attack on Titan" required className={inputCls} />
          </div>

          {/* Native başlık (anime/manga) */}
          {(isAnime || isManga) && (
            <div>
              <label className={labelCls}>Orijinal Başlık <span className="text-zinc-600 font-normal">(opsiyonel)</span></label>
              <input type="text" value={nativeTitle} onChange={(e) => setNativeTitle(e.target.value)} placeholder="進撃の巨人" className={inputCls} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Medya Türü</label>
              <select
                value={type}
                onChange={(e) => {
                  const nextType = e.target.value as MediaType;
                  setType(nextType);
                  // Tür değişince watching↔reading karışmasın diye uygun
                  // aktif duruma otomatik geçiş yap.
                  const isReading = nextType === "book" || nextType === "manga" || nextType === "manhwa" || nextType === "manhua";
                  if (status === "watching" && isReading) setStatus("reading");
                  else if (status === "reading" && !isReading) setStatus("watching");
                }}
                className={`${inputCls} cursor-pointer`}
              >
                {mediaTypes.map((t) => (<option key={t} value={t}>{getMediaTypeLabel(t)}</option>))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Durum</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as MediaStatus)} className={`${inputCls} cursor-pointer`}>
                {getStatusOptionsForType(type).map((s) => (<option key={s} value={s}>{getStatusLabel(s)}</option>))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Yayın Yılı <span className="text-zinc-600 font-normal">(opsiyonel)</span></label>
              <input type="number" value={releaseYear} onChange={(e) => setReleaseYear(e.target.value)} placeholder="2024" className={inputCls} />
            </div>
            {isMovie && (
              <div>
                <label className={labelCls}>Süre (dakika)</label>
                <input type="number" value={runtime} onChange={(e) => setRuntime(e.target.value)} placeholder="148" className={inputCls} />
              </div>
            )}
            {isTV && (
              <div>
                <label className={labelCls}>Toplam Sezon</label>
                <input type="number" min={0} value={numberOfSeasons} onChange={(e) => setNumberOfSeasons(e.target.value)} className={inputCls} />
              </div>
            )}
            {(isAnime || isManga) && (
              <div>
                <label className={labelCls}>Format</label>
                <input type="text" value={format} onChange={(e) => setFormat(e.target.value)} placeholder={isAnime ? "TV, OVA, Movie" : "MANGA, ONE_SHOT"} className={inputCls} />
              </div>
            )}
            {isBook && (
              <div>
                <label className={labelCls}>ISBN <span className="text-zinc-600 font-normal">(virgülle)</span></label>
                <input type="text" value={isbnInput} onChange={(e) => setIsbnInput(e.target.value)} placeholder="978-..." className={inputCls} />
              </div>
            )}
          </div>

          <div>
            <label className={labelCls}>Kapak URL <span className="text-zinc-600 font-normal">(opsiyonel)</span></label>
            <input type="text" value={coverImage} onChange={(e) => setCoverImage(e.target.value)} placeholder="https://example.com/cover.jpg" className={inputCls} />
          </div>

          {/* ---- İLERLEME ---- */}
          {!isMovie && (
            <>
              <p className={sectionCls}>İlerleme</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{progressCurrentLabel}</label>
                  <input type="number" min={0} value={currentProgress} onChange={(e) => setCurrentProgress(Number(e.target.value))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{progressTotalLabel}</label>
                  <input type="number" min={1} value={totalProgress} onChange={(e) => setTotalProgress(Number(e.target.value))} className={inputCls} />
                </div>
              </div>
              {isManga && (
                <div>
                  <label className={labelCls}>Cilt Sayısı <span className="text-zinc-600 font-normal">(opsiyonel)</span></label>
                  <input type="number" min={0} value={volumes} onChange={(e) => setVolumes(e.target.value)} className={inputCls} />
                </div>
              )}
            </>
          )}

          {/* ---- KİŞİSEL ALANLAR ---- */}
          <p className={sectionCls}>Kişisel</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Puanım</label>
              <select value={userRating} onChange={(e) => setUserRating(e.target.value)} className={`${inputCls} cursor-pointer`}>
                <option value="">Puan verilmedi</option>
                {Array.from({ length: 11 }, (_, i) => (<option key={i} value={String(i)}>{i}/10</option>))}
              </select>
            </div>
            <div className="flex items-end pb-0.5">
              <button type="button" onClick={() => setFavorite(!favorite)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer w-full justify-center ${
                  favorite
                    ? "bg-rose-500/20 text-rose-400 ring-1 ring-rose-500/40"
                    : "bg-zinc-800/50 text-zinc-500 ring-1 ring-zinc-700/30 hover:text-zinc-400"
                }`}
              >
                <Heart className={`w-4 h-4 ${favorite ? "fill-rose-400" : ""}`} />
                {favorite ? "Favori" : "Favoriye Ekle"}
              </button>
            </div>
          </div>

          {/* Etiketler */}
          <div>
            <label className={labelCls}>Kişisel Etiketler</label>
            <div className="flex gap-2">
              <input type="text" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={handleTagKeyDown} placeholder="Etiket yaz, Enter ile ekle" className={`flex-1 ${inputCls}`} />
              <button type="button" onClick={handleAddTag} className="px-3 py-2.5 rounded-xl bg-zinc-800/50 text-zinc-400 ring-1 ring-zinc-700/30 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((tag, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg bg-violet-500/10 text-violet-300 ring-1 ring-violet-500/20">
                    {tag}
                    <button type="button" onClick={() => handleRemoveTag(i)} className="hover:text-red-400 cursor-pointer"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Notlar */}
          <div>
            <label className={labelCls}>Kişisel Notlar</label>
            <textarea value={personalNotes} onChange={(e) => setPersonalNotes(e.target.value)} placeholder="Nerede kaldığını, düşüncelerini yaz..." rows={3} className={`${inputCls} resize-none`} />
          </div>

          {/* ---- GELİŞMİŞ METADATA ---- */}
          {(isTV || isAnime || isManga || isBook) && (
            <>
              <p className={sectionCls}>Gelişmiş Metadata</p>

              {/* Türler/Konular */}
              {(isTV || isAnime || isManga) && (
                <div>
                  <label className={labelCls}>Türler <span className="text-zinc-600 font-normal">(virgülle)</span></label>
                  <input type="text" value={genresInput} onChange={(e) => setGenresInput(e.target.value)} placeholder="Action, Drama, Fantasy" className={inputCls} />
                </div>
              )}



              {isAnime && (
                <div>
                  <label className={labelCls}>AniList Durumu</label>
                  <input type="text" value={anilistStatus} onChange={(e) => setAnilistStatus(e.target.value)} placeholder="FINISHED, RELEASING" className={inputCls} />
                </div>
              )}

              {isManga && (
                <div>
                  <label className={labelCls}>Ülke Kökeni</label>
                  <input type="text" value={countryOfOrigin} onChange={(e) => setCountryOfOrigin(e.target.value)} placeholder="JP, KR, CN" className={inputCls} />
                </div>
              )}

              {isBook && (
                <>
                  <div>
                    <label className={labelCls}>Yazarlar <span className="text-zinc-600 font-normal">(virgülle)</span></label>
                    <input type="text" value={authorsInput} onChange={(e) => setAuthorsInput(e.target.value)} placeholder="Brandon Sanderson, Robert Jordan" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Konular <span className="text-zinc-600 font-normal">(virgülle)</span></label>
                    <input type="text" value={subjectsInput} onChange={(e) => setSubjectsInput(e.target.value)} placeholder="fantasy, magic, epic" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Diller <span className="text-zinc-600 font-normal">(virgülle)</span></label>
                    <input type="text" value={languagesInput} onChange={(e) => setLanguagesInput(e.target.value)} placeholder="English, Türkçe" className={inputCls} />
                  </div>
                </>
              )}

              {/* Açıklama */}
              <div>
                <label className={labelCls}>Açıklama <span className="text-zinc-600 font-normal">(opsiyonel)</span></label>
                <textarea value={overview} onChange={(e) => setOverview(e.target.value)} placeholder="Kısa özet..." rows={2} className={`${inputCls} resize-none`} />
              </div>
            </>
          )}

          {/* Film için açıklama */}
          {isMovie && (
            <div>
              <label className={labelCls}>Açıklama <span className="text-zinc-600 font-normal">(opsiyonel)</span></label>
              <textarea value={overview} onChange={(e) => setOverview(e.target.value)} placeholder="Kısa özet..." rows={2} className={`${inputCls} resize-none`} />
            </div>
          )}

          {/* Kaydet / İptal */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer">
              İptal
            </button>
            <button type="submit" className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40 hover:bg-violet-500/30 transition-colors cursor-pointer">
              {isEditMode ? "Güncelle" : "Ekle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
