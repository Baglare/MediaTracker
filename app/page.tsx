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
import AppTabContent from "@/components/app-tab-content";
import ProfileSettingsCard from "@/components/profile-settings-card";
import SocialProfileEditor from "@/components/social/social-profile-editor";
import { ProfileAvatar } from "@/components/sidebar-profile-card";
import RightRail from "@/components/right-rail";
import PageHeader from "@/components/page-header";
import { TabType } from "@/components/app-tabs";
// MediaFilters artık LibraryControlBar tarafından sarmalanıyor; burada
// yalnızca type re-export'lar gerekli.
// R18.1: Durum filtresi WorldHero altında bağımsız bir satır; bu yüzden
// `StatusFilterRow`'u doğrudan burada da tüketiyoruz.
import { StatusFilterRow } from "@/components/media-filters";
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
import { useAuth } from "@/hooks/use-auth";
import { useMediaLibrary } from "@/hooks/use-media-library";
import { usePersistedPreferences } from "@/hooks/use-persisted-preferences";
import { useSocialAvatar } from "@/hooks/use-social-avatar";
import QuickAddModal from "@/components/quick-add-modal";
import ManualGroupModal, {
  type ManualGroupAction,
  generateManualGroupId,
} from "@/components/manual-group-modal";
import {
  DistributionBar,
  PersonalControls,
  PersonalEmptyState,
  PersonalMetricCard,
} from "@/components/personal-tab-ui";
import {
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  PlayCircle,
  Layers,
  Library as LibraryIcon,
  Compass,
  Calendar,
  TrendingUp,
  Heart,
  ListChecks,
  Star,
  NotebookPen,
  BarChart3,
  Search,
  UserRound,
  Pencil,
} from "lucide-react";
import LibraryControlBar, {
  LibrarySectionControls,
} from "@/components/library-control-bar";
import { GlobalSearchCategory, GlobalSearchLibraryStatus, GlobalSearchResult } from "@/lib/global-search-types";
import {
  resolveProfileDisplayName,
  resolveProfileTagline,
  resolveSelectedTitle,
} from "@/lib/profile-preferences";
import { MediaItem, MediaType, ProgressLog, withMediaClassification } from "@/lib/types";
import {
  getTvmazeSeasonExternalId,
  getTvmazeSeasonNumber,
  getTvmazeShowExternalId,
  groupMediaItems,
  resolveAniListSeriesGroup,
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
  const {
    mediaList,
    progressLogs,
    isLoaded,
    incrementMedia: handleIncrement,
    completeMedia: handleComplete,
    saveMedia,
    deleteMedia,
    toggleFavorite: handleToggleFavorite,
    updateRating: handleUpdateRating,
    commitMediaChanges,
    importMedia,
    resetMedia,
  } = useMediaLibrary(authUser?.id ?? null);

  // ---- STATE (Durumlar) ----
  // Aktif sekme
  const [activeTab, setActiveTab] = useState<TabType>("dashboard");
  const {
    profilePreferences,
    setProfilePreferences,
    rightRailPreferences,
    setRightRailPreferences,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    themeFilter,
    eastSubFilter,
    setEastSubFilter,
    librarySort,
    setLibrarySort,
    libraryView,
    setLibraryView,
    continueSectionOpen,
    setContinueSectionOpen,
    seriesSectionOpen,
    setSeriesSectionOpen,
    worldTransition,
    handleThemeFilterChange,
  } = usePersistedPreferences();
  // Arama çubuğundaki metin (R18: kasıtlı olarak persist edilmiyor)
  const [searchQuery, setSearchQuery] = useState("");

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
  const [profileMode, setProfileMode] = useState<"view" | "edit">("view");

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

  // ---- EYLEMLER (Actions) ----

  const handleTabChange = useCallback((tab: TabType) => {
    // R40 — AI sekmesi terkedildiğinde otomatik reset KALDIRILDI; oturum
    // kullanıcı "Konuyu kapat" diyene kadar yaşamaya devam eder.
    if (tab === "profile") {
      setProfileMode("view");
    }
    setActiveTab(tab);
    setDetailMediaId(null);
    setEditingItem(null);
    setIsModalOpen(false);
  }, []);

  const handleOpenAiDiscover = useCallback((title: string, mediaType: MediaType) => {
    const category: GlobalSearchCategory =
      mediaType === "movie" ? "movie"
      : mediaType === "tv" ? "tv"
      : mediaType === "anime" ? "anime"
      : mediaType === "manga" || mediaType === "manhwa" || mediaType === "manhua" ? "manga"
      : mediaType === "light_novel" || mediaType === "web_novel" || mediaType === "visual_novel" ? "novel"
      : mediaType === "book" ? "book"
      : "all";
    setDiscoverPrefill((previous) => ({
      query: title,
      category,
      token: (previous?.token ?? 0) + 1,
    }));
    handleTabChange("discover");
  }, [handleTabChange]);

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
    saveMedia(item);
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
        deleteMedia(id);
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

      commitMediaChanges(nextList, touched);

      // 3) Modal'ı kapat
      setGroupEditingItemId(null);
    },
    [commitMediaChanges, mediaList]
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
        resetMedia();
        setConfirmState((s) => ({ ...s, isOpen: false }));
      },
    });
  }

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
  // çok küçük çöz" kuralı gereği bu iki uyarı bilinçli susturuldu.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  function getTvmazeItemsForShow(showId: string) {
    return mediaList.filter((item) => getTvmazeShowExternalId(item) === showId);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
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

        commitMediaChanges(nextList, patchedItems);
      }

      setPendingQuickAdd({ singleItem: newItem, seasonItems: null });
    },
    [commitMediaChanges, isInLibrary, mediaList]
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
    return resolveProfileDisplayName(profilePreferences, authUser);
  }, [profilePreferences, authUser]);

  const profileTagline = useMemo(() => {
    return resolveProfileTagline(profilePreferences);
  }, [profilePreferences]);

  const journeyTitle = useMemo(() => {
    return resolveSelectedTitle(profilePreferences, userProgression.title);
  }, [profilePreferences, userProgression.title]);

  const socialAvatar = useSocialAvatar(authConfigured, authUser?.id ?? null);

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
    activeTab === "settings" || activeTab === "profile"
      ? "neutral"
      : themeFilter === "east"
        ? "east"
        : themeFilter === "screen"
          ? "screen"
        : themeFilter === "library"
          ? "arch"
          : "neutral";
  const shouldShowRightRail = !["dashboard", "ai", "settings", "profile"].includes(activeTab);

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
        onOpenProfile={() => handleTabChange("profile")}
        onOpenSettings={() => handleTabChange("settings")}
        profileName={profileName}
        profileTagline={profileTagline}
        profilePreferences={profilePreferences}
        socialAvatarUrl={socialAvatar.socialAvatarUrl}
        progression={userProgression}
        journeyTitle={journeyTitle}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <AppTopbar
          activeTab={activeTab}
          onChangeTab={handleTabChange}
          onOpenProfile={() => handleTabChange("profile")}
          profileName={profileName}
          profilePreferences={profilePreferences}
          socialAvatarUrl={socialAvatar.socialAvatarUrl}
        />

        {/* Ana içerik alanı.
            R6: Shell zaten sidebar+rail ile column genişliğini kontrol ettiği
            için max-w-7xl + mx-auto kalktı; içerik sütununu boğmuyor.
            xl'de horizontal padding biraz daraltıldı (rail ile nefes alsın). */}
        <main className={`relative w-full px-4 sm:px-6 lg:px-8 py-6 lg:py-8 flex-1 min-w-0 ${shouldShowRightRail ? "xl:px-6" : "xl:px-8 2xl:px-10"}`}>
        <AppTabContent
          activeTab={activeTab}
          mediaList={mediaList}
          progressLogs={progressLogs}
          dashboardStats={dashboardStats}
          mediaActions={{
            onSelectMedia: handleOpenDetailModal,
            onIncrement: handleIncrement,
            onComplete: handleComplete,
            onEdit: handleOpenEditModal,
            onToggleFavorite: handleToggleFavorite,
            onDeleteMedia: handleDeleteRequest,
            onUpdateRating: handleUpdateRating,
          }}
          onAddFromGlobalSearch={handleAddFromGlobalSearch}
          onOpenAiDiscover={handleOpenAiDiscover}
          settings={{
            user: authUser,
            configured: authConfigured,
            rightRailPreferences,
            onRightRailPreferencesChange: setRightRailPreferences,
            onReplaceData: importMedia,
            onReset: handleResetRequest,
            onConfirm: openConfirmDialog,
          }}
        />

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

        {/* PROFIL SEKMESI */}
        {activeTab === "profile" && (
          <div className="space-y-5 max-w-[96rem]">
            <PageHeader
              icon={UserRound}
              title="Profil"
              subtitle="Görünen ad, avatar, ünvan ve yolculuk kimliği"
            />

            {profileMode === "view" ? (() => {
              const favoriteShowcase = mediaList
                .filter((item) => item.favorite === true)
                .slice()
                .sort((a, b) => a.title.localeCompare(b.title, "tr"))
                .slice(0, 10);
              const recentProfileLogs = progressLogs
                .slice()
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 6);
              const ratedItems = mediaList.filter(
                (item) => typeof item.userRating === "number" && Number.isFinite(item.userRating)
              );
              const averageRating =
                ratedItems.length > 0
                  ? ratedItems.reduce((sum, item) => sum + (item.userRating ?? 0), 0) / ratedItems.length
                  : 0;
              const maxWorldCount = Math.max(
                1,
                userProgression.worldCounts.east,
                userProgression.worldCounts.screen,
                userProgression.worldCounts.arch
              );
              const worldRows = [
                { label: "Doğu", value: userProgression.worldCounts.east, bar: "bg-amber-300" },
                { label: "Kadraj", value: userProgression.worldCounts.screen, bar: "bg-cyan-300" },
                { label: "Arşiv", value: userProgression.worldCounts.arch, bar: "bg-orange-300" },
              ];
              const tierLabels = {
                basic: "Basic",
                refined: "Refined",
                elite: "Elite",
                master: "Master",
              } as const;
              const worldAccent = {
                east: {
                  line: "via-amber-300/70",
                  border: "border-amber-500/30",
                  borderStrong: "border-amber-400/45",
                  shadow: "shadow-amber-950/20",
                  badge: "bg-amber-500/12 text-amber-200 ring-amber-500/25",
                  mutedBadge: "bg-zinc-950/45 text-amber-100 ring-amber-500/20",
                  progress: "from-amber-300 via-yellow-400 to-amber-500",
                },
                screen: {
                  line: "via-cyan-300/70",
                  border: "border-cyan-500/30",
                  borderStrong: "border-cyan-300/45",
                  shadow: "shadow-cyan-950/20",
                  badge: "bg-cyan-500/12 text-cyan-200 ring-cyan-500/25",
                  mutedBadge: "bg-zinc-950/45 text-cyan-100 ring-cyan-500/20",
                  progress: "from-cyan-300 via-sky-400 to-blue-500",
                },
                arch: {
                  line: "via-orange-300/70",
                  border: "border-orange-500/30",
                  borderStrong: "border-orange-300/45",
                  shadow: "shadow-orange-950/20",
                  badge: "bg-orange-500/12 text-orange-200 ring-orange-500/25",
                  mutedBadge: "bg-zinc-950/45 text-orange-100 ring-orange-500/20",
                  progress: "from-orange-300 via-amber-400 to-red-500",
                },
                mixed: {
                  line: "via-violet-300/70",
                  border: "border-violet-500/25",
                  borderStrong: "border-violet-300/40",
                  shadow: "shadow-violet-950/20",
                  badge: "bg-violet-500/12 text-violet-200 ring-violet-500/25",
                  mutedBadge: "bg-zinc-950/45 text-violet-100 ring-violet-500/20",
                  progress: "from-violet-300 via-zinc-300 to-cyan-300",
                },
              }[userProgression.dominantWorld];
              const tierFrame = {
                basic: "border-zinc-800/60 shadow-black/20",
                refined: `${worldAccent.border} shadow-lg ${worldAccent.shadow}`,
                elite: `${worldAccent.border} shadow-lg ${worldAccent.shadow} ring-1 ring-zinc-800/80`,
                master: `${worldAccent.borderStrong} shadow-xl ${worldAccent.shadow} ring-1 ring-zinc-700/80`,
              }[userProgression.tier];
              const tierMotifOpacity = {
                basic: "opacity-60",
                refined: "opacity-75",
                elite: "opacity-90",
                master: "opacity-100",
              }[userProgression.tier];
              const profileActionLabel = (action: ProgressLog["action"]) => {
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
              <>
              <section className={`relative overflow-hidden rounded-2xl border bg-[linear-gradient(135deg,rgba(39,39,42,0.58),rgba(9,9,11,0.72))] p-5 sm:p-6 lg:p-7 min-w-0 ${tierFrame}`}>
                <div
                  aria-hidden
                  className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${worldAccent.line} to-transparent ${tierMotifOpacity}`}
                />

                <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 flex-col sm:flex-row sm:items-center gap-5">
                    <div className="rounded-3xl bg-zinc-950/45 p-2 ring-1 ring-zinc-800/70 shadow-inner shadow-black/30">
                      <ProfileAvatar profileName={profileName} preferences={profilePreferences} socialAvatarUrl={socialAvatar.socialAvatarUrl} size="lg" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                        Profil vitrini
                      </p>
                      <h2 className="mt-2 truncate text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
                        {profileName}
                      </h2>
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400">
                        {profileTagline}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${worldAccent.badge}`}>
                          Level {userProgression.level}
                        </span>
                        <span className={`rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] ring-1 ${worldAccent.mutedBadge}`}>
                          {tierLabels[userProgression.tier]}
                        </span>
                        <span className="rounded-full bg-zinc-950/45 px-3 py-1.5 text-xs font-medium text-zinc-200 ring-1 ring-zinc-800/70">
                          {journeyTitle}
                        </span>
                        <span className="rounded-full bg-zinc-950/45 px-3 py-1.5 text-xs font-medium text-zinc-400 ring-1 ring-zinc-800/70">
                          {userProgression.dominantWorld === "east"
                            ? "Doğu"
                            : userProgression.dominantWorld === "screen"
                              ? "Kadraj"
                              : userProgression.dominantWorld === "arch"
                                ? "Arşiv"
                                : "Karma"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex w-full shrink-0 flex-col gap-4 border-t border-zinc-800/60 pt-4 lg:w-72 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                    <button
                      type="button"
                      onClick={() => setProfileMode("edit")}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-amber-500/15 px-4 text-sm font-semibold text-amber-200 ring-1 ring-amber-500/30 transition-colors hover:bg-amber-500/20 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      Profili Düzenle
                    </button>

                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                          XP ilerleme
                        </p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">
                          {Math.round(userProgression.progressPercent * 100)}%
                        </p>
                      </div>
                      <p className="text-right text-[11px] font-mono tabular-nums text-zinc-500">
                        {userProgression.currentLevelXp}/{userProgression.nextLevelXp}
                      </p>
                    </div>
                    <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-zinc-900 ring-1 ring-zinc-800/80">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${worldAccent.progress}`}
                        style={{ width: `${Math.round(userProgression.progressPercent * 100)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">
                      Sonraki seviyeye {Math.max(0, userProgression.nextLevelXp - userProgression.currentLevelXp)} XP
                    </p>
                  </div>
                </div>

                <div className="relative mt-6 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-zinc-800/60 pt-4 lg:grid-cols-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Toplam XP</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">{userProgression.totalXp}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Doğu</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">{userProgression.worldCounts.east}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Kadraj</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">{userProgression.worldCounts.screen}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Arşiv</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">{userProgression.worldCounts.arch}</p>
                  </div>
                </div>
              </section>
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)] gap-5 items-start">
                <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-4 sm:p-5 min-w-0">
                  <div className="flex items-end justify-between gap-3 mb-4">
                    <div>
                      <h2 className="text-sm font-semibold text-zinc-100">Favori Vitrini</h2>
                      <p className="mt-1 text-xs text-zinc-500">
                        Öne çıkan favori içerikler
                      </p>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-zinc-500">
                      {favoriteShowcase.length}
                    </span>
                  </div>
                  {favoriteShowcase.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-zinc-800/80 bg-zinc-950/25 px-4 py-8 text-center">
                      <p className="text-sm font-medium text-zinc-300">Henüz favori vitrin yok</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Favori işaretlediğin içerikler burada poster vitrini olarak görünür.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                      {favoriteShowcase.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleOpenDetailModal(item)}
                          className="group min-w-0 text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40 rounded-xl"
                          title={item.title}
                        >
                          <div className="aspect-[2/3] overflow-hidden rounded-xl border border-zinc-800/70 bg-zinc-950/45 shadow-sm shadow-black/20 transition-colors group-hover:border-amber-400/35">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.coverImage || "/placeholders/book.svg"}
                              alt=""
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                              loading="lazy"
                            />
                          </div>
                          <p className="mt-2 truncate text-[11px] font-medium text-zinc-300">
                            {item.title}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-4 sm:p-5 min-w-0">
                  <div className="flex items-end justify-between gap-3 mb-4">
                    <div>
                      <h2 className="text-sm font-semibold text-zinc-100">Son Aktiviteler</h2>
                      <p className="mt-1 text-xs text-zinc-500">
                        En yeni ilerleme kayıtları
                      </p>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-zinc-500">
                      {recentProfileLogs.length}
                    </span>
                  </div>
                  {recentProfileLogs.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-zinc-800/80 bg-zinc-950/25 px-4 py-8 text-center">
                      <p className="text-sm font-medium text-zinc-300">Henüz aktivite yok</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        İlerleme kaydettikçe son hareketlerin burada görünür.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recentProfileLogs.map((log) => (
                        <div key={log.id} className="rounded-xl border border-zinc-800/60 bg-zinc-950/25 p-3 min-w-0">
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-[12px] font-medium text-zinc-200">{log.mediaTitle}</p>
                            <span className="shrink-0 rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-500 ring-1 ring-zinc-800/70">
                              {profileActionLabel(log.action)}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-[11px] text-zinc-500">
                            {new Date(log.createdAt).toLocaleDateString("tr-TR")}
                            {log.detail ? ` · ${log.detail}` : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-5 items-start">
                <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-4 sm:p-5 min-w-0">
                  <h2 className="text-sm font-semibold text-zinc-100">Medya Kimliği</h2>
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-4">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Toplam</p>
                      <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-100">{dashboardStats.totalItems}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Tamamlanan</p>
                      <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-100">{dashboardStats.completedItems}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Devam</p>
                      <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-100">{dashboardStats.inProgressItems}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Ortalama</p>
                      <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-100">
                        {ratedItems.length > 0 ? averageRating.toFixed(1) : "—"}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Favori</p>
                      <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-100">{dashboardStats.favoriteItems}</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-4 sm:p-5 min-w-0">
                  <h2 className="text-sm font-semibold text-zinc-100">Dünya Dağılımı</h2>
                  <div className="mt-4 space-y-3">
                    {worldRows.map((row) => {
                      const width = row.value > 0 ? Math.max(5, Math.round((row.value / maxWorldCount) * 100)) : 0;
                      return (
                        <div key={row.label} className="min-w-0">
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <span className="text-[12px] text-zinc-300">{row.label}</span>
                            <span className="text-[12px] font-mono tabular-nums text-zinc-500">{row.value}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-zinc-950/60 ring-1 ring-zinc-800/70">
                            <div className={`h-full rounded-full ${row.bar}`} style={{ width: `${width}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
              </>
              );
            })() : (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-300/80">
                      Düzenleme
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-zinc-100">Profil kimliğini düzenle</h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      Değişiklikler bu tarayıcıdaki yerel profil tercihine anlık kaydedilir.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProfileMode("view")}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/35 px-4 text-sm font-medium text-zinc-300 transition-colors hover:border-amber-500/35 hover:bg-amber-500/10 hover:text-amber-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Vitrine dön
                  </button>
                </div>
                <ProfileSettingsCard
                  preferences={profilePreferences}
                  profileName={profileName}
                  automaticTitle={userProgression.title}
                  onChange={setProfilePreferences}
                  authenticated={Boolean(authUser)}
                  userId={authUser?.id ?? null}
                  hasSocialProfile={socialAvatar.hasSocialProfile}
                  socialAvatarUrl={socialAvatar.socialAvatarUrl}
                  onSocialAvatarChanged={socialAvatar.updateSocialAvatar}
                />
                <SocialProfileEditor
                  authConfigured={authConfigured}
                  authenticated={Boolean(authUser)}
                  localPreferences={profilePreferences}
                  profileName={profileName}
                  selectedTitle={journeyTitle}
                  media={mediaList}
                  progression={userProgression}
                  socialAvatarUrl={socialAvatar.socialAvatarUrl}
                  onProfileChanged={socialAvatar.refresh}
                />
              </div>
            )}
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
          preferences={rightRailPreferences}
          progression={userProgression}
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
