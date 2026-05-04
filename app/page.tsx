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
import AppHeader from "@/components/app-header";
import { TabType } from "@/components/app-tabs";
import ActivityLogPanel from "@/components/activity-log-panel";
import MediaFilters from "@/components/media-filters";
import MediaCard from "@/components/media-card";
import MediaModal from "@/components/media-modal";
import MediaDetailModal from "@/components/media-detail-modal";
import ConfirmDialog from "@/components/confirm-dialog";
import TvmazeSearch from "@/components/tvmaze-search";
import AniListSearch from "@/components/anilist-search";
import OpenLibrarySearch from "@/components/openlibrary-search";
import OnlineSearch from "@/components/online-search";
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
import EnhancedDashboard from "@/components/enhanced-dashboard";
import { ChevronDown, ChevronUp, Search, Plus } from "lucide-react";
import { GlobalSearchResult } from "@/lib/global-search-types";
import { mockMediaList } from "@/lib/mock-media";
import { loadMediaList, saveMediaList, clearMediaList, loadProgressLogs, saveProgressLogs } from "@/lib/storage";
import { getIncrementAmount, getProgressLabel, getProgressUnit, getStatusLabel } from "@/lib/progress";
import { MediaItem, MediaType, MediaStatus, ProgressLog } from "@/lib/types";
import { calculateDashboardStats } from "@/lib/dashboard-stats";
import { TvmazeNormalizedDetail } from "@/lib/tvmaze-types";
import { OpenLibraryNormalizedResult } from "@/lib/openlibrary-types";
import { AniListNormalizedResult } from "@/lib/anilist-types";

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
  // Arama çubuğundaki metin
  const [searchQuery, setSearchQuery] = useState("");
  // Seçili medya türü filtresi
  const [typeFilter, setTypeFilter] = useState<MediaType | "all">("all");
  // Seçili durum filtresi
  const [statusFilter, setStatusFilter] = useState<MediaStatus | "active" | "all">("all");

  // Gelişmiş aramaları (eski panelleri) gösterme durumu
  const [showAdvancedSearches, setShowAdvancedSearches] = useState(false);

  // Modal durumları
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MediaItem | null>(null);
  const [detailMediaId, setDetailMediaId] = useState<string | null>(null);
  const [pendingQuickAdd, setPendingQuickAdd] = useState<{
    singleItem: MediaItem;
    seasonItems: MediaItem[] | null;
  } | null>(null);

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

  // ---- EYLEMLER (Actions) ----

  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
    setDetailMediaId(null);
    setEditingItem(null);
    setIsModalOpen(false);
  }, []);

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
    if (!item || item.currentProgress >= item.totalProgress) return;

    const amount = getIncrementAmount(item.type);
    if (amount === 0) return;

    const prevProgress = item.currentProgress;
    const newProgress = Math.min(item.currentProgress + amount, item.totalProgress);
    const newStatus = newProgress >= item.totalProgress ? "completed" : item.status;
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
    if (!item || item.currentProgress >= item.totalProgress) return;

    const prevProgress = item.currentProgress;
    const newProgress = item.totalProgress;
    const updated: MediaItem = { ...item, currentProgress: newProgress, status: "completed" };

    setMediaList((prev) => prev.map((m) => (m.id === id ? updated : m)));
    enqueueMediaUpsert(updated);

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
    const exists = mediaList.find((m) => m.id === item.id);
    let logPayload: LogPayload | null = null;
    let mergedItem: MediaItem = item;
    if (exists) {
      mergedItem = { ...exists, ...item };
      if (exists.currentProgress !== item.currentProgress) {
        logPayload = {
          id: item.id,
          title: item.title,
          type: item.type,
          action: "manual_adjust",
          amount: Math.abs(item.currentProgress - exists.currentProgress),
          prevProgress: exists.currentProgress,
          newProgress: item.currentProgress,
        };
      }
      setMediaList((prev) => prev.map((m) => (m.id === item.id ? mergedItem : m)));
    } else {
      logPayload = {
        id: item.id,
        title: item.title,
        type: item.type,
        action: "added",
        amount: item.currentProgress,
        prevProgress: 0,
        newProgress: item.currentProgress,
        detail: buildAddedLogDetail(item),
      };
      setMediaList((prev) => [...prev, item]);
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
    setMediaList(items);
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
      return mediaList.some(
        (m) =>
          m.externalSource === externalSource &&
          (
            m.externalId === externalId ||
            (externalSource === "tvmaze" &&
              typeof m.externalId === "string" &&
              m.externalId.startsWith(`${externalId}-season-`))
          )
      );
    },
    [mediaList]
  );

  const buildTvmazeLibraryItems = useCallback((detail: TvmazeNormalizedDetail): MediaItem[] => {
    const coverImage = detail.coverUrl || "/placeholders/tv.svg";
    const seasonEntries = (detail.seasonBreakdown || []).filter((entry) => entry.episodes > 0);

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
      externalId: `${detail.externalId}-season-${seasonEntry.season}`,
      overview: detail.overview,
      releaseYear: detail.releaseYear,
      numberOfSeasons: 1,
      numberOfEpisodes: seasonEntry.episodes,
      tvmazeStatus: detail.tvmazeStatus,
      lastAirDate: detail.lastAirDate,
      nextAirDate: detail.nextAirDate,
      genres: detail.genres,
      language: detail.language,
      seasonBreakdown: [seasonEntry],
    }));
  }, []);

  /**
   * TVmaze detay sonucunu kullanıcının medya listesine ekler.
   * TvmazeNormalizedDetail → MediaItem dönüşümü burada yapılır.
   */
  const handleAddFromTvmaze = useCallback(
    (detail: TvmazeNormalizedDetail) => {
      // Zaten eklenmişse tekrar ekleme
      if (isInLibrary("tvmaze", detail.externalId)) return;

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

      const isMultiSeason = !!(detail.seasonBreakdown && detail.seasonBreakdown.length > 1);
      setPendingQuickAdd({
        singleItem: newItem,
        seasonItems: isMultiSeason ? buildTvmazeLibraryItems(detail) : null,
      });
    },
    [buildTvmazeLibraryItems, isInLibrary]
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
      };

      setPendingQuickAdd({ singleItem: newItem, seasonItems: null });
    },
    [isInLibrary]
  );

  /**
   * Global Search'ten dönen sonucu doğru formata çevirip ekler.
   */
  const handleAddFromGlobalSearch = useCallback(
    async (item: GlobalSearchResult) => {
      try {
        if (item.source === "tvmaze") {
          // TVmaze araması sadece yüzeysel veri döner, bölüm sayısı için detaya inmemiz gerekir
          const res = await fetch(`/api/tvmaze/details?id=${item.externalId}`);
          if (!res.ok) throw new Error("TVmaze detay verisi alınamadı");
          const detail = await res.json();
          handleAddFromTvmaze(detail);
        } else if (item.source === "anilist") {
          // AniList arama sonucu yeterli detaya sahip
          handleAddFromAniList(item.raw as AniListNormalizedResult);
        } else if (item.source === "openlibrary") {
          // Open Library arama sonucu yeterli detaya sahip
          handleAddFromOpenLibrary(item.raw as OpenLibraryNormalizedResult);
        }
      } catch (err) {
        console.error("Global search ekleme hatası:", err);
        alert("Ekleme sırasında bir hata oluştu. Lütfen tekrar deneyin.");
      }
    },
    [handleAddFromTvmaze, handleAddFromAniList, handleAddFromOpenLibrary]
  );

  // ---- FİLTRELEME ----
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

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [mediaList, searchQuery, typeFilter, statusFilter]);

  // ---- İSTATİSTİKLER ----
  const dashboardStats = useMemo(() => {
    return calculateDashboardStats(mediaList, progressLogs);
  }, [mediaList, progressLogs]);

  // ---- RENDER ----

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Yükleniyor...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Üst başlık ve Sekmeler */}
      <AppHeader activeTab={activeTab} onChangeTab={handleTabChange} />

      {/* Ana içerik alanı */}
      <main className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        
        {/* DASHBOARD SEKMESI */}
        {activeTab === "dashboard" && (
          <EnhancedDashboard 
            stats={dashboardStats} 
            onSelectMedia={handleOpenDetailModal}
            onIncrement={handleIncrement}
            onComplete={handleComplete}
            onEdit={handleOpenEditModal}
            onToggleFavorite={handleToggleFavorite}
            onDeleteMedia={handleDeleteRequest}
          />
        )}

        {/* KÜTÜPHANEM SEKMESI */}
        {activeTab === "library" && (
          <div className="space-y-6">
            {/* Arama ve Ekleme Alanı */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="relative flex-1 w-full sm:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Kütüphanende ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all"
                />
              </div>
              <button
                onClick={handleOpenAddModal}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40 hover:bg-violet-500/30 transition-colors w-full sm:w-auto cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Medya Ekle</span>
              </button>
            </div>

            {/* Filtreler */}
            <MediaFilters
              activeType={typeFilter}
              activeStatus={statusFilter}
              onTypeChange={setTypeFilter}
              onStatusChange={setStatusFilter}
            />

            <div className="mb-4">
              <p className="text-sm text-zinc-500">
                <span className="text-zinc-300 font-medium">
                  {filteredMedia.length}
                </span>{" "}
                medya gösteriliyor
              </p>
            </div>

            {filteredMedia.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredMedia.map((item) => (
                  <MediaCard
                    key={item.id}
                    item={item}
                    onIncrement={handleIncrement}
                    onComplete={handleComplete}
                    onEdit={handleOpenEditModal}
                    onDelete={handleDeleteRequest}
                    onToggleFavorite={handleToggleFavorite}
                    onOpenDetail={handleOpenDetailModal}
                  />
                ))}
              </div>
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
          <div className="space-y-8">
            <GlobalSearch
              isInLibrary={isInLibrary}
              onAddToLibrary={handleAddFromGlobalSearch}
            />
            <div>
              <button
                onClick={() => setShowAdvancedSearches(!showAdvancedSearches)}
                className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/50 border border-zinc-800/50 rounded-xl text-sm font-medium text-zinc-300 hover:bg-zinc-800/50 transition-colors cursor-pointer"
              >
                Gelişmiş Kaynak Aramaları (Eski Paneller)
                {showAdvancedSearches ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
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
                  <OnlineSearch />
                </div>
              )}
            </div>
          </div>
        )}

        {/* AKTİVİTE SEKMESI */}
        {activeTab === "activity" && (
          <ActivityLogPanel progressLogs={progressLogs} />
        )}

        {/* AYARLAR SEKMESI */}
        {activeTab === "settings" && (
          <div className="space-y-8 max-w-3xl mx-auto">
            {/* Cloud Sync Hazırlık Durumu */}
            <CloudSyncStatusCard />

            {/* Hesap (Auth) */}
            <AuthPanel />

            {/* Cloud Veri Durumu (sayım + akıllı öneri + aktarım) */}
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

            {/* Uygulama Bilgisi & Credits */}
            <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800/50 p-6 mb-8">
              <h3 className="text-lg font-semibold text-zinc-100 mb-4">Uygulama Bilgisi</h3>
              <div className="space-y-4 text-sm text-zinc-400">
                <p>
                  <strong>MediaTracker</strong> tüm verileri tarayıcınızın yerel depolama alanında (localStorage) tutar. Verileriniz hiçbir dış sunucuya gönderilmez veya bir veritabanına kaydedilmez.
                </p>
                <div className="h-px bg-zinc-800/50 my-4" />
                <h4 className="font-medium text-zinc-300">Veri Kaynakları (APIs)</h4>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    TV show data powered by <a href="https://www.tvmaze.com/" target="_blank" rel="noopener noreferrer" className="text-zinc-300 hover:text-violet-400 underline underline-offset-2">TVmaze</a>.
                  </li>
                  <li>
                    Anime and manga data from <a href="https://anilist.co/" target="_blank" rel="noopener noreferrer" className="text-zinc-300 hover:text-violet-400 underline underline-offset-2">AniList</a>.
                  </li>
                  <li>
                    Book data from <a href="https://openlibrary.org/" target="_blank" rel="noopener noreferrer" className="text-zinc-300 hover:text-violet-400 underline underline-offset-2">Open Library</a>.
                  </li>
                  <li>
                    This product uses the <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" className="text-zinc-300 hover:text-violet-400 underline underline-offset-2">TMDB API</a> but is not endorsed or certified by TMDB. 
                    <br/><span className="text-xs text-zinc-500 italic">Not: Film araması geçici olarak devre dışı. TMDB erişimi düzeldiğinde aktif edilebilir.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

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
          items.forEach((item) => handleSaveMedia(item));
          setPendingQuickAdd(null);
        }}
        onClose={() => setPendingQuickAdd(null)}
      />
    </div>
  );
}
