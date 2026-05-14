// ============================================
// Ana Sayfa - Dashboard
// ============================================
// Tüm medya kartlarını listeler, arama ve filtreleme yapar.
// "+1" ve "Tamamla" butonlarıyla ilerleme güncellenir.
// Veriler localStorage'a kaydedilir, sayfa yenilenince korunur.
// TVmaze online arama ile dizi bulunup listeye eklenebilir.
// AniList üzerinden anime, manga, manhwa, manhua aranabilir.
// Open Library üzerinden kitap aranabilir.

"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import AppSidebar from "@/components/app-sidebar";
import AppTopbar from "@/components/app-topbar";
import RightRail from "@/components/right-rail";
import PageHeader from "@/components/page-header";
import { TabType } from "@/components/app-tabs";
import ActivityLogPanel from "@/components/activity-log-panel";
// MediaFilters artık LibraryControlBar tarafından sarmalanıyor; burada
// yalnızca type re-export'lar gerekli.
// R18.1: Durum filtresi WorldHero altında bağımsız bir satır; bu yüzden
// `StatusFilterRow`'u doğrudan burada da tüketiyoruz.
import { type ThemeFilter, type EastSubFilter, StatusFilterRow } from "@/components/media-filters";
// R11: WorldHero — Doğu/Kadraj/Arşiv için genelleştirilmiş hero
// (eski EastThemeHeader R16'da silindi).
import WorldHero from "@/components/world-hero";
// R13: Dünya değişiminde tek seferlik macro overlay. Sadece worldAttr prop'una
// bakar; search/status/type/sort'a duyarlı değil. Ayarlar'da neutral olduğu
// için zaten tetiklenmez.
import WorldTransition from "@/components/world-transition";
import MediaCard from "@/components/media-card";
import SeriesGroupCard from "@/components/series-group-card";
import MediaModal from "@/components/media-modal";
import MediaDetailModal from "@/components/media-detail-modal";
import ConfirmDialog from "@/components/confirm-dialog";
import TvmazeSearch from "@/components/tvmaze-search";
import AniListSearch from "@/components/anilist-search";
import OpenLibrarySearch from "@/components/openlibrary-search";
import GlobalSearch from "@/components/global-search";
import DataManagementPanel from "@/components/data-management-panel";
import CloudSyncStatusCard from "@/components/cloud-sync-status-card";
import AuthPanel from "@/components/auth-panel";
import CloudDataStatusCard from "@/components/cloud-data-status-card";
import { useAuth } from "@/hooks/use-auth";
import {
  enqueueMediaDelete,
  enqueueMediaUpsert,
  enqueueProgressLog,
  setUserId as setSyncUserId,
} from "@/lib/sync-manager";
import QuickAddModal from "@/components/quick-add-modal";
import ManualGroupModal, {
  type ManualGroupAction,
  generateManualGroupId,
} from "@/components/manual-group-modal";
import EnhancedDashboard from "@/components/enhanced-dashboard";
import AiAdvisor from "@/components/ai-advisor";
import {
  ChevronDown,
  ChevronUp,
  PlayCircle,
  Layers,
  Library as LibraryIcon,
  LayoutDashboard,
  Compass,
  Calendar,
  TrendingUp,
  Sparkles,
  Heart,
  ListChecks,
  Star,
  NotebookPen,
  BarChart3,
  Search,
  Activity as ActivityIcon,
  Settings as SettingsIcon,
} from "lucide-react";
import LibraryControlBar, {
  LibrarySectionControls,
  type LibrarySort,
  type LibraryView,
} from "@/components/library-control-bar";
import { GlobalSearchCategory, GlobalSearchLibraryStatus, GlobalSearchResult } from "@/lib/global-search-types";
import { mockMediaList } from "@/lib/mock-media";
import {
  loadMediaList,
  saveMediaList,
  clearMediaList,
  loadProgressLogs,
  saveProgressLogs,
  loadUIPreferences,
  saveUIPreferences,
  DEFAULT_UI_PREFERENCES,
} from "@/lib/storage";
import { getIncrementAmount, getProgressLabel, getProgressUnit, getStatusLabel, isMovieLike } from "@/lib/progress";
import { MediaItem, MediaType, MediaStatus, ProgressLog, withMediaClassification } from "@/lib/types";
import {
  getTvmazeSeasonExternalId,
  getTvmazeSeasonNumber,
  getTvmazeShowExternalId,
  groupMediaItems,
  resolveAniListSeriesGroup,
  withInferredSeriesGroup,
} from "@/lib/series-group";
import { calculateDashboardStats } from "@/lib/dashboard-stats";
import { calculateUserProgression } from "@/lib/user-progression";
import { TvmazeNormalizedDetail } from "@/lib/tvmaze-types";
import { OpenLibraryNormalizedResult } from "@/lib/openlibrary-types";
import { AniListNormalizedResult } from "@/lib/anilist-types";
import { OmdbNormalizedResult } from "@/lib/omdb-types";
import type { TmdbNormalizedDetail } from "@/lib/tmdb-types";

