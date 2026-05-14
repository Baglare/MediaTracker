export const RIGHT_RAIL_STORAGE_KEY = "media-tracker-right-rail-preferences";

export const RIGHT_RAIL_WIDGET_IDS = [
  "overallProgress",
  "dailyGoal",
  "suggestedContinue",
  "recentActivities",
  "upcomingEpisodes",
  "nearCompletion",
  "favoriteShowcase",
  "ratingSummary",
  "worldDistribution",
  "statusDistribution",
  "journeyMini",
  "plannedItems",
  "pausedItems",
  "notedItems",
] as const;

export type RightRailWidgetId = (typeof RIGHT_RAIL_WIDGET_IDS)[number];

export interface RightRailWidgetMeta {
  id: RightRailWidgetId;
  label: string;
  description: string;
  defaultEnabled: boolean;
  dataRequirement?: string;
}

export interface RightRailPreferences {
  order: RightRailWidgetId[];
  enabled: Record<RightRailWidgetId, boolean>;
}

export const RIGHT_RAIL_WIDGET_REGISTRY: RightRailWidgetMeta[] = [
  {
    id: "overallProgress",
    label: "Genel ilerleme",
    description: "Aktif dünyadaki durum dağılımını ve tamamlanma oranını gösterir.",
    defaultEnabled: true,
    dataRequirement: "Medya listesi",
  },
  {
    id: "dailyGoal",
    label: "Günlük hedef",
    description: "Son 7 gündeki aktivite ritmini özetler.",
    defaultEnabled: true,
    dataRequirement: "İlerleme kayıtları",
  },
  {
    id: "suggestedContinue",
    label: "Önerilen devam",
    description: "Aktif dünyada devam edilebilecek içerikleri önerir.",
    defaultEnabled: true,
    dataRequirement: "Medya listesi ve ilerleme kayıtları",
  },
  {
    id: "recentActivities",
    label: "Son aktiviteler",
    description: "Aktif dünyadaki en yeni ilerleme kayıtlarını listeler.",
    defaultEnabled: true,
    dataRequirement: "İlerleme kayıtları",
  },
  {
    id: "upcomingEpisodes",
    label: "Yaklaşan bölümler",
    description: "Yayın takvimi alanı için ayrılmış sakin bilgi kutusu.",
    defaultEnabled: true,
    dataRequirement: "Takvim entegrasyonu bağlanınca dolacak",
  },
  {
    id: "nearCompletion",
    label: "Bitişe yakın",
    description: "%75 ve üzeri ilerlemiş, tamamlanmamış içerikleri gösterir.",
    defaultEnabled: false,
    dataRequirement: "Toplam ve mevcut ilerleme",
  },
  {
    id: "favoriteShowcase",
    label: "Favori vitrini",
    description: "Favori işaretlenmiş içeriklerden küçük bir vitrin oluşturur.",
    defaultEnabled: false,
    dataRequirement: "Favori alanı ve kapak görseli",
  },
  {
    id: "ratingSummary",
    label: "Puan özeti",
    description: "Ortalama puanı, puanlanan içerik sayısını ve en yüksek puanı gösterir.",
    defaultEnabled: false,
    dataRequirement: "Kullanıcı puanları",
  },
  {
    id: "worldDistribution",
    label: "Dünya dağılımı",
    description: "Doğu, Kadraj ve Arşiv sayılarını küçük barlarla özetler.",
    defaultEnabled: false,
    dataRequirement: "Medya sınıflandırması",
  },
  {
    id: "statusDistribution",
    label: "Durum dağılımı",
    description: "Tamamlanan, devam eden, planlanan, duraklatılan ve bırakılan dağılımını gösterir.",
    defaultEnabled: false,
    dataRequirement: "Medya durumları",
  },
  {
    id: "journeyMini",
    label: "Yolculuk mini",
    description: "Level, ünvan ve XP ilerlemesini kompakt şekilde gösterir.",
    defaultEnabled: false,
    dataRequirement: "Kullanıcı ilerleme özeti",
  },
  {
    id: "plannedItems",
    label: "Planlananlar",
    description: "Planlama durumundaki içeriklerden kısa bir liste verir.",
    defaultEnabled: false,
    dataRequirement: "Medya durumları",
  },
  {
    id: "pausedItems",
    label: "Duraklatılanlar",
    description: "Ara verilmiş içerikleri hızlıca görünür kılar.",
    defaultEnabled: false,
    dataRequirement: "Medya durumları",
  },
  {
    id: "notedItems",
    label: "Notlular",
    description: "Kişisel notu olan içeriklerden kısa bir liste gösterir.",
    defaultEnabled: false,
    dataRequirement: "Kişisel not alanı",
  },
];

const KNOWN_IDS = new Set<RightRailWidgetId>(RIGHT_RAIL_WIDGET_IDS);

export const DEFAULT_RIGHT_RAIL_PREFERENCES: RightRailPreferences = {
  order: [...RIGHT_RAIL_WIDGET_IDS],
  enabled: RIGHT_RAIL_WIDGET_REGISTRY.reduce(
    (acc, widget) => {
      acc[widget.id] = widget.defaultEnabled;
      return acc;
    },
    {} as Record<RightRailWidgetId, boolean>,
  ),
};

function isWidgetId(value: unknown): value is RightRailWidgetId {
  return typeof value === "string" && KNOWN_IDS.has(value as RightRailWidgetId);
}

export function normalizeRightRailPreferences(value: unknown): RightRailPreferences {
  const input =
    typeof value === "object" && value !== null
      ? (value as Partial<{
          order: unknown;
          enabled: unknown;
        }>)
      : {};

  const seen = new Set<RightRailWidgetId>();
  const order = Array.isArray(input.order)
    ? input.order.filter((id): id is RightRailWidgetId => {
        if (!isWidgetId(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
    : [];

  for (const id of RIGHT_RAIL_WIDGET_IDS) {
    if (!seen.has(id)) order.push(id);
  }

  const enabledInput =
    typeof input.enabled === "object" && input.enabled !== null
      ? (input.enabled as Record<string, unknown>)
      : {};
  const enabled = { ...DEFAULT_RIGHT_RAIL_PREFERENCES.enabled };

  for (const id of RIGHT_RAIL_WIDGET_IDS) {
    if (typeof enabledInput[id] === "boolean") {
      enabled[id] = enabledInput[id];
    }
  }

  return { order, enabled };
}

export function loadRightRailPreferences(): RightRailPreferences {
  if (typeof window === "undefined") return DEFAULT_RIGHT_RAIL_PREFERENCES;

  try {
    const raw = window.localStorage.getItem(RIGHT_RAIL_STORAGE_KEY);
    if (!raw) return DEFAULT_RIGHT_RAIL_PREFERENCES;
    return normalizeRightRailPreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_RIGHT_RAIL_PREFERENCES;
  }
}

export function saveRightRailPreferences(preferences: RightRailPreferences): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      RIGHT_RAIL_STORAGE_KEY,
      JSON.stringify(normalizeRightRailPreferences(preferences)),
    );
  } catch {
    // localStorage kullanılamıyorsa tercih kaydı sessizce atlanır.
  }
}

export function resetRightRailPreferences(): RightRailPreferences {
  return {
    order: [...DEFAULT_RIGHT_RAIL_PREFERENCES.order],
    enabled: { ...DEFAULT_RIGHT_RAIL_PREFERENCES.enabled },
  };
}
