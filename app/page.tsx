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
import { type ThemeFilter, type EastSubFilter } from "@/components/media-filters";
import EastThemeHeader from "@/components/east-theme-header";
import MediaCard from "@/components/media-card";
import SeriesGroupCard from "@/components/series-group-card";
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
  Sparkles,
  Activity as ActivityIcon,
  Settings as SettingsIcon,
} from "lucide-react";
import LibraryControlBar, {
  LibrarySectionControls,
  type LibrarySort,
  type LibraryView,
} from "@/components/library-control-bar";
import { GlobalSearchLibraryStatus, GlobalSearchResult } from "@/lib/global-search-types";
import { mockMediaList } from "@/lib/mock-media";
import { loadMediaList, saveMediaList, clearMediaList, loadProgressLogs, saveProgressLogs } from "@/lib/storage";
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
import { TvmazeNormalizedDetail } from "@/lib/tvmaze-types";
import { OpenLibraryNormalizedResult } from "@/lib/openlibrary-types";
import { AniListNormalizedResult } from "@/lib/anilist-types";
import { OmdbNormalizedResult } from "@/lib/omdb-types";

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
  // V5A.1: Üst seviye theme mode filtresi (Tümü / Doğu / Ekran / Kütüphane)
  const [themeFilter, setThemeFilter] = useState<ThemeFilter>("all");
  // V5A.1: Doğu seçiliyken aktif alt filtre (Tümü / Anime / Manga / Novel)
  const [eastSubFilter, setEastSubFilter] = useState<EastSubFilter>("all");
  // R5: Kütüphanem singleton bölümü için sıralama + görünüm tercihi.
  // Sadece üçüncü bölümü (tekil item'lar) etkiler; "Devam Ettiklerim" ve
  // "Seri Koleksiyonlarım" kendi sıralamasını korur.
  const [librarySort, setLibrarySort] = useState<LibrarySort>("recent");
  const [libraryView, setLibraryView] = useState<LibraryView>("grid");

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
  };

  // Gelişmiş aramaları (eski panelleri) gösterme durumu
  const [showAdvancedSearches, setShowAdvancedSearches] = useState(false);

  // AI Danışman sekmesi dışına çıkıldığında aktif sohbeti sıfırlamak için sinyal
  const [aiResetSignal, setAiResetSignal] = useState(0);

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

  // ---- EYLEMLER (Actions) ----

  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab((prev) => {
      if (prev === "ai" && tab !== "ai") {
        setAiResetSignal((s) => s + 1);
      }
      return tab;
    });
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
    const inLibrary = isInLibrary(item.source, item.externalId);

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
        }
      } catch (err) {
        console.error("Global search ekleme hatası:", err);
        alert("Ekleme sırasında bir hata oluştu. Lütfen tekrar deneyin.");
      }
    },
    [handleAddFromTvmaze, handleAddFromAniList, handleAddFromOpenLibrary, handleAddFromOmdb]
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

      // V5A.1: Theme mode + Doğu alt filtresi.
      // Eski item'larda theme/mediaType eksik olabilir; classification akışını
      // bozmamak için withMediaClassification ile fallback değerleri okuyoruz.
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
          matchesTheme = cls.mediaType === "tv" || cls.mediaType === "movie";
        } else if (themeFilter === "library") {
          // Kütüphane sadece kitap ailesi; novel'lar Doğu altına düştüğü için burada yok.
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

  // ---- RENDER ----

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Yükleniyor...</p>
      </div>
    );
  }

  return (
    // R1 App Shell: sol sidebar (lg+) + main column + opsiyonel sağ rail (xl+).
    // Mobile/tablet'te sidebar gizli; AppTopbar fallback AppTabs gösterir.
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      <AppSidebar activeTab={activeTab} onChange={handleTabChange} />

      <div className="flex-1 min-w-0 flex flex-col">
        <AppTopbar activeTab={activeTab} onChangeTab={handleTabChange} />

        {/* Ana içerik alanı.
            R6: Shell zaten sidebar+rail ile column genişliğini kontrol ettiği
            için max-w-7xl + mx-auto kalktı; içerik sütununu boğmuyor.
            xl'de horizontal padding biraz daraltıldı (rail ile nefes alsın). */}
        <main className="relative w-full px-4 sm:px-6 lg:px-8 xl:px-6 py-6 lg:py-8 flex-1 min-w-0">
        
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
              onSelectMedia={handleOpenDetailModal}
              onIncrement={handleIncrement}
              onComplete={handleComplete}
              onEdit={handleOpenEditModal}
              onToggleFavorite={handleToggleFavorite}
              onDeleteMedia={handleDeleteRequest}
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
            <LibraryControlBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              themeFilter={themeFilter}
              typeFilter={typeFilter}
              statusFilter={statusFilter}
              onThemeChange={handleThemeFilterChange}
              onTypeChange={setTypeFilter}
              onStatusChange={setStatusFilter}
              onAddMedia={handleOpenAddModal}
              resultCount={filteredMedia.length}
            />

            {/* V5A.2: Doğu seçiliyken kompakt theme header — alt filtre burada.
                Control bar'la çakışmasın diye altına yerleşiyor. */}
            {themeFilter === "east" && (
              <EastThemeHeader
                activeSub={eastSubFilter}
                onChangeSub={setEastSubFilter}
              />
            )}

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
                }: {
                  icon: typeof PlayCircle;
                  title: string;
                  count: number;
                  hint?: string;
                  // R5.1: Section başlığının sağ tarafına opsiyonel aksiyon slotu
                  // (Kütüphanem için sort + view toggle).
                  actions?: React.ReactNode;
                }) => (
                  <div className="flex items-end justify-between gap-3 mb-3 pb-2 border-b border-zinc-800/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="w-4 h-4 text-amber-400/80 shrink-0" />
                      <h2 className="text-[15px] font-semibold text-zinc-100 tracking-tight truncate">
                        {title}
                      </h2>
                      <span className="text-[11px] font-mono tabular-nums text-zinc-500 px-1.5 py-0.5 rounded-md bg-zinc-900/60 border border-zinc-800/60">
                        {count}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {hint && <span className="text-[11px] text-zinc-500">{hint}</span>}
                      {actions}
                    </div>
                  </div>
                );

                return (
                  <div className="space-y-8">
                    {/* 1) Devam Ettiklerim — in-progress slice (max 6) */}
                    {continueItems.length > 0 && (
                      <section aria-label="Devam Ettiklerim">
                        <SectionHead
                          icon={PlayCircle}
                          title="Devam Ettiklerim"
                          count={continueItems.length}
                          hint="Son aktiviteye göre"
                        />
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
                              />
                            );
                          })}
                        </div>
                      </section>
                    )}

                    {/* 2) Seri Koleksiyonlarım — group cards (2+ parça) */}
                    {seriesGroupCards.length > 0 && (
                      <section aria-label="Seri Koleksiyonlarım">
                        <SectionHead
                          icon={Layers}
                          title="Seri Koleksiyonlarım"
                          count={seriesGroupCards.length}
                        />
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
                            />
                          ))}
                        </div>
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
              subtitle="TVMaze, AniList, Open Library ve OMDb üzerinden global arama"
            />
            <div className="space-y-6">
              <GlobalSearch
                getLibraryStatus={getGlobalSearchLibraryStatus}
                onAddToLibrary={handleAddFromGlobalSearch}
              />
              <div>
                <button
                  onClick={() => setShowAdvancedSearches(!showAdvancedSearches)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/30 border border-zinc-800/60 rounded-xl text-sm font-medium text-zinc-300 hover:bg-zinc-900/50 transition-colors cursor-pointer"
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
              resetSignal={aiResetSignal}
              onAddToLibrary={handleAddFromGlobalSearch}
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

      {/* R7.1: Ayarlar bağlam-dışı kalıyor; RightRail bu sekmede gizleniyor.
          Main column otomatik olarak genişler (xl rail sütunu kaybolur). */}
      {activeTab !== "settings" && (
        <RightRail
          mediaList={mediaList}
          progressLogs={progressLogs}
          stats={dashboardStats}
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