export default function HomePage() {
  // ---- AUTH (cloud aktarım için) ----
  const { user: authUser, configured: authConfigured } = useAuth();

  // ---- STATE (Durumlar) ----

  // Medya listesi — SSR'da boş dizi, hidrasyon sonrası effect'te localStorage'dan yüklenir
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  // İlerleme logları
  const [progressLogs, setProgressLogs] = useState<ProgressLog[]>([]);
  // Aktif sekme
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");

  // İlk yüklenme tamamlandı mı? (localStorage okunana kadar bekliyoruz)
  const [isLoaded, setIsLoaded] = useState(false);
  // R18: UI tercihleri (themeFilter/eastSubFilter/typeFilter/statusFilter/
  // librarySort/libraryView) localStorage'dan hidrate edilene kadar persist
  // effect'ini bekletiyoruz. Hidrasyon hem SSR/build, hem `mediaList`
  // hidrasyonu ile aynı pattern'i izler.
  const [uiPrefsLoaded, setUiPrefsLoaded] = useState(false);
  // Arama çubuğundaki metin (R18: kasıtlı olarak persist edilmiyor)
  const [searchQuery, setSearchQuery] = useState("");
  // Seçili medya türü filtresi (R18: persist)
  const [typeFilter, setTypeFilter] = useState<MediaType | "all">(DEFAULT_UI_PREFERENCES.typeFilter);
  // Seçili durum filtresi (R18: persist)
  const [statusFilter, setStatusFilter] = useState<MediaStatus | "active" | "all">(
    DEFAULT_UI_PREFERENCES.statusFilter
  );
  // V5A.1 / R9: Üst seviye "Dünya" filtresi (Tümü / Doğu / Kadraj / Arşiv).
  // State adı `themeFilter` ve "east"/"screen"/"library" iç değerleri R9'da
  // korundu; sadece UI label'ı ve sekme adları yenilendi. (R18: persist)
  const [themeFilter, setThemeFilter] = useState<ThemeFilter>(DEFAULT_UI_PREFERENCES.themeFilter);
  // V5A.1: Doğu seçiliyken aktif alt filtre (Tümü / Anime / Manga / Novel). (R18: persist)
  const [eastSubFilter, setEastSubFilter] = useState<EastSubFilter>(
    DEFAULT_UI_PREFERENCES.eastSubFilter
  );
  // R5: Kütüphanem singleton bölümü için sıralama + görünüm tercihi.
  // Sadece üçüncü bölümü (tekil item'lar) etkiler; "Devam Ettiklerim" ve
  // "Seri Koleksiyonlarım" kendi sıralamasını korur. (R18: persist)
  const [librarySort, setLibrarySort] = useState<LibrarySort>(DEFAULT_UI_PREFERENCES.librarySort);
  const [libraryView, setLibraryView] = useState<LibraryView>(DEFAULT_UI_PREFERENCES.libraryView);
  // R18.2: Kütüphanem section collapse durumları. Sadece görünümü kontrol
  // eder; hesap pipeline'larına dokunmaz.
  const [continueSectionOpen, setContinueSectionOpen] = useState<boolean>(
    DEFAULT_UI_PREFERENCES.continueSectionOpen
  );
  const [seriesSectionOpen, setSeriesSectionOpen] = useState<boolean>(
    DEFAULT_UI_PREFERENCES.seriesSectionOpen
  );

  // R13.2: Macro transition tetik state'i. WorldTransition artık worldAttr
  // prop'unu otomatik izlemiyor — sadece kullanıcı Dünya filtresini
  // değiştirince burada token bumpluyoruz. Sekme geçişi, medya ekleme,
  // settings'e girip çıkma vb. olaylar transition tetiklemez.
  const [worldTransition, setWorldTransition] = useState<{
    token: number;
    world: "east" | "screen" | "arch" | "neutral";
  } | null>(null);

  // V5A.1/V5A.2: Theme mode değişince bağımlı filtreleri tutarlı tut.
  // - Doğu dışına çıkılırsa eastSubFilter "all"a düşer (anlamı kalmaz).
  // - typeFilter, yeni theme altında MediaFilters'da görünmeyecek bir değere
  //   sabitlenmiş olabilir (örn. theme=screen, typeFilter="anime"). Bu durumda
  //   "all"a sıfırlanır; aksi halde kullanıcı artık değiştiremediği bir filtreyle
  //   boş listeye bakar.
  const handleThemeFilterChange = (next: ThemeFilter) => {
    setThemeFilter(next);
    if (next !== "east") {
      setEastSubFilter("all");
    }
    if (next === "east") {
      // Doğu aktifken Medya Türü bloğu zaten gizli; tutarlılık için reset.
      setTypeFilter("all");
    } else if (next === "screen") {
      if (typeFilter !== "all" && typeFilter !== "movie" && typeFilter !== "tv") {
        setTypeFilter("all");
      }
    } else if (next === "library") {
      if (typeFilter !== "all" && typeFilter !== "book") {
        setTypeFilter("all");
      }
    }

    // R13.2: Macro transition tetiklemesi *yalnız burada*. ThemeFilter →
    // WorldKey eşlemesi worldAttr ile aynı; ama tetik bu fonksiyondan başka
    // hiçbir yerden bumplanmaz. Neutral'ı da gönderiyoruz (component zaten
    // skipliyor) — token monotonik artsın diye.
    const targetWorld =
      next === "east" ? "east"
      : next === "screen" ? "screen"
      : next === "library" ? "arch"
      : "neutral";
    setWorldTransition((prev) => ({
      token: (prev?.token ?? 0) + 1,
      world: targetWorld,
    }));
  };

  // Gelişmiş aramaları (eski panelleri) gösterme durumu
  const [showAdvancedSearches, setShowAdvancedSearches] = useState(false);

  // R24: Favorilerim sayfası lokal kontrolleri. Bilinçli olarak UI preferences
  // sistemine eklenmediler — sayfa kapsamı küçük, "Kütüphanem filtre sistemini
  // bozma" sınırına uyuyoruz. Sayfa geçişinde sıfırlanmaları sorun değil.
  const [favoritesSearch, setFavoritesSearch] = useState("");
  const [favoritesSort, setFavoritesSort] = useState<"recent" | "title" | "rating">("recent");
  const [watchlistSearch, setWatchlistSearch] = useState("");
  const [watchlistSort, setWatchlistSort] = useState<"recent" | "title" | "rating">("recent");
  const [progressSearch, setProgressSearch] = useState("");
  const [progressSort, setProgressSort] = useState<"lastActivity" | "progress" | "title" | "rating">("lastActivity");
  const [ratingsSearch, setRatingsSearch] = useState("");
  const [ratingsSort, setRatingsSort] = useState<"ratingDesc" | "ratingAsc" | "title" | "recent">("ratingDesc");
  const [notesSearch, setNotesSearch] = useState("");
  const [notesSort, setNotesSort] = useState<"recent" | "title" | "rating">("recent");

  // AI Danışman sekmesi dışına çıkıldığında aktif sohbeti sıfırlamak için sinyal
  // R40 — auto reset kaldırıldı; reset yalnızca AiAdvisor içindeki "Konuyu
  // kapat" butonundan tetiklenir. Prop yine 0 ile sabit gider, advisor'ın
  // modal-style guard'ı bu sabit değerde reset koluna asla girmez.
  // R40 — Keşfet sekmesi prefill state'i. Token monoton artan sayı; aynı
  // başlığa iki kez tıklayınca da prev-prop guard'ı tetiklenir.
  const [discoverPrefill, setDiscoverPrefill] = useState<{
    query: string;
    category: GlobalSearchCategory;
    token: number;
  } | null>(null);

  // Modal durumları
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MediaItem | null>(null);
  const [detailMediaId, setDetailMediaId] = useState<string | null>(null);
  // V4: Manuel grup yönetimi modalı
  const [groupEditingItemId, setGroupEditingItemId] = useState<string | null>(null);
  const [pendingQuickAdd, setPendingQuickAdd] = useState<{
    singleItem: MediaItem;
    seasonItems: MediaItem[] | null;
    lockedSeasonIds?: string[];
    preferredMode?: "single" | "seasons";
    forceSeasonSelection?: boolean;
  } | null>(null);
  const [tvmazeDetailsCache, setTvmazeDetailsCache] = useState<Record<string, TvmazeNormalizedDetail>>({});

  // Detay modalı için seçili medya öğesi (listeden her zaman güncel halini alır)
  const detailMedia = useMemo(
    () => mediaList.find((m) => m.id === detailMediaId) || null,
    [mediaList, detailMediaId]
  );

  // Onay penceresi durumları
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    confirmLabel: "",
    onConfirm: () => {},
  });

  // ---- Sync manager'a auth user'ı bildir ----
  useEffect(() => {
    setSyncUserId(authUser?.id ?? null);
  }, [authUser?.id]);

  // ---- localStorage: Verileri yükle (ilk açılışta bir kez çalışır) ----
  useEffect(() => {
    const saved = loadMediaList();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only hydration from localStorage
    setMediaList(saved && saved.length > 0 ? saved : mockMediaList);
    setProgressLogs(loadProgressLogs());
    setIsLoaded(true);
  }, []);

  // ---- localStorage: Her değişiklikte kaydet ----
  useEffect(() => {
    if (!isLoaded) return;
    saveMediaList(mediaList);
    saveProgressLogs(progressLogs);
  }, [mediaList, progressLogs, isLoaded]);

  // ---- R18: UI tercihlerini localStorage'dan hidrate et (mount-only) ----
  // Kritik: setState'leri burada doğrudan `setThemeFilter` üzerinden yapıyoruz,
  // `handleThemeFilterChange` üzerinden değil. Aksi halde mount sırasında
  // `worldTransition` token'ı bumplanır ve R13.2 macro overlay sayfa
  // açılışında oynar — istemiyoruz. `normalizeUIPreferences` zaten theme↔type
  // tutarlılığını uyguladığı için hidrasyon sonrası worldAttr direkt doğru
  // değere oturur.
  useEffect(() => {
    const prefs = loadUIPreferences();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only hydration from localStorage
    setThemeFilter(prefs.themeFilter);
    setEastSubFilter(prefs.eastSubFilter);
    setTypeFilter(prefs.typeFilter);
    setStatusFilter(prefs.statusFilter);
    setLibrarySort(prefs.librarySort);
    setLibraryView(prefs.libraryView);
    setContinueSectionOpen(prefs.continueSectionOpen);
    setSeriesSectionOpen(prefs.seriesSectionOpen);
    setUiPrefsLoaded(true);
  }, []);

  // ---- R18: UI tercihlerini her değişimde kaydet ----
  // `uiPrefsLoaded` bayrağı, hidrasyon tamamlanmadan default değerlerin
  // localStorage'a yazılıp gerçek snapshot'ı ezmesini engeller.
  useEffect(() => {
    if (!uiPrefsLoaded) return;
    saveUIPreferences({
      themeFilter,
      eastSubFilter,
      typeFilter,
      statusFilter,
      librarySort,
      libraryView,
      continueSectionOpen,
      seriesSectionOpen,
    });
  }, [
    uiPrefsLoaded,
    themeFilter,
    eastSubFilter,
    typeFilter,
    statusFilter,
    librarySort,
    libraryView,
    continueSectionOpen,
    seriesSectionOpen,
  ]);

  // ---- EYLEMLER (Actions) ----

  const handleTabChange = useCallback((tab: TabType) => {
    // R40 — AI sekmesi terkedildiğinde otomatik reset KALDIRILDI; oturum
    // kullanıcı "Konuyu kapat" diyene kadar yaşamaya devam eder.
    setActiveTab(tab);
    setDetailMediaId(null);
    setEditingItem(null);
    setIsModalOpen(false);
  }, []);

  async function handleAddMissingTvmazeParts(showIdOrItem: string | MediaItem) {
    const showId =
      typeof showIdOrItem === "string"
        ? showIdOrItem
        : getTvmazeShowExternalId(showIdOrItem);

    if (!showId) return false;

    const detail = await ensureTvmazeDetail(showId);
    return openTvmazeSeasonPicker(detail, true);
  }

  // NOT: Bu fonksiyon yalnızca arama sonucunu görsel olarak işaretlemek için
  // (Listede / Sezon Ekle) çağrılır — sonuçları KESİNLİKLE filtrelemez. Listede
  // olan item'lar GlobalSearch içinde aynen render edilir.
  async function getGlobalSearchLibraryStatus(item: GlobalSearchResult): Promise<GlobalSearchLibraryStatus> {
    let inLibrary = isInLibrary(item.source, item.externalId);

    // R21.2: TMDB↔OMDb cross-source duplicate fallback.
    // Kullanıcı eski bir filmi OMDb ile eklediyse ve şimdi aynı filmi TMDB
    // üzerinden arıyorsa (veya tam tersi) externalId'ler farklı olduğu için
    // "Listede" rozeti çıkmıyordu → kullanıcı tekrar ekleyip duplicate
    // yaratabiliyordu. Defansif olarak film tipinde title (case-insensitive,
    // boşluk normalize) + releaseYear ile bir yumuşak kontrol ekliyoruz.
    // Sadece **rozet** için kullanılır; ekleme yolu hâlâ Quick Add modal
    // gating'ine düşer ve kullanıcı bilinçli onay verir.
    if (
      !inLibrary &&
      item.type === "movie" &&
      (item.source === "tmdb" || item.source === "omdb") &&
      typeof item.releaseYear === "number"
    ) {
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
      const wanted = norm(item.title);
      inLibrary = mediaList.some(
        (m) =>
          m.type === "movie" &&
          (m.externalSource === "tmdb" || m.externalSource === "omdb") &&
          m.releaseYear === item.releaseYear &&
          norm(m.title) === wanted,
      );
    }

    if (item.source !== "tvmaze") {
      return { isInLibrary: inLibrary, hasAddableParts: false };
    }

    if (!inLibrary) {
      return { isInLibrary: false, hasAddableParts: false };
    }

    try {
      const detail = await ensureTvmazeDetail(item.externalId);
      const missingItems = getMissingTvmazeSeasonItems(detail);
      return {
        isInLibrary: true,
        hasAddableParts: missingItems.length > 0,
        actionLabel: "Sezon Ekle",
        missingCount: missingItems.length,
      };
    } catch {
      return { isInLibrary: true, hasAddableParts: false };
    }
  }

  /**
   * Yeni log ekleme yardımcı fonksiyonu
   */
  const addProgressLog = useCallback((
    mediaId: string,
    mediaTitle: string,
    mediaType: MediaType,
    action: "increment" | "complete" | "manual_adjust" | "added",
    amount: number,
    previousProgress: number,
    newProgress: number,
    detail?: string
  ) => {
    const nowIso = new Date().toISOString();
    const newLog: ProgressLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      mediaId,
      mediaTitle,
      mediaType,
      action,
      detail,
      amount,
      unit: getProgressUnit(mediaType),
      previousProgress,
      newProgress,
      createdAt: nowIso,
    };

    // Birleştirme kararını eagerly yap — StrictMode'da çift enqueue olmasın diye.
    const isMergeable = action === "increment" || action === "manual_adjust";
    let mergedLog: ProgressLog | null = null;
    let mergeIdx = -1;

    if (isMergeable) {
      const MERGE_WINDOW_MS = 60 * 60 * 1000;
      for (let i = progressLogs.length - 1; i >= 0; i--) {
        if (progressLogs[i].mediaId === mediaId) { mergeIdx = i; break; }
      }
      const last = mergeIdx >= 0 ? progressLogs[mergeIdx] : null;
      const canMerge =
        last &&
        last.action === action &&
        last.newProgress === previousProgress &&
        Date.now() - new Date(last.createdAt).getTime() < MERGE_WINDOW_MS;

      if (canMerge && last) {
        mergedLog = {
          ...last,
          amount: last.amount + amount,
          newProgress,
          createdAt: nowIso,
          detail: detail ?? last.detail,
        };
      }
    }

    if (mergedLog) {
      const finalMerged = mergedLog;
      const finalIdx = mergeIdx;
      setProgressLogs((prev) => {
        const next = prev.slice();
        // index güvenliği: prev değişmiş olabilir
        const idxInPrev = next.findIndex((l) => l.id === finalMerged.id);
        if (idxInPrev >= 0) next[idxInPrev] = finalMerged;
        else if (finalIdx >= 0 && finalIdx < next.length) next[finalIdx] = finalMerged;
        else next.push(finalMerged);
        return next;
      });
      enqueueProgressLog(finalMerged);
    } else {
      setProgressLogs((prev) => [...prev, newLog]);
      enqueueProgressLog(newLog);
    }
  }, [progressLogs]);

  const buildAddedLogDetail = useCallback((item: MediaItem) => {
    const detailParts = ["Kütüphaneye eklendi"];
    const progressLabel = getProgressLabel(item.type);

    if (item.status !== "planning") {
      detailParts.push(`Durum: ${getStatusLabel(item.status)}`);
    }

    if (item.currentProgress > 0 || item.status === "completed") {
      detailParts.push(`İlerleme: ${item.currentProgress}/${item.totalProgress} ${progressLabel}`);
    }

    return detailParts.join(" • ");
  }, []);

  /**
   * +1 butonuna basılınca ilerlemeyi artırır.
   */
  const handleIncrement = useCallback((id: string) => {
    const item = mediaList.find((m) => m.id === id);
    if (!item) return;

    // Movie-like (film + AniList anime MOVIE) için +1 mantıklı değil; sadece "Tamamla" var.
    if (isMovieLike(item)) return;
    const amount = getIncrementAmount(item.type);
    if (amount === 0) return;

    // Bilinmeyen toplam (totalProgress <= 0) durumunda clamp yapma; serbest artır.
    const hasKnownTotal = item.totalProgress > 0;
    if (hasKnownTotal && item.currentProgress >= item.totalProgress) return;

    const prevProgress = item.currentProgress;
    const newProgress = hasKnownTotal
      ? Math.min(item.currentProgress + amount, item.totalProgress)
      : item.currentProgress + amount;
    const newStatus =
      hasKnownTotal && newProgress >= item.totalProgress
        ? "completed"
        : item.status;
    const updated: MediaItem = { ...item, currentProgress: newProgress, status: newStatus };

    setMediaList((prev) => prev.map((m) => (m.id === id ? updated : m)));
    enqueueMediaUpsert(updated);

    addProgressLog(
      item.id,
      item.title,
      item.type,
      "increment",
      amount,
      prevProgress,
      newProgress
    );
  }, [addProgressLog, mediaList]);

  /**
   * "Tamamla" butonuna basılınca ilerlemeyi %100 yapar.
   */
  const handleComplete = useCallback((id: string) => {
    const item = mediaList.find((m) => m.id === id);
    if (!item) return;
    // Zaten "completed" ise hiçbir şey yapma; ama 220/220 olup status hâlâ
    // watching/reading/paused/planning ise sadece status'u güncelle.
    if (item.status === "completed") return;

    const prevProgress = item.currentProgress;
    // Bilinmeyen toplam: progress'i mevcut değerinde tut, sadece status'u completed yap.
    // Bilinen toplam: progress'i totale çek.
    const newProgress =
      item.totalProgress > 0
        ? item.totalProgress
        : Math.max(item.currentProgress, 0);
    const updated: MediaItem = { ...item, currentProgress: newProgress, status: "completed" };

    setMediaList((prev) => prev.map((m) => (m.id === id ? updated : m)));
    enqueueMediaUpsert(updated);

    // Eğer ilerleme zaten tamsa log üretme (status-only değişiklik için kayıt
    // gerekmiyor, completed bir kez logged'lanmış olabilir).
    if (prevProgress >= item.totalProgress) {
      return;
    }

    addProgressLog(
      item.id,
      item.title,
      item.type,
      "complete",
      newProgress - prevProgress,
      prevProgress,
      newProgress
    );
  }, [addProgressLog, mediaList]);

  /**
   * Yeni medya eklemek için modal'ı aç
   */
  function handleOpenAddModal() {
    setEditingItem(null);
    setIsModalOpen(true);
  }

  /**
   * Mevcut medyayı düzenlemek için modal'ı aç
   */
  function handleOpenEditModal(item: MediaItem) {
    setEditingItem(item);
    setIsModalOpen(true);
  }

  /**
   * Detay modalını aç
   */
  function handleOpenDetailModal(item: MediaItem) {
    setDetailMediaId(item.id);
  }

  /**
   * Modal'dan gelen veriyi kaydet (ekleme veya güncelleme)
   */
  function handleSaveMedia(item: MediaItem) {
    const classifiedItem = withMediaClassification(withInferredSeriesGroup(item));
    type LogPayload = {
      id: string;
      title: string;
      type: MediaType;
      action: "increment" | "complete" | "manual_adjust" | "added";
      amount: number;
      prevProgress: number;
      newProgress: number;
      detail?: string;
    };
    const exists = mediaList.find((m) => m.id === classifiedItem.id);
    let logPayload: LogPayload | null = null;
    let mergedItem: MediaItem = classifiedItem;
    if (exists) {
      mergedItem = withMediaClassification({ ...exists, ...classifiedItem });
      if (exists.currentProgress !== classifiedItem.currentProgress) {
        logPayload = {
          id: classifiedItem.id,
          title: classifiedItem.title,
          type: classifiedItem.type,
          action: "manual_adjust",
          amount: Math.abs(classifiedItem.currentProgress - exists.currentProgress),
          prevProgress: exists.currentProgress,
          newProgress: classifiedItem.currentProgress,
        };
      }
      setMediaList((prev) => prev.map((m) => (m.id === classifiedItem.id ? mergedItem : m)));
    } else {
      logPayload = {
        id: classifiedItem.id,
        title: classifiedItem.title,
        type: classifiedItem.type,
        action: "added",
        amount: classifiedItem.currentProgress,
        prevProgress: 0,
        newProgress: classifiedItem.currentProgress,
        detail: buildAddedLogDetail(classifiedItem),
      };
      setMediaList((prev) => [...prev, classifiedItem]);
    }
    enqueueMediaUpsert(mergedItem);

    if (logPayload) {
      addProgressLog(
        logPayload.id,
        logPayload.title,
        logPayload.type,
        logPayload.action,
        logPayload.amount,
        logPayload.prevProgress,
        logPayload.newProgress,
        logPayload.detail
      );
    }

    setIsModalOpen(false);
    setEditingItem(null);
  }

  /**
   * Medya silmek için onay penceresi aç
   */
  function handleDeleteRequest(id: string) {
    const item = mediaList.find((m) => m.id === id);
    if (!item) return;

    setConfirmState({
      isOpen: true,
      title: "Medyayı Sil",
      message: `"${item.title}" silinecek. Bu işlem geri alınamaz. Emin misin?`,
      confirmLabel: "Sil",
      onConfirm: () => {
        setMediaList((prev) => prev.filter((m) => m.id !== id));
        enqueueMediaDelete(id);
        setConfirmState((s) => ({ ...s, isOpen: false }));
      },
    });
  }

  /**
   * V4: Manuel grup düzenleme modalını aç (item seviyesi)
   */
  const handleOpenGroupEdit = useCallback((item: MediaItem) => {
    setGroupEditingItemId(item.id);
  }, []);

  /**
   * V4: Manuel grup yönetimi commit'i. Yan etki kuralları:
   * - Tüm patch'ler önce SAF olarak hesaplanır.
   * - setMediaList değer (functional updater değil) ile çağrılır.
   * - enqueueMediaUpsert state commit'inden sonra, render dışında çağrılır.
   * - SADECE seriesGroupId / seriesGroupTitle / seriesRelationType /
   *   seasonNumber / orderIndex alanları değişir.
   */
  const handleCommitGroupAction = useCallback(
    (action: ManualGroupAction) => {
      const SERIES_KEYS = [
        "seriesGroupId",
        "seriesGroupTitle",
        "seriesRelationType",
        "seasonNumber",
        "orderIndex",
      ] as const;

      // Yardımcı: bir item'a yalnızca series* alanlarını uygulayan kopya üretir.
      // Diğer tüm alanlara dokunulmaz (currentProgress, status, userRating, vb.).
      function applyPatch(
        target: MediaItem,
        patch: Partial<Pick<MediaItem, (typeof SERIES_KEYS)[number]>>
      ): MediaItem {
        const next: MediaItem = { ...target };
        const mutable = next as unknown as Record<string, unknown>;
        for (const k of SERIES_KEYS) {
          if (k in patch) {
            // patch[k] explicit undefined ise alanı sil; değer ise yaz.
            const v = patch[k];
            if (v === undefined) {
              delete mutable[k];
            } else {
              mutable[k] = v;
            }
          }
        }
        return next;
      }

      const touched: MediaItem[] = [];
      let nextList: MediaItem[] = mediaList;

      if (action.kind === "create" || action.kind === "join") {
        const groupId =
          action.kind === "create" ? generateManualGroupId() : action.groupId;
        const groupTitle = action.groupTitle;
        const patch: Partial<Pick<MediaItem, (typeof SERIES_KEYS)[number]>> = {
          seriesGroupId: groupId,
          seriesGroupTitle: groupTitle,
          seriesRelationType: action.relationType,
          seasonNumber: action.seasonNumber,
          orderIndex: action.orderIndex,
        };

        nextList = mediaList.map((it) => {
          if (it.id !== action.itemId) return it;
          const merged = applyPatch(it, patch);
          touched.push(merged);
          return merged;
        });
      } else if (action.kind === "leave") {
        nextList = mediaList.map((it) => {
          if (it.id !== action.itemId) return it;
          const merged = applyPatch(it, {
            seriesGroupId: undefined,
            seriesGroupTitle: undefined,
            seriesRelationType: undefined,
            seasonNumber: undefined,
            orderIndex: undefined,
          });
          touched.push(merged);
          return merged;
        });
      } else if (action.kind === "rename") {
        nextList = mediaList.map((it) => {
          if (it.seriesGroupId !== action.groupId) return it;
          if (it.seriesGroupTitle === action.newTitle) return it;
          const merged = applyPatch(it, { seriesGroupTitle: action.newTitle });
          touched.push(merged);
          return merged;
        });
      }

      // 1) Saf state commit
      setMediaList(nextList);

      // 2) Render dışı yan etki: cloud sync queue
      for (const m of touched) {
        enqueueMediaUpsert(m);
      }

      // 3) Modal'ı kapat
      setGroupEditingItemId(null);
    },
    [mediaList]
  );

  /**
   * Mock verilere sıfırlamak için onay penceresi aç
   */
  function handleResetRequest() {
    setConfirmState({
      isOpen: true,
      title: "Verileri Sıfırla",
      message:
        "Tüm değişikliklerin silinecek ve varsayılan mock veriler yüklenecek. Emin misin?",
      confirmLabel: "Sıfırla",
      onConfirm: () => {
        clearMediaList();
        setMediaList(mockMediaList);
        setConfirmState((s) => ({ ...s, isOpen: false }));
      },
    });
  }

  /**
   * Favori durumunu değiştirir (toggle).
   */
  const handleToggleFavorite = useCallback((id: string) => {
    const current = mediaList.find((m) => m.id === id);
    if (!current) return;
    const updated: MediaItem = { ...current, favorite: !current.favorite };
    setMediaList((prev) => prev.map((m) => (m.id === id ? updated : m)));
    enqueueMediaUpsert(updated);
  }, [mediaList]);

  /**
   * R18.3: Hızlı puanlama. `rating === null` → kullanıcı puanı temizler.
   * 0–10 integer aralığı validate edilir; aralık dışı değer no-op.
   * `handleToggleFavorite` ile aynı render-phase güvenli kalıbı: değer ile
   * commit + handler bağlamında enqueue.
   */
  const handleUpdateRating = useCallback((id: string, rating: number | null) => {
    if (rating !== null) {
      if (!Number.isInteger(rating) || rating < 0 || rating > 10) return;
    }
    const current = mediaList.find((m) => m.id === id);
    if (!current) return;
    const next: number | null = rating;
    if ((current.userRating ?? null) === next) return;
    const updated: MediaItem = { ...current, userRating: next };
    setMediaList((prev) => prev.map((m) => (m.id === id ? updated : m)));
    enqueueMediaUpsert(updated);
  }, [mediaList]);

  /**
   * Onay penceresi açan yardımcı fonksiyon (DataManagementPanel için)
   */
  function openConfirmDialog(title: string, message: string, onOk: () => void) {
    setConfirmState({
      isOpen: true,
      title,
      message,
      confirmLabel: "Onayla",
      onConfirm: () => {
        onOk();
        setConfirmState((s) => ({ ...s, isOpen: false }));
      },
    });
  }

  /**
   * Import sonrası medya listesini günceller.
   */
  function handleImport(items: MediaItem[], logs: ProgressLog[]) {
    setMediaList(items.map((item) => withMediaClassification(item)));
    if (logs) {
      setProgressLogs(logs);
    }
  }

  // ---- TVmaze: Online Arama Yardımcıları ----

  /**
   * Belirli bir dış kaynaktaki ID'nin zaten listede olup olmadığını kontrol eder.
   * externalSource ve externalId eşleşmesine bakılır.
   */
  const isInLibrary = useCallback(
    (externalSource: string, externalId: string) => {
      if (externalSource === "tvmaze") {
        return mediaList.some((item) => getTvmazeShowExternalId(item) === externalId);
      }

      return mediaList.some(
        (item) => item.externalSource === externalSource && item.externalId === externalId
      );
    },
    [mediaList]
  );

  const buildTvmazeLibraryItems = useCallback((detail: TvmazeNormalizedDetail): MediaItem[] => {
    const coverImage = detail.coverUrl || "/placeholders/tv.svg";
    const seasonEntries = (detail.seasonBreakdown || []).filter((entry) => entry.episodes > 0);
    const seriesGroupId = `tvmaze:${detail.externalId}`;

    if (seasonEntries.length <= 1) {
      return [
        {
          id: `tvmaze-${detail.externalId}`,
          title: detail.title,
          type: "tv",
          status: "planning",
          coverImage,
          currentProgress: 0,
          totalProgress: detail.totalProgress,
          externalSource: "tvmaze",
          externalId: detail.externalId,
          overview: detail.overview,
          releaseYear: detail.releaseYear,
          numberOfSeasons: detail.numberOfSeasons,
          numberOfEpisodes: detail.numberOfEpisodes,
          tvmazeStatus: detail.tvmazeStatus,
          lastAirDate: detail.lastAirDate,
          nextAirDate: detail.nextAirDate,
          genres: detail.genres,
          language: detail.language,
          seasonBreakdown: detail.seasonBreakdown,
          seriesGroupId,
          seriesGroupTitle: detail.title,
          seriesRelationType: "main",
          orderIndex: 1,
        },
      ];
    }

    return seasonEntries.map((seasonEntry) => ({
      id: `tvmaze-${detail.externalId}-season-${seasonEntry.season}`,
      title: `${detail.title} - Sezon ${seasonEntry.season}`,
      type: "tv",
      status: "planning",
      coverImage,
      currentProgress: 0,
      totalProgress: seasonEntry.episodes,
      externalSource: "tvmaze",
      externalId: getTvmazeSeasonExternalId(detail.externalId, seasonEntry.season),
      overview: detail.overview,
      releaseYear: detail.releaseYear,
      numberOfSeasons: detail.numberOfSeasons,
      numberOfEpisodes: seasonEntry.episodes,
      tvmazeStatus: detail.tvmazeStatus,
      lastAirDate: detail.lastAirDate,
      nextAirDate: detail.nextAirDate,
      genres: detail.genres,
      language: detail.language,
      seasonBreakdown: detail.seasonBreakdown,
      seriesGroupId,
      seriesGroupTitle: detail.title,
      seriesRelationType: "season",
      seasonNumber: seasonEntry.season,
      orderIndex: seasonEntry.season,
    }));
  }, []);

  const openTvmazeSeasonPicker = useCallback((detail: TvmazeNormalizedDetail, relatedOnly = false) => {
    const seasonItems = buildTvmazeLibraryItems(detail);
    const isMultiSeason = seasonItems.length > 1;

    const singleItem: MediaItem = {
      id: `tvmaze-${detail.externalId}`,
      title: detail.title,
      type: "tv",
      status: "planning",
      coverImage: detail.coverUrl || "/placeholders/tv.svg",
      currentProgress: 0,
      totalProgress: detail.totalProgress,
      externalSource: "tvmaze",
      externalId: detail.externalId,
      overview: detail.overview,
      releaseYear: detail.releaseYear,
      numberOfSeasons: detail.numberOfSeasons,
      numberOfEpisodes: detail.numberOfEpisodes,
      tvmazeStatus: detail.tvmazeStatus,
      lastAirDate: detail.lastAirDate,
      nextAirDate: detail.nextAirDate,
      genres: detail.genres,
      language: detail.language,
      seasonBreakdown: detail.seasonBreakdown,
      seriesGroupId: `tvmaze:${detail.externalId}`,
      seriesGroupTitle: detail.title,
      seriesRelationType: "main",
      orderIndex: 1,
    };

    if (!isMultiSeason) {
      if (relatedOnly || isInLibrary("tvmaze", detail.externalId)) {
        return false;
      }

      setPendingQuickAdd({ singleItem, seasonItems: null });
      return true;
    }

    // Mevcut kütüphaneden, bu shown'a ait sezon NUMARALARINI çıkar (güvenli season-key).
    // - externalSource === "tvmaze" + getTvmazeShowExternalId === detail.externalId
    // - seasonNumber (varsa) ya da externalId'den parse edilen seasonNumber
    const existingSeasonNumbers = new Set<number>();
    let hasMainShowEntry = false;
    for (const existing of getTvmazeItemsForShow(detail.externalId)) {
      const seasonNumber = getTvmazeSeasonNumber(existing);
      if (typeof seasonNumber === "number") {
        existingSeasonNumbers.add(seasonNumber);
      } else if (existing.seriesRelationType !== "season") {
        // "Tek Kayıt" olarak eklenmiş ana show — sezon eşlemesini bloklamaz,
        // ama duplicate handler aşağıda yine korur.
        hasMainShowEntry = true;
      }
    }

    // Modal'a season.id formatında lock listesi geçiyoruz. seasonItems[i].id = `tvmaze-{showId}-season-{N}`
    // ve seasonItems[i].seasonNumber = N. Bu eşleşmeyle locked kart UI'da checked + disabled görünür.
    const lockedSeasonIds = seasonItems
      .filter((item) =>
        typeof item.seasonNumber === "number" &&
        existingSeasonNumbers.has(item.seasonNumber)
      )
      .map((item) => item.id);

    const missingItems = seasonItems.filter(
      (item) =>
        typeof item.seasonNumber === "number" &&
        !existingSeasonNumbers.has(item.seasonNumber)
    );

    if (relatedOnly && missingItems.length === 0) {
      return false;
    }

    void hasMainShowEntry; // bilinçli; gelecekte ipucu olarak kullanılabilir

    setPendingQuickAdd({
      singleItem,
      seasonItems,
      // V2.2: relatedOnly olmasa da ekli sezonlar her zaman lock edilir;
      // tekrar override edilmeleri engellenir.
      lockedSeasonIds: lockedSeasonIds.length > 0 ? lockedSeasonIds : undefined,
      preferredMode: "seasons",
      forceSeasonSelection: relatedOnly,
    });
    return true;
  }, [buildTvmazeLibraryItems, getTvmazeItemsForShow, isInLibrary]);

  const ensureTvmazeDetail = useCallback(async (showId: string) => {
    const cached = tvmazeDetailsCache[showId];
    if (cached) return cached;

    const response = await fetch(`/api/tvmaze/details?id=${showId}`);
    const detail = await response.json().catch(() => null);
    if (!response.ok || !detail) {
      throw new Error("TVmaze detay verisi alınamadı");
    }

    setTvmazeDetailsCache((prev) => {
      if (prev[showId]) return prev;
      return { ...prev, [showId]: detail as TvmazeNormalizedDetail };
    });

    return detail as TvmazeNormalizedDetail;
  }, [tvmazeDetailsCache]);

  // R19 NOT: Bu iki yardımcıyı `useCallback` ile sarmaya çalışmak hem TDZ
  // hatası (yukarıda tüketen `openTvmazeSeasonPicker` dep listesi)
  // hem de `react-hooks/preserve-manual-memoization` (React Compiler) hatası
  // doğurdu. `function` declaration formu hoisted olduğu için TDZ riski yok;
  // dezavantajı sadece `exhaustive-deps` uyarısı — davranış doğru, render
  // sayısı pratikte fark etmiyor. Spec'in "davranış değiştirme riski varsa
  // çok küçük çöz" kuralı gereği bu iki uyarı bırakıldı.
  function getTvmazeItemsForShow(showId: string) {
    return mediaList.filter((item) => getTvmazeShowExternalId(item) === showId);
  }

  function getMissingTvmazeSeasonItems(detail: TvmazeNormalizedDetail) {
    const allSeasonItems = buildTvmazeLibraryItems(detail);
    if (allSeasonItems.length <= 1) {
      return [];
    }

    const existingExternalIds = new Set(
      getTvmazeItemsForShow(detail.externalId)
        .map((item) => item.externalId)
        .filter((value): value is string => typeof value === "string")
    );

    return allSeasonItems.filter((item) => !existingExternalIds.has(item.externalId ?? ""));
  }

  /**
   * TVmaze detay sonucunu kullanıcının medya listesine ekler.
   * TvmazeNormalizedDetail → MediaItem dönüşümü burada yapılır.
   */
  const handleAddFromTvmaze = useCallback(
    (detail: TvmazeNormalizedDetail, options?: { relatedOnly?: boolean }) => {
      // Zaten eklenmişse tekrar ekleme
      if (options?.relatedOnly) {
        openTvmazeSeasonPicker(detail, true);
        return;
      }

      if (isInLibrary("tvmaze", detail.externalId)) return;
      openTvmazeSeasonPicker(detail, false);
      return;

      const coverImage =
        detail.coverUrl || "/placeholders/tv.svg";

      const newItem: MediaItem = {
        id: `tvmaze-${detail.externalId}`,
        title: detail.title,
        type: "tv",
        status: "planning",
        coverImage,
        currentProgress: 0,
        totalProgress: detail.totalProgress,

        // Dış kaynak bilgileri
        externalSource: "tvmaze",
        externalId: detail.externalId,
        overview: detail.overview,
        releaseYear: detail.releaseYear,
        numberOfSeasons: detail.numberOfSeasons,
        numberOfEpisodes: detail.numberOfEpisodes,
        tvmazeStatus: detail.tvmazeStatus,
        lastAirDate: detail.lastAirDate,
        nextAirDate: detail.nextAirDate,
        genres: detail.genres,
        language: detail.language,
        seasonBreakdown: detail.seasonBreakdown,
      };

      const isMultiSeason = (detail.seasonBreakdown?.length ?? 0) > 1;
      setPendingQuickAdd({
        singleItem: newItem,
        seasonItems: isMultiSeason ? buildTvmazeLibraryItems(detail) : null,
      });
    },
    [buildTvmazeLibraryItems, isInLibrary, openTvmazeSeasonPicker]
  );

  /**
   * Open Library sonucunu kullanıcının medya listesine ekler.
   * OpenLibraryNormalizedResult → MediaItem dönüşümü burada yapılır.
   */
  const handleAddFromOpenLibrary = useCallback(
    (result: OpenLibraryNormalizedResult) => {
      // Zaten eklenmişse tekrar ekleme
      if (isInLibrary("openlibrary", result.externalId)) return;

      const coverImage =
        result.coverUrl || "/placeholders/book.svg";

      const newItem: MediaItem = {
        id: `ol-${result.externalId}`,
        title: result.title,
        type: "book",
        status: "planning",
        coverImage,
        currentProgress: 0,
        totalProgress: result.totalProgress,

        // Dış kaynak bilgileri
        externalSource: "openlibrary",
        externalId: result.externalId,
        releaseYear: result.releaseYear,
        authors: result.authors,
        pageCount: result.pageCount,
        editionCount: result.editionCount,
        languages: result.languages,
        subjects: result.subjects,
        isbn: result.isbn,
      };

      setPendingQuickAdd({ singleItem: newItem, seasonItems: null });
    },
    [isInLibrary]
  );

  /**
   * AniList sonucunu kullanıcının medya listesine ekler.
   * AniListNormalizedResult → MediaItem dönüşümü burada yapılır.
   */
  const handleAddFromAniList = useCallback(
    (result: AniListNormalizedResult) => {
      // Zaten eklenmişse tekrar ekleme
      if (isInLibrary("anilist", result.externalId)) return;

      const coverImage =
        result.coverUrl || `/placeholders/${result.type}.svg`;

      const newItem: MediaItem = {
        id: `anilist-${result.externalId}`,
        title: result.title,
        type: result.type,
        status: "planning",
        coverImage,
        currentProgress: 0,
        totalProgress: result.totalProgress,

        // Dış kaynak bilgileri
        externalSource: "anilist",
        externalId: result.externalId,
        overview: result.overview,
        releaseYear: result.releaseYear,
        nativeTitle: result.nativeTitle,
        episodes: result.episodes,
        chapters: result.chapters,
        volumes: result.volumes,
        genres: result.genres,
        countryOfOrigin: result.countryOfOrigin,
        anilistStatus: result.anilistStatus,
        format: result.format,
        averageScore: result.averageScore,
        popularity: result.popularity,
        siteUrl: result.siteUrl,
        nextAiringEpisode: result.nextAiringEpisode,
        // V3: persisted relations — sadece details endpoint'inden gelir
        anilistRelations: result.relations,
      };

      // V3: Güvenilir relation eşleşmesi varsa seriesGroup üret + mevcut item'lara
      // SADECE seri metadata patch'i uygula (progress/status/rating asla değişmez).
      const resolution = resolveAniListSeriesGroup(newItem, mediaList);

      if (resolution.newItemSeriesPatch.seriesGroupId) {
        const patch = resolution.newItemSeriesPatch;
        if (patch.seriesGroupId) newItem.seriesGroupId = patch.seriesGroupId;
        if (patch.seriesGroupTitle) newItem.seriesGroupTitle = patch.seriesGroupTitle;
        if (patch.seriesRelationType) newItem.seriesRelationType = patch.seriesRelationType;
        if (typeof patch.orderIndex === "number") newItem.orderIndex = patch.orderIndex;
      }

      if (resolution.existingPatches.length > 0) {
        const patchMap = new Map(
          resolution.existingPatches.map((p) => [p.itemId, p.fields])
        );

        // Önce yeni listeyi ve patch'lenen item'ları SAF olarak (yan etki yok) hesapla.
        // setMediaList'in functional updater'ı render fazında da çağrılabilir; içine
        // enqueueMediaUpsert gibi dış-store update'i koymak React'in render-phase
        // update kuralını ihlal eder ("Cannot update a component while rendering...").
        const patchedItems: MediaItem[] = [];
        const nextList = mediaList.map((item) => {
          const fields = patchMap.get(item.id);
          if (!fields) return item;
          // Defansif birleştirme: SADECE undefined olan series alanlarını doldur.
          // Hiçbir koşulda progress/status/userRating/favorite/tags/personalNotes vb.
          // alanlara dokunmaz.
          const merged: MediaItem = { ...item };
          if (fields.seriesGroupId && !merged.seriesGroupId) {
            merged.seriesGroupId = fields.seriesGroupId;
          }
          if (fields.seriesGroupTitle && !merged.seriesGroupTitle) {
            merged.seriesGroupTitle = fields.seriesGroupTitle;
          }
          if (fields.seriesRelationType && !merged.seriesRelationType) {
            merged.seriesRelationType = fields.seriesRelationType;
          }
          if (
            typeof fields.orderIndex === "number" &&
            typeof merged.orderIndex !== "number"
          ) {
            merged.orderIndex = fields.orderIndex;
          }
          patchedItems.push(merged);
          return merged;
        });

        // Önce state'i güncelle (saf değer geç, updater fn kullanma).
        setMediaList(nextList);

        // Sonra dış store yan etkilerini event handler bağlamında, render dışında çalıştır.
        for (const merged of patchedItems) {
          enqueueMediaUpsert(merged);
        }
      }

      setPendingQuickAdd({ singleItem: newItem, seasonItems: null });
    },
    [isInLibrary, mediaList]
  );

  const handleAddFromOmdb = useCallback(
    (result: OmdbNormalizedResult) => {
      if (isInLibrary("omdb", result.externalId)) return;

      const newItem: MediaItem = {
        id: `omdb-${result.externalId}`,
        title: result.title,
        type: "movie",
        status: "planning",
        coverImage: result.coverUrl || "/placeholders/movie.svg",
        currentProgress: 0,
        totalProgress: 1,
        externalSource: "omdb",
        externalId: result.externalId,
        overview: result.overview,
        releaseYear: result.releaseYear,
        runtime: result.runtime,
        genres: result.genres,
        averageScore: result.imdbRating,
        siteUrl: result.imdbUrl,
      };

      setPendingQuickAdd({ singleItem: newItem, seasonItems: null });
    },
    [isInLibrary]
  );

  // R21.2: TMDB filmden MediaItem üretip Quick Add modalına gönderir.
  // OMDb akışıyla simetrik; tek fark `id` prefix'i ve `externalSource`.
  // imdbRating yerine TMDB vote_average (0-100'e ölçeklenmiş) `averageScore`'a
  // yerleşir; `siteUrl` TMDB detail route'unun ürettiği IMDb/TMDB linki.
  const handleAddFromTmdb = useCallback(
    (result: TmdbNormalizedDetail) => {
      if (isInLibrary("tmdb", result.externalId)) return;

      const newItem: MediaItem = {
        id: `tmdb-${result.externalId}`,
        title: result.title,
        type: "movie",
        status: "planning",
        coverImage: result.coverUrl || "/placeholders/movie.svg",
        currentProgress: 0,
        totalProgress: 1,
        externalSource: "tmdb",
        externalId: result.externalId,
        overview: result.overview,
        releaseYear: result.releaseYear,
        runtime: result.runtime,
        genres: result.genres,
        averageScore: result.averageScore,
        siteUrl: result.siteUrl,
      };

      setPendingQuickAdd({ singleItem: newItem, seasonItems: null });
    },
    [isInLibrary]
  );

  /**
   * Global Search'ten dönen sonucu doğru formata çevirip ekler.
   */
  const handleAddFromGlobalSearch = useCallback(
    async (item: GlobalSearchResult, options?: { relatedOnly?: boolean }) => {
      try {
        if (item.source === "tvmaze") {
          // TVmaze araması sadece yüzeysel veri döner, bölüm sayısı için detaya inmemiz gerekir
          const res = await fetch(`/api/tvmaze/details?id=${item.externalId}`);
          if (!res.ok) throw new Error("TVmaze detay verisi alınamadı");
          const detail = await res.json();
          handleAddFromTvmaze(detail, options);
        } else if (item.source === "anilist") {
          // V3: relations alanı yalnızca details endpoint'inden geldiği için
          // global search'te de details çağrısı yapıyoruz. Hata olursa search
          // raw'ına geri düş — gruplama yapılamaz ama ekleme çalışır.
          let detailResult: AniListNormalizedResult | null = null;
          try {
            const res = await fetch(`/api/anilist/details?id=${item.externalId}`);
            if (res.ok) {
              const data = await res.json();
              if (data?.result) detailResult = data.result as AniListNormalizedResult;
            }
          } catch {
            // sessizce raw'a düş
          }
          handleAddFromAniList(detailResult ?? (item.raw as AniListNormalizedResult));
        } else if (item.source === "openlibrary") {
          // Open Library arama sonucu yeterli detaya sahip
          handleAddFromOpenLibrary(item.raw as OpenLibraryNormalizedResult);
        } else if (item.source === "omdb") {
          const res = await fetch(`/api/omdb/details?id=${item.externalId}`);
          const detail = await res.json().catch(() => null);
          if (!res.ok || !detail) throw new Error(detail?.error || "OMDb detay verisi alınamadı");
          handleAddFromOmdb(detail as OmdbNormalizedResult);
        } else if (item.source === "tmdb") {
          // R21.2: TMDB sonucu için detail endpoint'ten runtime/genres/IMDb
          // metadata çek; başarısız olursa search raw'ına geri düş (eklenir,
          // ama runtime/genres olmadan). Bu davranış AniList akışıyla simetrik.
          let detailResult: TmdbNormalizedDetail | null = null;
          try {
            const res = await fetch(`/api/tmdb/details?id=${item.externalId}`);
            if (res.ok) {
              const data = await res.json();
              if (data?.result) detailResult = data.result as TmdbNormalizedDetail;
            }
          } catch {
            // sessizce raw'a düş
          }
          if (detailResult) {
            handleAddFromTmdb(detailResult);
          } else if (item.raw) {
            // Detail çekilemediyse search raw'ından minimal TmdbNormalizedDetail
            // türet — runtime/genres yok; mevcut alanlar yeterli.
            const raw = item.raw as {
              externalId: string;
              title: string;
              overview?: string;
              releaseYear?: number;
              coverUrl?: string;
              originalTitle?: string;
            };
            handleAddFromTmdb({
              externalSource: "tmdb",
              externalId: raw.externalId,
              type: "movie",
              title: raw.title,
              originalTitle: raw.originalTitle,
              overview: raw.overview,
              releaseYear: raw.releaseYear,
              coverUrl: raw.coverUrl,
              totalProgress: 1,
              siteUrl: `https://www.themoviedb.org/movie/${raw.externalId}`,
            });
          } else {
            throw new Error("TMDB detay verisi alınamadı");
          }
        }
      } catch (err) {
        console.error("Global search ekleme hatası:", err);
        alert("Ekleme sırasında bir hata oluştu. Lütfen tekrar deneyin.");
      }
    },
    [handleAddFromTvmaze, handleAddFromAniList, handleAddFromOpenLibrary, handleAddFromOmdb, handleAddFromTmdb]
  );

  // ---- FİLTRELEME ----
  useEffect(() => {
    const showIds = Array.from(
      new Set(
        mediaList
          .map((item) => getTvmazeShowExternalId(item))
          .filter((value): value is string => typeof value === "string")
      )
    );

    showIds.forEach((showId) => {
      if (tvmazeDetailsCache[showId]) return;
      void ensureTvmazeDetail(showId).catch(() => {});
    });
  }, [ensureTvmazeDetail, mediaList, tvmazeDetailsCache]);

  const getLibraryRelatedAction = useCallback((item: MediaItem) => {
    const showId = getTvmazeShowExternalId(item);
    if (!showId) {
      return { canAdd: false, label: "Parça Ekle" };
    }

    const detail = tvmazeDetailsCache[showId];
    if (!detail) {
      return { canAdd: false, label: "Sezon Ekle" };
    }

    const missingItems = getMissingTvmazeSeasonItems(detail);
    return {
      canAdd: missingItems.length > 0,
      label: "Sezon Ekle",
    };
  }, [getMissingTvmazeSeasonItems, tvmazeDetailsCache]);

  const filteredMedia = useMemo(() => {
    return mediaList.filter((item) => {
      const matchesSearch = item.title
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

      const matchesType = typeFilter === "all" || item.type === typeFilter;

      let matchesStatus = true;
      if (statusFilter === "all") {
        matchesStatus = true;
      } else if (statusFilter === "active") {
        matchesStatus = item.status === "watching" || item.status === "reading";
      } else {
        matchesStatus = item.status === statusFilter;
      }

      // V5A.1 / R9: "Dünya" filtresi + Doğu alt filtresi.
      // Eski item'larda theme/mediaType eksik olabilir; classification akışını
      // bozmamak için withMediaClassification ile fallback değerleri okuyoruz.
      // R9 eşleşmeleri (state değerleri aynı, label'lar yeni):
      //   "east"    = Doğu   → anime/manga/novel ailesinin tamamı
      //                       (anime_movie/ova/ona/special, light/web/visual novel dahil)
      //   "screen"  = Kadraj → tv + movie (ekran medyaları)
      //   "library" = Arşiv  → book (klasik kitap/okuma)
      // Overlap yok: anime film Doğu'da kalır, novel'lar Arşiv'e geçmez, kitap Doğu'ya sızmaz.
      let matchesTheme = true;
      if (themeFilter !== "all") {
        const cls = withMediaClassification(item);
        if (themeFilter === "east") {
          // Doğu kapsamı: anime + manga + novel mediaType'ları.
          // (serialized_novel/light_novel/visual_novel/web_novel hepsi mediaType="novel".)
          const isEast =
            cls.mediaType === "anime" ||
            cls.mediaType === "manga" ||
            cls.mediaType === "novel";
          if (!isEast) {
            matchesTheme = false;
          } else if (eastSubFilter !== "all") {
            matchesTheme = cls.mediaType === eastSubFilter;
          }
        } else if (themeFilter === "screen") {
          // Kadraj: ekran medyaları. tv/movie mediaType'lı item'lar buraya düşer.
          matchesTheme = cls.mediaType === "tv" || cls.mediaType === "movie";
        } else if (themeFilter === "library") {
          // Arşiv: sadece klasik kitap. Novel'lar Doğu altına düştüğü için burada yok.
          matchesTheme = cls.mediaType === "book";
        }
      }

      return matchesSearch && matchesType && matchesStatus && matchesTheme;
    });
  }, [mediaList, searchQuery, typeFilter, statusFilter, themeFilter, eastSubFilter]);

  // ---- İSTATİSTİKLER ----
  const dashboardStats = useMemo(() => {
    return calculateDashboardStats(mediaList, progressLogs);
  }, [mediaList, progressLogs]);

  const userProgression = useMemo(() => {
    return calculateUserProgression(mediaList, progressLogs);
  }, [mediaList, progressLogs]);

  const profileName = useMemo(() => {
    const email = authUser?.email?.trim();
    if (!email) return "Yerel Profil";
    const localPart = email.split("@")[0]?.trim();
    return localPart || email;
  }, [authUser?.email]);

  type PersonalPageIcon = typeof Heart;

  const PersonalEmptyState = ({
    icon: Icon,
    title,
    description,
    tone = "text-amber-400/80",
  }: {
    icon: PersonalPageIcon;
    title: string;
    description: string;
    tone?: string;
  }) => (
    <div className="flex flex-col items-center justify-center py-20 sm:py-24 bg-zinc-900/30 rounded-2xl border border-zinc-800/60 min-w-0">
      <div className="w-16 h-16 rounded-2xl bg-zinc-900 ring-1 ring-zinc-800/80 grid place-items-center mb-4 shadow-sm shadow-black/30">
        <Icon className={`w-7 h-7 ${tone}`} />
      </div>
      <p className="text-zinc-200 text-sm font-medium text-center">{title}</p>
      <p className="text-zinc-500 text-xs mt-1.5 max-w-xs text-center leading-relaxed">
        {description}
      </p>
    </div>
  );

  const PersonalControls = ({
    searchValue,
    onSearchChange,
    searchPlaceholder,
    sortValue,
    onSortChange,
    sortOptions,
    countLabel,
  }: {
    searchValue: string;
    onSearchChange: (value: string) => void;
    searchPlaceholder: string;
    sortValue: string;
    onSortChange: (value: string) => void;
    sortOptions: { value: string; label: string }[];
    countLabel: string;
  }) => (
    <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center min-w-0">
      <div className="relative flex-1 min-w-0">
        <Search
          aria-hidden
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none"
        />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full h-10 pl-9 pr-3 rounded-xl bg-zinc-900/40 border border-zinc-800/70 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/40"
        />
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <label className="text-[11px] uppercase tracking-[0.14em] text-zinc-500 font-semibold shrink-0">
          Sırala
        </label>
        <select
          value={sortValue}
          onChange={(e) => onSortChange(e.target.value)}
          className="h-10 min-w-0 max-w-full px-3 rounded-xl bg-zinc-900/40 border border-zinc-800/70 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500/40 cursor-pointer"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="text-[12px] text-zinc-500 sm:ml-2 shrink-0">{countLabel}</div>
    </div>
  );

  const PersonalMetricCard = ({
    label,
    value,
    hint,
    accent = false,
  }: {
    label: string;
    value: string | number;
    hint?: string;
    accent?: boolean;
  }) => (
    <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/35 p-4 min-w-0">
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500 font-semibold truncate">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums truncate ${accent ? "text-amber-200" : "text-zinc-100"}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-zinc-500 truncate">{hint}</p>}
    </div>
  );

  const DistributionBar = ({
    label,
    count,
    max,
    tone = "amber",
  }: {
    label: string;
    count: number;
    max: number;
    tone?: "amber" | "violet" | "emerald" | "rose" | "sky";
  }) => {
    const toneClass =
      tone === "violet"
        ? "bg-violet-400"
        : tone === "emerald"
          ? "bg-emerald-400"
          : tone === "rose"
            ? "bg-rose-400"
            : tone === "sky"
              ? "bg-sky-400"
              : "bg-amber-400";
    const width = count > 0 && max > 0 ? Math.max(4, Math.round((count / max) * 100)) : 0;
    return (
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3 mb-1">
          <span className="text-[12px] text-zinc-300 truncate">{label}</span>
          <span className="text-[12px] font-mono tabular-nums text-zinc-500 shrink-0">
            {count}
          </span>
        </div>
        <div className="h-2 rounded-full bg-zinc-800/70 overflow-hidden">
          <div className={`h-full rounded-full ${toneClass}`} style={{ width: `${width}%` }} />
        </div>
      </div>
    );
  };

  // ---- RENDER ----

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Yükleniyor...</p>
      </div>
    );
  }

  // R10: Üst seviye "Dünya" scope. themeFilter → data-world attribute mapping:
  //   all → neutral · east → east · screen → screen · library → arch
  // Settings sekmesinde dünya efektlerini kasıtlı olarak nötrlüyoruz; ayar
  // ekranı dünya bağlamından bağımsız (R8'deki RightRail gizleme kararıyla
  // tutarlı). Bu tur sadece CSS variable plumbing — tüketici bileşen yok.
  const worldAttr: "east" | "screen" | "arch" | "neutral" =
    activeTab === "settings"
      ? "neutral"
      : themeFilter === "east"
        ? "east"
        : themeFilter === "screen"
          ? "screen"
        : themeFilter === "library"
          ? "arch"
          : "neutral";
  const shouldShowRightRail = !["dashboard", "ai", "settings"].includes(activeTab);

  return (
    // R1 App Shell: sol sidebar (lg+) + main column + opsiyonel sağ rail (xl+).
    // Mobile/tablet'te sidebar gizli; AppTopbar fallback AppTabs gösterir.
    // R10: data-world scope (yukarıdaki worldAttr). globals.css altındaki
    // [data-world="..."] selector'ları --w-* tokenlarını set eder.
    // R17 + R18.5.1: Horizontal taşma güvencesi `overflow-x-clip` ile sağlanır;
    // `overflow-x-hidden` bir **scroll container** oluşturduğu için AppSidebar
    // ve RightRail'ın `sticky top-0` davranışını bozuyordu (sticky ancestor
    // viewport yerine bu container'a anchor oluyordu). `clip` scroll
    // container oluşturmadan taşan içeriği kırpar — sticky çalışmaya devam
    // eder, dar ekran taşması da yutulur.
    <div data-world={worldAttr} className="min-h-screen bg-zinc-950 text-zinc-100 flex overflow-x-clip">
      {/* R13.2: Macro transition overlay — data-world scope'unun içinde
          duruyor ki --w-* tokenları aktif dünyanın renklerine resolve olsun.
          Artık worldAttr otomatik izlenmiyor; sadece handleThemeFilterChange
          içinde bumplanan worldTransition token'ına tepki veriyor. */}
      <WorldTransition trigger={worldTransition} />
      <AppSidebar
        activeTab={activeTab}
        onChange={handleTabChange}
        onOpenSettings={() => handleTabChange("settings")}
        profileName={profileName}
        progression={userProgression}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <AppTopbar activeTab={activeTab} onChangeTab={handleTabChange} />

        {/* Ana içerik alanı.
            R6: Shell zaten sidebar+rail ile column genişliğini kontrol ettiği
            için max-w-7xl + mx-auto kalktı; içerik sütununu boğmuyor.
            xl'de horizontal padding biraz daraltıldı (rail ile nefes alsın). */}
        <main className={`relative w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-8 flex-1 min-w-0 ${shouldShowRightRail ? "xl:px-6" : "xl:px-8 2xl:px-10"}`}>
        
        {/* DASHBOARD SEKMESI */}
        {activeTab === "dashboard" && (
          <div>
            <PageHeader
              icon={LayoutDashboard}
              title="Dashboard"
              subtitle="Genel istatistikler ve son aktiviteler"
            />
            <EnhancedDashboard
              stats={dashboardStats}
              mediaList={mediaList}
              progressLogs={progressLogs}
              onSelectMedia={handleOpenDetailModal}
              onIncrement={handleIncrement}
              onComplete={handleComplete}
              onEdit={handleOpenEditModal}
              onToggleFavorite={handleToggleFavorite}
              onDeleteMedia={handleDeleteRequest}
              onUpdateRating={handleUpdateRating}
            />
          </div>
        )}

        {/* KÜTÜPHANEM SEKMESI */}
        {activeTab === "library" && (
          <div className="space-y-6">
            {/* R5: Birleşik dashboard control bar
                — search, sort, view, "Medya Ekle" + altta MediaFilters reuse */}
            {/* R5.1: Sort + view kontrolleri buradan çıkarıldı; aşağıda
                Kütüphanem section header'ının sağına taşındı. */}
            {/* R18.1: LibraryControlBar artık sadece arama + Medya Ekle +
                Dünya switcher taşır. Tür bloğu silindi, Durum bloğu aşağıya
                bağımsız satıra ayrıldı. */}
            <LibraryControlBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              themeFilter={themeFilter}
              onThemeChange={handleThemeFilterChange}
              onAddMedia={handleOpenAddModal}
              resultCount={filteredMedia.length}
            />

            {/* R13.2: Kadraj/Arşiv pill'leri artık mevcut typeFilter üzerinden
                interaktif. Doğu pill'leri eastSubFilter ile birebir korunur.
                Yeni filtre state'i eklenmedi; sahte/dummy pill yok. */}
            <WorldHero
              themeFilter={themeFilter}
              eastSub={eastSubFilter}
              onEastSubChange={setEastSubFilter}
              typeFilter={typeFilter}
              onTypeChange={setTypeFilter}
            />

            {/* R18.1: Durum filtresi — WorldHero'nun altında bağımsız, sakin
                bir alt-satır. Tür ile karışmasın diye Dünya switcher'dan ve
                WorldHero'dan ayrıldı. */}
            <StatusFilterRow
              activeStatus={statusFilter}
              onStatusChange={setStatusFilter}
            />

            {filteredMedia.length > 0 ? (
              (() => {
                // R2: Kütüphanem dashboard-style section layout.
                // groupMediaItems sonucu tek kez hesaplanıyor; "Seri Koleksiyonlarım"
                // ve "Kütüphanem (tekil)" bu ayrımdan türeyor. "Devam Ettiklerim"
                // ise filteredMedia üzerinden bağımsız bir slice — bilinçli olarak
                // bir item'ın hem üst Devam slice'ında hem de altta seri/tekil
                // listesinde görünmesine izin veriyoruz (spec: "üstte öne çıkar,
                // genel listede de kalabilir"). SeriesGroupCard ve MediaCard
                // davranışları aynen korunuyor.

                const groupedAll = groupMediaItems(filteredMedia);
                const seriesGroupCards = groupedAll.filter(
                  (g) => g.isGroup && g.items.length >= 2,
                );
                const singletonItemsRaw = groupedAll
                  .filter((g) => !(g.isGroup && g.items.length >= 2))
                  .map((g) => g.items[0]);

                // R5: Kütüphanem (tekil) bölümü için sıralama. Veri mutate
                // edilmez — slice'lanmış kopya üzerinden sort. Devam Ettiklerim
                // ve Seri Koleksiyonlarım kendi sıralamasını korur.
                // mediaList içindeki orijinal index'i "ekleme sırası" proxy'si
                // olarak kullanıyoruz; "recent" tersine çevirir → en son eklenen
                // önce. lastLogAt aşağıda hesaplanıyor, burada referans veriyoruz.

                // "Devam Ettiklerim" kuralı:
                //   - status "watching" veya "reading"; veya
                //   - currentProgress > 0 AND status not in {completed, dropped}.
                // Sıralama: en son progress log'una göre azalan; log yoksa kayıt
                // sırasını koruyalım diye stable Array.prototype.sort kullanılıyor.
                const lastLogAt = new Map<string, number>();
                for (const log of progressLogs) {
                  const t = new Date(log.createdAt).getTime();
                  const prev = lastLogAt.get(log.mediaId) ?? 0;
                  if (t > prev) lastLogAt.set(log.mediaId, t);
                }
                const continueItems = filteredMedia
                  .filter((it) => {
                    if (it.status === "watching" || it.status === "reading") return true;
                    if (
                      (it.currentProgress ?? 0) > 0 &&
                      it.status !== "completed" &&
                      it.status !== "dropped"
                    ) {
                      return true;
                    }
                    return false;
                  })
                  .slice()
                  .sort((a, b) => (lastLogAt.get(b.id) ?? 0) - (lastLogAt.get(a.id) ?? 0))
                  .slice(0, 6);

                // R5: Singleton bölümünün sıralaması. Veri mutate edilmez.
                const indexOfInList = new Map<string, number>();
                mediaList.forEach((m, i) => indexOfInList.set(m.id, i));
                const progressRatio = (it: MediaItem) =>
                  it.totalProgress > 0 ? it.currentProgress / it.totalProgress : -1;
                const singletonItems = singletonItemsRaw.slice().sort((a, b) => {
                  switch (librarySort) {
                    case "title":
                      return a.title.localeCompare(b.title, "tr");
                    case "lastActivity":
                      return (lastLogAt.get(b.id) ?? 0) - (lastLogAt.get(a.id) ?? 0);
                    case "progress":
                      return progressRatio(b) - progressRatio(a);
                    case "rating": {
                      // userRating null → en sona
                      const ra = a.userRating ?? -1;
                      const rb = b.userRating ?? -1;
                      return rb - ra;
                    }
                    case "recent":
                    default: {
                      // mediaList index "ekleme sırası" proxy'si; sona eklenen
                      // genellikle yenidir → reverse sort.
                      const ia = indexOfInList.get(a.id) ?? 0;
                      const ib = indexOfInList.get(b.id) ?? 0;
                      return ib - ia;
                    }
                  }
                });

                // R5: View mode sadece bu bölümün grid sınıfını etkiler.
                // "list" → tek sütun (yine MediaCard); "grid" → mevcut 3-col responsive.
                const singletonGridClass =
                  libraryView === "list"
                    ? "grid grid-cols-1 gap-3 items-start"
                    : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start";

                const SectionHead = ({
                  icon: Icon,
                  title,
                  count,
                  hint,
                  actions,
                  collapsible,
                  isOpen,
                  onToggle,
                }: {
                  icon: typeof PlayCircle;
                  title: string;
                  count: number;
                  hint?: string;
                  // R5.1: Section başlığının sağ tarafına opsiyonel aksiyon slotu
                  // (Kütüphanem için sort + view toggle).
                  actions?: React.ReactNode;
                  // R18.2: Collapse/expand desteği. `collapsible` true ise
                  // başlık satırı bütünüyle butona dönüşür; chevron sağa
                  // yapışır. Kütüphanem (tekil) bölümünde kullanılmaz.
                  collapsible?: boolean;
                  isOpen?: boolean;
                  onToggle?: () => void;
                }) => {
                  const headerInner = (
                    <>
                      <div className="flex items-center gap-2 min-w-0">
                        {collapsible && (
                          // Chevron başlığın **solunda** dursun ki "buton hissi"
                          // immediate; ikon ondan sonra gelsin. Açık/kapalı için
                          // rotasyon: motion-safe altında smooth, reduce-motion
                          // varsa anlık geçer.
                          <ChevronDown
                            className={`w-4 h-4 text-zinc-500 shrink-0 motion-safe:transition-transform motion-safe:duration-200 ${
                              isOpen ? "rotate-0" : "-rotate-90"
                            }`}
                            aria-hidden="true"
                          />
                        )}
                        <Icon className="w-4 h-4 text-amber-400/80 shrink-0" />
                        <h2 className="text-[15px] font-semibold text-zinc-100 tracking-tight truncate">
                          {title}
                        </h2>
                        <span className="text-[11px] font-mono tabular-nums text-zinc-500 px-1.5 py-0.5 rounded-md bg-zinc-900/60 border border-zinc-800/60 shrink-0">
                          {count}
                        </span>
                      </div>
                      {/* R17: dar ekranda sort+view kontrolleri başlığın altına
                          düşebilsin diye flex-wrap. Geniş ekranda sağa hizalı
                          davranış değişmez. */}
                      <div className="flex items-center gap-3 flex-wrap">
                        {hint && <span className="text-[11px] text-zinc-500">{hint}</span>}
                        {actions}
                      </div>
                    </>
                  );

                  // R18.2: Collapsible varyant — başlık satırının kendisi
                  // <button>. Aksiyonlar (sort/view) kullanılan section'da
                  // (Kütüphanem) collapsible OLMAYACAĞI için iç içe button
                  // çakışması yok. Defense-in-depth: `actions` interaktif olsa
                  // bile event.stopPropagation gerektiğinde aşağıda eklenir.
                  const wrapperClass =
                    "flex flex-wrap items-end justify-between gap-x-3 gap-y-2 mb-3 pb-2 border-b border-zinc-800/50";
                  if (collapsible) {
                    return (
                      <button
                        type="button"
                        onClick={onToggle}
                        aria-expanded={isOpen ? "true" : "false"}
                        className={`${wrapperClass} w-full text-left cursor-pointer group hover:border-zinc-700/70 transition-colors`}
                      >
                        {headerInner}
                      </button>
                    );
                  }
                  return <div className={wrapperClass}>{headerInner}</div>;
                };

                return (
                  <div className="space-y-8">
                    {/* 1) Devam Ettiklerim — in-progress slice (max 6).
                        R18.2: section header collapsible; kapalıyken grid
                        DOM'dan tamamen çıkar (height transition yok — basit). */}
                    {continueItems.length > 0 && (
                      <section aria-label="Devam Ettiklerim">
                        <SectionHead
                          icon={PlayCircle}
                          title="Devam Ettiklerim"
                          count={continueItems.length}
                          hint="Son aktiviteye göre"
                          collapsible
                          isOpen={continueSectionOpen}
                          onToggle={() => setContinueSectionOpen((v) => !v)}
                        />
                        {continueSectionOpen && (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                          {continueItems.map((item) => {
                            const relatedAction = getLibraryRelatedAction(item);
                            return (
                              <MediaCard
                                key={`continue-${item.id}`}
                                item={item}
                                onIncrement={handleIncrement}
                                onComplete={handleComplete}
                                onEdit={handleOpenEditModal}
                                onDelete={handleDeleteRequest}
                                onToggleFavorite={handleToggleFavorite}
                                onOpenDetail={handleOpenDetailModal}
                                onAddRelatedParts={handleAddMissingTvmazeParts}
                                relatedPartsLabel={relatedAction.label}
                                canAddRelatedParts={relatedAction.canAdd}
                                onOpenGroupEdit={handleOpenGroupEdit}
                                onUpdateRating={handleUpdateRating}
                              />
                            );
                          })}
                        </div>
                        )}
                      </section>
                    )}

                    {/* 2) Seri Koleksiyonlarım — group cards (2+ parça).
                        R18.2: collapsible. */}
                    {seriesGroupCards.length > 0 && (
                      <section aria-label="Seri Koleksiyonlarım">
                        <SectionHead
                          icon={Layers}
                          title="Seri Koleksiyonlarım"
                          count={seriesGroupCards.length}
                          collapsible
                          isOpen={seriesSectionOpen}
                          onToggle={() => setSeriesSectionOpen((v) => !v)}
                        />
                        {seriesSectionOpen && (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                          {seriesGroupCards.map((group) => (
                            <SeriesGroupCard
                              key={group.key}
                              group={group}
                              onIncrement={handleIncrement}
                              onComplete={handleComplete}
                              onEdit={handleOpenEditModal}
                              onDelete={handleDeleteRequest}
                              onToggleFavorite={handleToggleFavorite}
                              onOpenDetail={handleOpenDetailModal}
                              onAddRelatedParts={handleAddMissingTvmazeParts}
                              resolveRelatedAction={getLibraryRelatedAction}
                              onOpenGroupEdit={handleOpenGroupEdit}
                              onUpdateRating={handleUpdateRating}
                            />
                          ))}
                        </div>
                        )}
                      </section>
                    )}

                    {/* 3) Kütüphanem — kalan tekil item'lar (R5: sort + view) */}
                    {singletonItems.length > 0 && (
                      <section aria-label="Kütüphanem">
                        <SectionHead
                          icon={LibraryIcon}
                          title="Kütüphanem"
                          count={singletonItems.length}
                          actions={
                            <LibrarySectionControls
                              sortBy={librarySort}
                              onSortChange={setLibrarySort}
                              viewMode={libraryView}
                              onViewChange={setLibraryView}
                            />
                          }
                        />
                        <div className={singletonGridClass}>
                          {singletonItems.map((item) => {
                            const relatedAction = getLibraryRelatedAction(item);
                            return (
                              <MediaCard
                                key={item.id}
                                item={item}
                                onIncrement={handleIncrement}
                                onComplete={handleComplete}
                                onEdit={handleOpenEditModal}
                                onDelete={handleDeleteRequest}
                                onToggleFavorite={handleToggleFavorite}
                                onOpenDetail={handleOpenDetailModal}
                                onAddRelatedParts={handleAddMissingTvmazeParts}
                                relatedPartsLabel={relatedAction.label}
                                canAddRelatedParts={relatedAction.canAdd}
                                onOpenGroupEdit={handleOpenGroupEdit}
                                onUpdateRating={handleUpdateRating}
                              />
                            );
                          })}
                        </div>
                      </section>
                    )}
                  </div>
                );
              })()
            ) : (
              <div className="flex flex-col items-center justify-center py-20 bg-zinc-900/20 rounded-2xl border border-zinc-800/50">
                <div className="w-16 h-16 rounded-2xl bg-zinc-900 flex items-center justify-center mb-4">
                  <span className="text-3xl">🔍</span>
                </div>
                <p className="text-zinc-400 text-sm">Sonuç bulunamadı</p>
                <p className="text-zinc-600 text-xs mt-1">
                  Farklı filtreler veya arama terimleri deneyin
                </p>
              </div>
            )}
          </div>
        )}

        {/* KEŞFET SEKMESI */}
        {activeTab === "discover" && (
          <div>
            <PageHeader
              icon={Compass}
              title="Keşfet"
              // R23.1: TMDB birincil kaynak olduğundan açıklama güncellendi;
              // tek-tek kaynak adlarını saymak yerine kullanıcı niyetini
              // anlatan kısa cümle.
              subtitle="Film, dizi, anime, manga ve kitapları kaynaklar arasında ara."
            />
            <div className="space-y-6">
              <GlobalSearch
                getLibraryStatus={getGlobalSearchLibraryStatus}
                onAddToLibrary={handleAddFromGlobalSearch}
                prefill={discoverPrefill}
              />
              <div>
                {/* R23.1: Eski "Eski Paneller" başlığı debug hissi veriyordu;
                    "Kaynak Bazlı Arama" daha temiz ve niyet odaklı.
                    Alt satır kısa bir hatırlatma — burada her kaynağa
                    doğrudan sorgu atılır, global birleşik akış aktif değildir. */}
                {/* R23.2: Açıklama sadeleştirildi. TMDB ile Ara devre-dışı
                    panel kaldırıldı; TMDB artık Global Arama'da birincil
                    film kaynağı. OMDb fallback aynı yerden tüketildiği
                    için ayrı bir source-bazlı panel gerektirmiyor. Sadece
                    gerçekten aktif olan üç panel kalır: TVMaze, AniList,
                    Open Library. */}
                <button
                  type="button"
                  onClick={() => setShowAdvancedSearches(!showAdvancedSearches)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-zinc-900/30 border border-zinc-800/60 rounded-xl text-sm font-medium text-zinc-300 hover:bg-zinc-900/50 transition-colors cursor-pointer"
                  aria-expanded={showAdvancedSearches}
                >
                  <span className="flex flex-col text-left min-w-0">
                    <span className="text-[13.5px] font-semibold tracking-tight text-zinc-200">
                      Kaynak Bazlı Arama
                    </span>
                    <span className="text-[11.5px] font-normal text-zinc-500 truncate">
                      Belirli bir kaynağı doğrudan aramak için kullan.
                    </span>
                  </span>
                  {showAdvancedSearches ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
                </button>

                {showAdvancedSearches && (
                  <div className="mt-4 space-y-4">
                    <TvmazeSearch
                      isInLibrary={isInLibrary}
                      onAddToLibrary={handleAddFromTvmaze}
                    />
                    <AniListSearch
                      isInLibrary={isInLibrary}
                      onAddToLibrary={handleAddFromAniList}
                    />
                    <OpenLibrarySearch
                      isInLibrary={isInLibrary}
                      onAddToLibrary={handleAddFromOpenLibrary}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAKVIM SEKMESI (R30)
            - Sahte yayin tarihi veya uydurma event yok.
            - Sadece progressLogs, planning ve watching/reading status'lari kullanilir. */}
        {activeTab === "calendar" && (
          <div>
            <PageHeader
              icon={Calendar}
              title="Takvim"
              subtitle="Kütüphanendeki gerçek aktivite ve takip durumlarını ajanda olarak gör."
            />
            {(() => {
              const sortedLogs = progressLogs
                .slice()
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              const recentLogs = sortedLogs.slice(0, 12);
              const plannedItems = mediaList
                .filter((it) => it.status === "planning")
                .slice()
                .sort((a, b) => mediaList.indexOf(b) - mediaList.indexOf(a));
              const activeItems = mediaList
                .filter((it) => it.status === "watching" || it.status === "reading")
                .slice()
                .sort((a, b) => mediaList.indexOf(b) - mediaList.indexOf(a));
              const hasCalendarData =
                recentLogs.length > 0 || plannedItems.length > 0 || activeItems.length > 0;
              const todayKey = new Date().toLocaleDateString("tr-TR");
              const groupedLogs = recentLogs.reduce<Record<string, ProgressLog[]>>((acc, log) => {
                const key = new Date(log.createdAt).toLocaleDateString("tr-TR");
                acc[key] = acc[key] ?? [];
                acc[key].push(log);
                return acc;
              }, {});
              const logActionLabel = (action: ProgressLog["action"]) => {
                switch (action) {
                  case "increment":
                    return "İlerleme";
                  case "complete":
                    return "Tamamlandı";
                  case "manual_adjust":
                    return "Düzenleme";
                  case "added":
                    return "Eklendi";
                  default:
                    return action;
                }
              };
              const CalendarSection = ({
                title,
                count,
                children,
              }: {
                title: string;
                count?: number;
                children: React.ReactNode;
              }) => (
                <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-4 min-w-0">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <h2 className="text-sm font-semibold text-zinc-100 truncate">{title}</h2>
                    {typeof count === "number" && (
                      <span className="text-[11px] font-mono tabular-nums text-zinc-500 px-1.5 py-0.5 rounded-md bg-zinc-950/50 border border-zinc-800/60 shrink-0">
                        {count}
                      </span>
                    )}
                  </div>
                  {children}
                </section>
              );

              if (!hasCalendarData) {
                return (
                  <div className="space-y-5 min-w-0">
                    <PersonalEmptyState
                      icon={Calendar}
                      title="Takvimde gösterilecek veri yok"
                      description="İlerleme kaydı oluştuğunda, planlanan veya devam eden medyalar eklendiğinde ajanda burada görünür."
                    />
                    <CalendarSection title="Yaklaşan bölümler">
                      <p className="text-sm text-zinc-500 leading-relaxed">
                        Yayın takibi henüz bağlı değil. Sahte tarih üretmeden, ileride gerçek kaynak verisi bağlanınca bu alan kullanılacak.
                      </p>
                    </CalendarSection>
                  </div>
                );
              }

              return (
                <div className="space-y-5 min-w-0">
                  <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
                    <CalendarSection title="Bugünkü / son aktiviteler" count={recentLogs.length}>
                      {recentLogs.length === 0 ? (
                        <p className="text-sm text-zinc-500">Henüz aktivite kaydı yok.</p>
                      ) : (
                        <div className="space-y-4">
                          {Object.entries(groupedLogs).map(([dateLabel, logs]) => (
                            <div key={dateLabel} className="min-w-0">
                              <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-zinc-500 font-semibold">
                                {dateLabel === todayKey ? "Bugün" : dateLabel}
                              </div>
                              <div className="space-y-2">
                                {logs.map((log) => (
                                  <div key={log.id} className="rounded-xl border border-zinc-800/55 bg-zinc-950/25 p-3 min-w-0">
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="text-[12.5px] font-medium text-zinc-200 truncate">
                                        {log.mediaTitle}
                                      </span>
                                      <span className="text-[11px] text-amber-300/80 shrink-0">
                                        {logActionLabel(log.action)}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-[11px] text-zinc-500 truncate">
                                      {new Date(log.createdAt).toLocaleTimeString("tr-TR", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                      {log.detail ? ` · ${log.detail}` : ""}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CalendarSection>

                    <CalendarSection title="Yaklaşan bölümler">
                      <div className="rounded-xl border border-dashed border-zinc-700/70 bg-zinc-950/20 p-4 min-w-0">
                        <p className="text-sm font-medium text-zinc-300">Gerçek yayın verisi bekleniyor</p>
                        <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
                          Bu sürüm TVMaze/AniList yayın takibi çekmez ve sahte bölüm günü üretmez.
                          Gerçek tarih verisi bağlandığında bu alan ajanda görünümüne dönüşebilir.
                        </p>
                      </div>
                    </CalendarSection>
                  </div>

                  <CalendarSection title="Planlanan içerikler" count={plannedItems.length}>
                    {plannedItems.length === 0 ? (
                      <p className="text-sm text-zinc-500">Planlanan içerik yok.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                        {plannedItems.map((item) => {
                          const relatedAction = getLibraryRelatedAction(item);
                          return (
                            <MediaCard
                              key={item.id}
                              item={item}
                              onIncrement={handleIncrement}
                              onComplete={handleComplete}
                              onEdit={handleOpenEditModal}
                              onDelete={handleDeleteRequest}
                              onToggleFavorite={handleToggleFavorite}
                              onOpenDetail={handleOpenDetailModal}
                              onAddRelatedParts={handleAddMissingTvmazeParts}
                              relatedPartsLabel={relatedAction.label}
                              canAddRelatedParts={relatedAction.canAdd}
                              onOpenGroupEdit={handleOpenGroupEdit}
                              onUpdateRating={handleUpdateRating}
                            />
                          );
                        })}
                      </div>
                    )}
                  </CalendarSection>

                  <CalendarSection title="Devam eden içerikler" count={activeItems.length}>
                    {activeItems.length === 0 ? (
                      <p className="text-sm text-zinc-500">Devam eden içerik yok.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                        {activeItems.map((item) => {
                          const relatedAction = getLibraryRelatedAction(item);
                          return (
                            <MediaCard
                              key={item.id}
                              item={item}
                              onIncrement={handleIncrement}
                              onComplete={handleComplete}
                              onEdit={handleOpenEditModal}
                              onDelete={handleDeleteRequest}
                              onToggleFavorite={handleToggleFavorite}
                              onOpenDetail={handleOpenDetailModal}
                              onAddRelatedParts={handleAddMissingTvmazeParts}
                              relatedPartsLabel={relatedAction.label}
                              canAddRelatedParts={relatedAction.canAdd}
                              onOpenGroupEdit={handleOpenGroupEdit}
                              onUpdateRating={handleUpdateRating}
                            />
                          );
                        })}
                      </div>
                    )}
                  </CalendarSection>
                </div>
              );
            })()}
          </div>
        )}

        {/* İLERLEMEM SEKMESİ (R32)
            - Kütüphanem filtre/grup sisteminden bağımsızdır.
            - Başlanmış ama completed/dropped olmayan item'ları MediaCard ile gösterir.
            - Kart aksiyonları mevcut handler'lara bağlıdır; tamamlanan item bu
              local filtreden otomatik düşer. */}
        {activeTab === "progress" && (
          <div>
            <PageHeader
              icon={TrendingUp}
              title="İlerlemem"
              subtitle="Başladığın ve hâlâ açık olan medya ilerlemelerini tek yerde gör."
            />
            {(() => {
              const lastLogAt = new Map<string, number>();
              for (const log of progressLogs) {
                const t = new Date(log.createdAt).getTime();
                const prev = lastLogAt.get(log.mediaId) ?? 0;
                if (t > prev) lastLogAt.set(log.mediaId, t);
              }

              const progressRatio = (item: MediaItem) =>
                item.totalProgress > 0 ? item.currentProgress / item.totalProgress : -1;
              const progressPercent = (item: MediaItem) =>
                item.totalProgress > 0
                  ? Math.min(100, Math.round((item.currentProgress / item.totalProgress) * 100))
                  : 0;
              const isStartedOpen = (item: MediaItem) => {
                if (item.status === "watching" || item.status === "reading") return true;
                return (
                  (item.currentProgress ?? 0) > 0 &&
                  item.status !== "completed" &&
                  item.status !== "dropped"
                );
              };

              const progressItems = mediaList.filter(isStartedOpen);
              const nearCompletionItems = progressItems.filter(
                (item) =>
                  item.totalProgress > 0 &&
                  progressRatio(item) >= 0.75 &&
                  item.status !== "completed"
              );
              const pausedCount = progressItems.filter((item) => item.status === "paused").length;
              const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
              const recentProgressLogCount = progressLogs.filter((log) => {
                if (log.action === "added") return false;
                if (new Date(log.createdAt).getTime() < sevenDaysAgo) return false;
                return progressItems.some((item) => item.id === log.mediaId);
              }).length;

              const q = progressSearch.trim().toLowerCase();
              const searched = q
                ? progressItems.filter((item) => item.title.toLowerCase().includes(q))
                : progressItems;
              const sorted = searched.slice().sort((a, b) => {
                if (progressSort === "progress") return progressRatio(b) - progressRatio(a);
                if (progressSort === "title") return a.title.localeCompare(b.title, "tr");
                if (progressSort === "rating") return (b.userRating ?? -1) - (a.userRating ?? -1);
                return (lastLogAt.get(b.id) ?? 0) - (lastLogAt.get(a.id) ?? 0);
              });

              if (progressItems.length === 0) {
                return (
                  <PersonalEmptyState
                    icon={TrendingUp}
                    title="Devam eden ilerleme yok"
                    description="Bir medyada ilerleme başlattığında veya izleniyor/okunuyor durumuna aldığında burada görünecek."
                    tone="text-violet-400/80"
                  />
                );
              }

              return (
                <div className="space-y-6 min-w-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    <PersonalMetricCard label="Devam eden toplam" value={progressItems.length} />
                    <PersonalMetricCard label="Bitirmeye yakın" value={nearCompletionItems.length} accent />
                    <PersonalMetricCard label="Duraklatılmış" value={pausedCount} />
                    <PersonalMetricCard label="Son 7 gün ilerleme" value={recentProgressLogCount} hint="aktivite" />
                  </div>

                  <PersonalControls
                    searchValue={progressSearch}
                    onSearchChange={setProgressSearch}
                    searchPlaceholder="İlerlemelerinde ara..."
                    sortValue={progressSort}
                    onSortChange={(value) => setProgressSort(value as typeof progressSort)}
                    sortOptions={[
                      { value: "lastActivity", label: "Son aktivite" },
                      { value: "progress", label: "İlerleme yüzdesi" },
                      { value: "title", label: "Başlık" },
                      { value: "rating", label: "Puan" },
                    ]}
                    countLabel={`${sorted.length} / ${progressItems.length}`}
                  />

                  {nearCompletionItems.length > 0 && (
                    <section aria-label="Bitirmeye Yakın" className="space-y-3">
                      <div className="flex flex-wrap items-end justify-between gap-3 pb-2 border-b border-zinc-800/50">
                        <div className="flex items-center gap-2 min-w-0">
                          <TrendingUp className="w-4 h-4 text-amber-400/80 shrink-0" />
                          <h2 className="text-[15px] font-semibold text-zinc-100 tracking-tight truncate">
                            Bitirmeye Yakın
                          </h2>
                          <span className="text-[11px] font-mono tabular-nums text-zinc-500 px-1.5 py-0.5 rounded-md bg-zinc-900/60 border border-zinc-800/60 shrink-0">
                            {nearCompletionItems.length}
                          </span>
                        </div>
                        <span className="text-[11px] text-zinc-500">Bilinen toplamda %75 ve üzeri</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                        {nearCompletionItems
                          .slice()
                          .sort((a, b) => progressPercent(b) - progressPercent(a))
                          .map((item) => {
                            const relatedAction = getLibraryRelatedAction(item);
                            return (
                              <MediaCard
                                key={`near-${item.id}`}
                                item={item}
                                onIncrement={handleIncrement}
                                onComplete={handleComplete}
                                onEdit={handleOpenEditModal}
                                onDelete={handleDeleteRequest}
                                onToggleFavorite={handleToggleFavorite}
                                onOpenDetail={handleOpenDetailModal}
                                onAddRelatedParts={handleAddMissingTvmazeParts}
                                relatedPartsLabel={relatedAction.label}
                                canAddRelatedParts={relatedAction.canAdd}
                                onOpenGroupEdit={handleOpenGroupEdit}
                                onUpdateRating={handleUpdateRating}
                              />
                            );
                          })}
                      </div>
                    </section>
                  )}

                  {sorted.length === 0 ? (
                    <PersonalEmptyState
                      icon={Search}
                      title="Sonuç bulunamadı"
                      description="Arama terimini değiştirerek tekrar deneyebilirsin."
                      tone="text-zinc-500"
                    />
                  ) : (
                    <section aria-label="Tüm İlerlemeler" className="space-y-3">
                      <div className="flex flex-wrap items-end justify-between gap-3 pb-2 border-b border-zinc-800/50">
                        <div className="flex items-center gap-2 min-w-0">
                          <PlayCircle className="w-4 h-4 text-amber-400/80 shrink-0" />
                          <h2 className="text-[15px] font-semibold text-zinc-100 tracking-tight truncate">
                            Tüm İlerlemeler
                          </h2>
                          <span className="text-[11px] font-mono tabular-nums text-zinc-500 px-1.5 py-0.5 rounded-md bg-zinc-900/60 border border-zinc-800/60 shrink-0">
                            {sorted.length}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                        {sorted.map((item) => {
                          const relatedAction = getLibraryRelatedAction(item);
                          return (
                            <MediaCard
                              key={item.id}
                              item={item}
                              onIncrement={handleIncrement}
                              onComplete={handleComplete}
                              onEdit={handleOpenEditModal}
                              onDelete={handleDeleteRequest}
                              onToggleFavorite={handleToggleFavorite}
                              onOpenDetail={handleOpenDetailModal}
                              onAddRelatedParts={handleAddMissingTvmazeParts}
                              relatedPartsLabel={relatedAction.label}
                              canAddRelatedParts={relatedAction.canAdd}
                              onOpenGroupEdit={handleOpenGroupEdit}
                              onUpdateRating={handleUpdateRating}
                            />
                          );
                        })}
                      </div>
                    </section>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* IZLEME LISTEM SEKMESI (R25)
            - Kutuphanem filtre/grup sisteminden bagimsizdir.
            - Sadece planlanan/baslanmamis item'lari MediaCard ile gosterir.
            - Kart aksiyonlari mevcut handler'lara baglidir; status planning'den
              ciktiginda item bu local filtreden otomatik duser. */}
        {activeTab === "watchlist" && (
          <div>
            <PageHeader
              icon={ListChecks}
              title="İzleme Listem"
              subtitle="Kütüphanendeki planlanan medyaları tek yerde gör."
            />
            {(() => {
              const plannedItems = mediaList.filter(
                (it) => it.status === "planning" || (it.status as string) === "planned"
              );
              const q = watchlistSearch.trim().toLowerCase();
              const searched = q
                ? plannedItems.filter((it) => it.title.toLowerCase().includes(q))
                : plannedItems;
              const sorted = searched.slice().sort((a, b) => {
                if (watchlistSort === "title") return a.title.localeCompare(b.title, "tr");
                if (watchlistSort === "rating") {
                  return (b.userRating ?? -1) - (a.userRating ?? -1);
                }
                return mediaList.indexOf(b) - mediaList.indexOf(a);
              });

              if (plannedItems.length === 0) {
                return (
                  <PersonalEmptyState
                    icon={ListChecks}
                    title="Planlanan medya yok"
                    description="Keşfet veya Medya Ekle akışında planlandı durumuyla kaydettiğin içerikler burada görünür."
                  />
                );
              }

              return (
                <div className="space-y-5 min-w-0">
                  <PersonalControls
                    searchValue={watchlistSearch}
                    onSearchChange={setWatchlistSearch}
                    searchPlaceholder="İzleme listende ara..."
                    sortValue={watchlistSort}
                    onSortChange={(value) => setWatchlistSort(value as typeof watchlistSort)}
                    sortOptions={[
                      { value: "recent", label: "Son eklenen" },
                      { value: "title", label: "Başlık" },
                      { value: "rating", label: "Puan" },
                    ]}
                    countLabel={`${sorted.length} / ${plannedItems.length}`}
                  />

                  {sorted.length === 0 ? (
                    <PersonalEmptyState
                      icon={Search}
                      title="Sonuç bulunamadı"
                      description="Arama terimini değiştirerek tekrar deneyebilirsin."
                      tone="text-zinc-500"
                    />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                      {sorted.map((item) => {
                        const relatedAction = getLibraryRelatedAction(item);
                        return (
                          <MediaCard
                            key={item.id}
                            item={item}
                            onIncrement={handleIncrement}
                            onComplete={handleComplete}
                            onEdit={handleOpenEditModal}
                            onDelete={handleDeleteRequest}
                            onToggleFavorite={handleToggleFavorite}
                            onOpenDetail={handleOpenDetailModal}
                            onAddRelatedParts={handleAddMissingTvmazeParts}
                            relatedPartsLabel={relatedAction.label}
                            canAddRelatedParts={relatedAction.canAdd}
                            onOpenGroupEdit={handleOpenGroupEdit}
                            onUpdateRating={handleUpdateRating}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* FAVORİLERİM SEKMESI (R24)
            — Kütüphanem filtre/grup sistemine dokunmadan, favorite=true olan
              item'ları MediaCard ile listeler. Lokal arama + basit sıralama.
            — handleToggleFavorite mediaList'i mutasyona uğrattığı için favori
              kaldırılınca item bu sayfanın filter'ından otomatik düşer. */}
        {activeTab === "favorites" && (
          <div>
            <PageHeader
              icon={Heart}
              title="Favorilerim"
              subtitle="Kütüphanende öne çıkardığın medyaları tek yerde gör."
            />
            {(() => {
              const favItems = mediaList.filter((it) => it.favorite === true);
              const q = favoritesSearch.trim().toLowerCase();
              const searched = q
                ? favItems.filter((it) => it.title.toLowerCase().includes(q))
                : favItems;
              const sorted = searched.slice().sort((a, b) => {
                if (favoritesSort === "title") return a.title.localeCompare(b.title, "tr");
                if (favoritesSort === "rating") {
                  return (b.userRating ?? -1) - (a.userRating ?? -1);
                }
                // recent: mediaList index (ekleme sırası proxy'si) — son eklenen önce
                return mediaList.indexOf(b) - mediaList.indexOf(a);
              });

              // Sayfa hiç favori yokken: modern empty state.
              if (favItems.length === 0) {
                return (
                  <PersonalEmptyState
                    icon={Heart}
                    title="Henüz favori eklemedin"
                    description="Kartların sağ üst köşesindeki kalp şeridiyle medyaları buraya sabitleyebilirsin."
                    tone="text-rose-400/80"
                  />
                );
              }

              return (
                <div className="space-y-5 min-w-0">
                  {/* Kompakt kontrol satırı: arama + sort. Kütüphanem'in
                      LibraryControlBar'ından bilinçli olarak ayrı tutuldu —
                      orada Dünya/Tür/Durum sistemine kasıtlı dokunmuyoruz. */}
                  <PersonalControls
                    searchValue={favoritesSearch}
                    onSearchChange={setFavoritesSearch}
                    searchPlaceholder="Favorilerinde ara..."
                    sortValue={favoritesSort}
                    onSortChange={(value) => setFavoritesSort(value as typeof favoritesSort)}
                    sortOptions={[
                      { value: "recent", label: "Son eklenen" },
                      { value: "title", label: "Başlık" },
                      { value: "rating", label: "Puan" },
                    ]}
                    countLabel={`${sorted.length} / ${favItems.length}`}
                  />

                  {sorted.length === 0 ? (
                    <PersonalEmptyState
                      icon={Search}
                      title="Sonuç bulunamadı"
                      description="Arama terimini değiştirerek tekrar deneyebilirsin."
                      tone="text-zinc-500"
                    />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                      {sorted.map((item) => {
                        const relatedAction = getLibraryRelatedAction(item);
                        return (
                          <MediaCard
                            key={item.id}
                            item={item}
                            onIncrement={handleIncrement}
                            onComplete={handleComplete}
                            onEdit={handleOpenEditModal}
                            onDelete={handleDeleteRequest}
                            onToggleFavorite={handleToggleFavorite}
                            onOpenDetail={handleOpenDetailModal}
                            onAddRelatedParts={handleAddMissingTvmazeParts}
                            relatedPartsLabel={relatedAction.label}
                            canAddRelatedParts={relatedAction.canAdd}
                            onOpenGroupEdit={handleOpenGroupEdit}
                            onUpdateRating={handleUpdateRating}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* PUANLAMALARIM SEKMESI (R26)
            - Yeni rating sistemi kurmaz; mevcut userRating alanini kullanir.
            - Kutuphanem filtre/grup sisteminden bagimsiz, lokal arama/siralama.
            - Puan temizlenince item userRating filtresinden otomatik duser. */}
        {activeTab === "ratings" && (
          <div>
            <PageHeader
              icon={Star}
              title="Puanlamalarım"
              subtitle="Kütüphanende puanladığın medyaları tek yerde gör."
            />
            {(() => {
              const ratedItems = mediaList.filter(
                (it) => typeof it.userRating === "number" && Number.isFinite(it.userRating)
              );
              const q = ratingsSearch.trim().toLowerCase();
              const searched = q
                ? ratedItems.filter((it) => it.title.toLowerCase().includes(q))
                : ratedItems;
              const sorted = searched.slice().sort((a, b) => {
                const ra = a.userRating ?? -1;
                const rb = b.userRating ?? -1;
                if (ratingsSort === "ratingAsc") return ra - rb;
                if (ratingsSort === "title") return a.title.localeCompare(b.title, "tr");
                if (ratingsSort === "recent") return mediaList.indexOf(b) - mediaList.indexOf(a);
                return rb - ra;
              });
              const totalRating = ratedItems.reduce((sum, it) => sum + (it.userRating ?? 0), 0);
              const averageRating = ratedItems.length > 0 ? totalRating / ratedItems.length : 0;
              const highestRating = ratedItems.reduce(
                (max, it) => Math.max(max, it.userRating ?? -1),
                -1
              );
              const highestCount =
                highestRating >= 0
                  ? ratedItems.filter((it) => it.userRating === highestRating).length
                  : 0;

              if (ratedItems.length === 0) {
                return (
                  <PersonalEmptyState
                    icon={Star}
                    title="Henüz puan verilmiş medya yok"
                    description="Kartların kapak alanındaki yıldızla puanladığın kayıtlar burada görünür."
                  />
                );
              }

              return (
                <div className="space-y-5 min-w-0">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <PersonalMetricCard label="Puanlanan" value={ratedItems.length} />
                    <PersonalMetricCard label="Ortalama" value={averageRating.toFixed(1)} accent />
                    <PersonalMetricCard label="En yüksek" value={highestCount} hint={`adet / ${highestRating}`} />
                  </div>

                  <PersonalControls
                    searchValue={ratingsSearch}
                    onSearchChange={setRatingsSearch}
                    searchPlaceholder="Puanlamalarında ara..."
                    sortValue={ratingsSort}
                    onSortChange={(value) => setRatingsSort(value as typeof ratingsSort)}
                    sortOptions={[
                      { value: "ratingDesc", label: "Puan yüksekten düşüğe" },
                      { value: "ratingAsc", label: "Puan düşükten yükseğe" },
                      { value: "title", label: "Başlık" },
                      { value: "recent", label: "Son eklenen" },
                    ]}
                    countLabel={`${sorted.length} / ${ratedItems.length}`}
                  />

                  {sorted.length === 0 ? (
                    <PersonalEmptyState
                      icon={Search}
                      title="Sonuç bulunamadı"
                      description="Arama terimini değiştirerek tekrar deneyebilirsin."
                      tone="text-zinc-500"
                    />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                      {sorted.map((item) => {
                        const relatedAction = getLibraryRelatedAction(item);
                        return (
                          <MediaCard
                            key={item.id}
                            item={item}
                            onIncrement={handleIncrement}
                            onComplete={handleComplete}
                            onEdit={handleOpenEditModal}
                            onDelete={handleDeleteRequest}
                            onToggleFavorite={handleToggleFavorite}
                            onOpenDetail={handleOpenDetailModal}
                            onAddRelatedParts={handleAddMissingTvmazeParts}
                            relatedPartsLabel={relatedAction.label}
                            canAddRelatedParts={relatedAction.canAdd}
                            onOpenGroupEdit={handleOpenGroupEdit}
                            onUpdateRating={handleUpdateRating}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* NOTLARIM SEKMESI (R27)
            - Yeni not sistemi kurmaz; mevcut personalNotes ve olasi legacy notes
              alanlarini sadece okur.
            - Kutuphanem filtre/grup sisteminden bagimsiz, lokal arama/siralama.
            - Not bosaltilinca item bu local filtreden otomatik duser. */}
        {activeTab === "notes" && (
          <div>
            <PageHeader
              icon={NotebookPen}
              title="Notlarım"
              subtitle="Kütüphanende not eklediğin medyaları tek yerde gör."
            />
            {(() => {
              type LegacyNoteItem = MediaItem & { notes?: unknown };
              const getNoteText = (item: MediaItem) => {
                const personal = item.personalNotes?.trim();
                if (personal) return personal;

                const legacyNotes = (item as LegacyNoteItem).notes;
                if (typeof legacyNotes === "string") return legacyNotes.trim();
                if (Array.isArray(legacyNotes)) {
                  return legacyNotes
                    .filter((note): note is string => typeof note === "string")
                    .map((note) => note.trim())
                    .filter(Boolean)
                    .join(" ");
                }
                return "";
              };

              const notedItems = mediaList.filter((it) => getNoteText(it).length > 0);
              const q = notesSearch.trim().toLowerCase();
              const searched = q
                ? notedItems.filter((it) => {
                    const titleHit = it.title.toLowerCase().includes(q);
                    const noteHit = getNoteText(it).toLowerCase().includes(q);
                    const tagHit = (it.tags ?? []).some((tag) =>
                      tag.toLowerCase().includes(q)
                    );
                    return titleHit || noteHit || tagHit;
                  })
                : notedItems;
              const sorted = searched.slice().sort((a, b) => {
                if (notesSort === "title") return a.title.localeCompare(b.title, "tr");
                if (notesSort === "rating") return (b.userRating ?? -1) - (a.userRating ?? -1);
                return mediaList.indexOf(b) - mediaList.indexOf(a);
              });

              if (notedItems.length === 0) {
                return (
                  <PersonalEmptyState
                    icon={NotebookPen}
                    title="Henüz not eklenmiş medya yok"
                    description="Kartları düzenlerken kişisel not alanını doldurduğun kayıtlar burada görünür."
                  />
                );
              }

              return (
                <div className="space-y-5 min-w-0">
                  <PersonalControls
                    searchValue={notesSearch}
                    onSearchChange={setNotesSearch}
                    searchPlaceholder="Başlık, not veya tag ara..."
                    sortValue={notesSort}
                    onSortChange={(value) => setNotesSort(value as typeof notesSort)}
                    sortOptions={[
                      { value: "recent", label: "Son eklenen" },
                      { value: "title", label: "Başlık" },
                      { value: "rating", label: "Puan" },
                    ]}
                    countLabel={`${sorted.length} / ${notedItems.length}`}
                  />

                  {sorted.length === 0 ? (
                    <PersonalEmptyState
                      icon={Search}
                      title="Sonuç bulunamadı"
                      description="Başlık, not veya tag aramasını değiştirerek tekrar deneyebilirsin."
                      tone="text-zinc-500"
                    />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                      {sorted.map((item) => {
                        const relatedAction = getLibraryRelatedAction(item);
                        const noteText = getNoteText(item);
                        return (
                          <div key={item.id} className="space-y-2">
                            <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/35 p-3">
                              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-zinc-500 font-semibold mb-2">
                                <NotebookPen className="w-3.5 h-3.5 text-amber-400/80" />
                                Not
                              </div>
                              <p className="text-[12.5px] leading-relaxed text-zinc-300 line-clamp-3">
                                {noteText}
                              </p>
                            </div>
                            <MediaCard
                              item={item}
                              onIncrement={handleIncrement}
                              onComplete={handleComplete}
                              onEdit={handleOpenEditModal}
                              onDelete={handleDeleteRequest}
                              onToggleFavorite={handleToggleFavorite}
                              onOpenDetail={handleOpenDetailModal}
                              onAddRelatedParts={handleAddMissingTvmazeParts}
                              relatedPartsLabel={relatedAction.label}
                              canAddRelatedParts={relatedAction.canAdd}
                              onOpenGroupEdit={handleOpenGroupEdit}
                              onUpdateRating={handleUpdateRating}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ISTATISTIKLER SEKMESI (R28)
            - Persistence/API/sync yok; sadece mevcut mediaList ve progressLogs.
            - RightRail hesap mantigina dokunmadan sayfa ici turetilmis metrikler.
            - Chart kutuphanesi eklemeden responsive CSS bar'lar kullanilir. */}
        {activeTab === "stats" && (
          <div>
            <PageHeader
              icon={BarChart3}
              title="İstatistikler"
              subtitle="Kütüphanendeki dağılımı, puanları ve aktiviteyi tek yerde gör."
            />
            {(() => {
              const ratedItems = mediaList.filter(
                (it) => typeof it.userRating === "number" && Number.isFinite(it.userRating)
              );
              const averageRating =
                ratedItems.length > 0
                  ? ratedItems.reduce((sum, it) => sum + (it.userRating ?? 0), 0) / ratedItems.length
                  : 0;
              const now = Date.now();
              const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
              const sortedLogs = progressLogs
                .slice()
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              const logsLast7Days = sortedLogs.filter(
                (log) => new Date(log.createdAt).getTime() >= sevenDaysAgo
              );
              const worldCounts = { east: 0, screen: 0, library: 0 };
              for (const item of mediaList) {
                const cls = withMediaClassification(item);
                if (cls.mediaType === "anime" || cls.mediaType === "manga" || cls.mediaType === "novel") {
                  worldCounts.east += 1;
                } else if (cls.mediaType === "tv" || cls.mediaType === "movie") {
                  worldCounts.screen += 1;
                } else {
                  worldCounts.library += 1;
                }
              }
              const statusCounts = {
                completed: mediaList.filter((it) => it.status === "completed").length,
                active: mediaList.filter((it) => it.status === "watching" || it.status === "reading").length,
                planning: mediaList.filter((it) => it.status === "planning").length,
                paused: mediaList.filter((it) => it.status === "paused").length,
                dropped: mediaList.filter((it) => it.status === "dropped").length,
              };
              const ratingCounts = Array.from({ length: 10 }, (_, i) => {
                const rating = i + 1;
                return {
                  rating,
                  count: ratedItems.filter((it) => it.userRating === rating).length,
                };
              });
              const topRated = ratedItems
                .slice()
                .sort((a, b) => {
                  const ratingDiff = (b.userRating ?? -1) - (a.userRating ?? -1);
                  if (ratingDiff !== 0) return ratingDiff;
                  return a.title.localeCompare(b.title, "tr");
                })
                .slice(0, 5);
              const maxWorld = Math.max(1, ...Object.values(worldCounts));
              const maxStatus = Math.max(1, ...Object.values(statusCounts));
              const maxRating = Math.max(1, ...ratingCounts.map((row) => row.count));
              const logActionLabel = (action: ProgressLog["action"]) => {
                switch (action) {
                  case "increment":
                    return "İlerleme";
                  case "complete":
                    return "Tamamlandı";
                  case "manual_adjust":
                    return "Düzenleme";
                  case "added":
                    return "Eklendi";
                  default:
                    return action;
                }
              };
              return (
                <div className="space-y-5 min-w-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
                    <PersonalMetricCard label="Toplam medya" value={dashboardStats.totalItems} />
                    <PersonalMetricCard label="Tamamlanan" value={dashboardStats.completedItems} />
                    <PersonalMetricCard label="Devam eden" value={dashboardStats.inProgressItems} />
                    <PersonalMetricCard label="Planlanan" value={dashboardStats.planningItems} />
                    <PersonalMetricCard label="Ortalama puan" value={ratedItems.length > 0 ? averageRating.toFixed(1) : "—"} accent />
                    <PersonalMetricCard label="Favoriler" value={dashboardStats.favoriteItems} />
                  </div>

                  {mediaList.length === 0 ? (
                    <PersonalEmptyState
                      icon={BarChart3}
                      title="Henüz istatistik yok"
                      description="Kütüphanene medya ekledikçe dağılımlar ve aktivite özeti burada görünür."
                    />
                  ) : (
                    <>
                      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                        <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-4 min-w-0">
                          <h2 className="text-sm font-semibold text-zinc-100 mb-4">Dünya dağılımı</h2>
                          <div className="space-y-3">
                            <DistributionBar label="Doğu" count={worldCounts.east} max={maxWorld} tone="violet" />
                            <DistributionBar label="Kadraj" count={worldCounts.screen} max={maxWorld} tone="sky" />
                            <DistributionBar label="Arşiv" count={worldCounts.library} max={maxWorld} tone="amber" />
                          </div>
                        </section>

                        <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-4 min-w-0">
                          <h2 className="text-sm font-semibold text-zinc-100 mb-4">Status dağılımı</h2>
                          <div className="space-y-3">
                            <DistributionBar label="Tamamlandı" count={statusCounts.completed} max={maxStatus} tone="emerald" />
                            <DistributionBar label="Devam ediyor" count={statusCounts.active} max={maxStatus} tone="sky" />
                            <DistributionBar label="Planlandı" count={statusCounts.planning} max={maxStatus} tone="amber" />
                            <DistributionBar label="Duraklatıldı" count={statusCounts.paused} max={maxStatus} tone="violet" />
                            <DistributionBar label="Bırakıldı" count={statusCounts.dropped} max={maxStatus} tone="rose" />
                          </div>
                        </section>

                        <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-4 min-w-0">
                          <h2 className="text-sm font-semibold text-zinc-100 mb-4">Aktivite özeti</h2>
                          <div className="rounded-xl bg-zinc-950/35 border border-zinc-800/60 p-3 mb-4">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-500 font-semibold">
                              Son 7 gün
                            </p>
                            <p className="mt-1 text-2xl font-semibold text-zinc-100 tabular-nums">
                              {logsLast7Days.length}
                            </p>
                          </div>
                          {sortedLogs.length === 0 ? (
                            <p className="text-sm text-zinc-500">Henüz aktivite kaydı yok.</p>
                          ) : (
                            <div className="space-y-2">
                              {sortedLogs.slice(0, 5).map((log) => (
                                <div key={log.id} className="min-w-0 rounded-xl bg-zinc-950/25 border border-zinc-800/50 p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-[12px] font-medium text-zinc-200 truncate">
                                      {log.mediaTitle}
                                    </span>
                                    <span className="text-[11px] text-zinc-500 shrink-0">
                                      {logActionLabel(log.action)}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-[11px] text-zinc-500 truncate">
                                    {new Date(log.createdAt).toLocaleDateString("tr-TR")}
                                    {log.detail ? ` · ${log.detail}` : ""}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </section>
                      </div>

                      <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-4 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-4">
                          <div>
                            <h2 className="text-sm font-semibold text-zinc-100">Rating dağılımı</h2>
                            <p className="text-xs text-zinc-500 mt-1">
                              {ratedItems.length} puanlı içerik · ortalama {ratedItems.length > 0 ? averageRating.toFixed(1) : "—"}
                            </p>
                          </div>
                        </div>
                        {ratedItems.length === 0 ? (
                          <p className="text-sm text-zinc-500">Henüz puanlanmış içerik yok.</p>
                        ) : (
                          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)] gap-5">
                            <div className="space-y-2 min-w-0">
                              {ratingCounts.map((row) => (
                                <DistributionBar
                                  key={row.rating}
                                  label={`${row.rating} puan`}
                                  count={row.count}
                                  max={maxRating}
                                  tone={row.rating >= 8 ? "emerald" : row.rating >= 5 ? "amber" : "rose"}
                                />
                              ))}
                            </div>
                            <div className="min-w-0 rounded-xl bg-zinc-950/25 border border-zinc-800/50 p-3">
                              <h3 className="text-[12px] font-semibold text-zinc-200 mb-3">En yüksek puanlılar</h3>
                              <div className="space-y-2">
                                {topRated.map((item) => (
                                  <div key={item.id} className="flex items-center justify-between gap-3 min-w-0">
                                    <span className="text-[12px] text-zinc-300 truncate">{item.title}</span>
                                    <span className="text-[12px] font-mono tabular-nums text-amber-300 shrink-0">
                                      {item.userRating}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </section>
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* AI DANIŞMAN SEKMESI */}
        {activeTab === "ai" && (
          <div>
            <PageHeader
              icon={Sparkles}
              title="AI Danışman"
              subtitle="Kütüphanenden yola çıkarak öneriler ve analizler"
            />
            <AiAdvisor
              mediaList={mediaList}
              progressLogs={progressLogs}
              resetSignal={0}
              onAddToLibrary={handleAddFromGlobalSearch}
              onOpenDiscover={(rec) => {
                // R40 — Keşfet'e geç + arama kutusunu öneri başlığıyla ve
                // doğru kategori chip'iyle doldur. Auto-search GlobalSearch
                // tarafında prefill prop'u algılayınca tetiklenir.
                const cat: GlobalSearchCategory =
                  rec.mediaType === "movie" ? "movie" :
                  rec.mediaType === "tv" ? "tv" :
                  rec.mediaType === "anime" ? "anime" :
                  rec.mediaType === "manga" || rec.mediaType === "manhwa" || rec.mediaType === "manhua" ? "manga" :
                  rec.mediaType === "light_novel" || rec.mediaType === "web_novel" || rec.mediaType === "visual_novel" ? "novel" :
                  rec.mediaType === "book" ? "book" : "all";
                setDiscoverPrefill((prev) => ({
                  query: rec.title,
                  category: cat,
                  token: (prev?.token ?? 0) + 1,
                }));
                handleTabChange("discover");
              }}
            />
          </div>
        )}

        {/* AKTİVİTE SEKMESI */}
        {activeTab === "activity" && (
          <div>
            <PageHeader
              icon={ActivityIcon}
              title="Aktivite"
              subtitle="İlerleme ve durum kayıtlarının zaman çizelgesi"
            />
            <ActivityLogPanel progressLogs={progressLogs} />
          </div>
        )}

        {/* AYARLAR SEKMESI */}
        {activeTab === "settings" && (
          // R7.1: RightRail bu sekmede gizli; main column tüm genişliği alır.
          // 2 kolonlu grid lg+'da; küçük "durum" tipindeki paneller solda,
          // veri/aksiyon panelleri sağda. "Uygulama Bilgisi" bütün satırı kaplar.
          <div>
            <PageHeader
              icon={SettingsIcon}
              title="Ayarlar"
              subtitle="Hesap, cloud sync, veri yönetimi ve uygulama bilgisi"
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5 items-start">
              {/* Sol kolon: hesap + cloud sync durumu */}
              <div className="space-y-4 lg:space-y-5">
                <AuthPanel />
                <CloudSyncStatusCard />
              </div>

              {/* Sağ kolon: cloud veri + veri yönetimi */}
              <div className="space-y-4 lg:space-y-5">
                <CloudDataStatusCard
                  user={authUser}
                  configured={authConfigured}
                  mediaItems={mediaList}
                  progressLogs={progressLogs}
                  setMediaItems={setMediaList}
                  setProgressLogs={setProgressLogs}
                  onConfirm={openConfirmDialog}
                />
                <DataManagementPanel
                  mediaList={mediaList}
                  progressLogs={progressLogs}
                  onImport={handleImport}
                  onReset={handleResetRequest}
                  onConfirm={openConfirmDialog}
                />
              </div>

              {/* Uygulama Bilgisi & Credits — satırı tam kaplar */}
              <div className="lg:col-span-2 bg-zinc-900/30 rounded-2xl border border-zinc-800/60 p-6">
                <h3 className="text-base font-semibold text-zinc-100 mb-4 tracking-tight">
                  Uygulama Bilgisi
                </h3>
                <div className="space-y-4 text-sm text-zinc-400">
                  <p>
                    <strong>MediaTracker</strong> tüm verileri tarayıcınızın yerel depolama alanında (localStorage) tutar. Verileriniz hiçbir dış sunucuya gönderilmez veya bir veritabanına kaydedilmez.
                  </p>
                  <div className="h-px bg-zinc-800/60 my-4" />
                  <h4 className="font-medium text-zinc-300">Veri Kaynakları (APIs)</h4>
                  <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-2 list-disc pl-5">
                    <li>
                      TV show data powered by <a href="https://www.tvmaze.com/" target="_blank" rel="noopener noreferrer" className="text-zinc-300 hover:text-amber-400 underline underline-offset-2">TVmaze</a>.
                    </li>
                    <li>
                      Anime and manga data from <a href="https://anilist.co/" target="_blank" rel="noopener noreferrer" className="text-zinc-300 hover:text-amber-400 underline underline-offset-2">AniList</a>.
                    </li>
                    <li>
                      Book data from <a href="https://openlibrary.org/" target="_blank" rel="noopener noreferrer" className="text-zinc-300 hover:text-amber-400 underline underline-offset-2">Open Library</a>.
                    </li>
                    <li>
                      This product uses the <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" className="text-zinc-300 hover:text-amber-400 underline underline-offset-2">TMDB API</a> but is not endorsed or certified by TMDB.
                      <br/><span className="text-xs text-zinc-500 italic">Not: Film araması geçici olarak devre dışı. TMDB erişimi düzeldiğinde aktif edilebilir.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
        </main>
      </div>

      {/* R47: Dashboard, AI Danışman ve Ayarlar sağ rail olmadan tam genişlik kullanır.
          Diğer sekmeler mevcut RightRail davranışını korur. */}
      {shouldShowRightRail && (
        <RightRail
          mediaList={mediaList}
          progressLogs={progressLogs}
          stats={dashboardStats}
          // R15: RightRail dünya bazlı çalışsın diye themeFilter geçiyoruz.
          // Search/status/type/eastSubFilter'a kasıtlı olarak duyarsız.
          themeFilter={themeFilter}
          onOpenDetail={handleOpenDetailModal}
        />
      )}

      {/* Medya Ekle / Düzenle Modalı */}
      <MediaModal
        isOpen={isModalOpen}
        editingItem={editingItem}
        onSave={handleSaveMedia}
        onClose={() => {
          setIsModalOpen(false);
          setEditingItem(null);
        }}
      />

      {/* Medya Detay Modalı */}
      <MediaDetailModal
        media={detailMedia}
        progressLogs={progressLogs.filter(l => l.mediaId === detailMediaId)}
        open={!!detailMediaId}
        onClose={() => setDetailMediaId(null)}
        onEdit={handleOpenEditModal}
        onDelete={handleDeleteRequest}
        onToggleFavorite={handleToggleFavorite}
        onIncrementProgress={handleIncrement}
        onComplete={handleComplete}
        // R21: detay modalına da hızlı rating bağlandı; MediaCard ile aynı handler.
        onUpdateRating={handleUpdateRating}
      />

      {/* Onay Penceresi (Sil / Sıfırla) */}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((s) => ({ ...s, isOpen: false }))}
      />
      {/* Hızlı Ekleme Modalı */}
      <QuickAddModal
        isOpen={!!pendingQuickAdd}
        payload={pendingQuickAdd}
        onSave={(items) => {
          // V2.2 defense-in-depth: zaten library'de olan id'leri kesinlikle override etme.
          // Modal locked listesi düzgün çalışsa bile, herhangi bir yoldan locked item submit'e
          // sızarsa burada skip edilir.
          const existingIds = new Set(mediaList.map((m) => m.id));
          const safeItems = items.filter((item) => !existingIds.has(item.id));
          safeItems.forEach((item) => handleSaveMedia(item));
          setPendingQuickAdd(null);
        }}
        onClose={() => setPendingQuickAdd(null)}
      />
      {/* V4: Manuel Grup Yönetimi Modalı */}
      <ManualGroupModal
        isOpen={groupEditingItemId !== null}
        item={
          groupEditingItemId
            ? mediaList.find((m) => m.id === groupEditingItemId) ?? null
            : null
        }
        mediaList={mediaList}
        onSave={handleCommitGroupAction}
        onClose={() => setGroupEditingItemId(null)}
      />
    </div>
  );
}
