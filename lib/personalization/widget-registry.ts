import {
  DASHBOARD_WIDGET_IDS,
  RIGHT_RAIL_WIDGET_IDS,
  type DashboardWidgetId,
  type RightRailWidgetId,
  type WidgetDefinition,
} from "./layout-types";

export const DASHBOARD_WIDGET_REGISTRY: readonly WidgetDefinition<DashboardWidgetId>[] = [
  {
    id: "summary",
    label: "Kütüphane özeti",
    description: "Tamamlanma oranı ve temel kütüphane metrikleri.",
    defaultVisible: true,
    defaultOrder: 0,
    required: true,
    allowedSurfaces: ["dashboard"],
    desktopSpan: "full",
    mobileOrder: 0,
    dataRequirement: "Kütüphane istatistikleri",
  },
  {
    id: "continue",
    label: "Devam ettiklerin",
    description: "Son aktivitene göre devam edebileceğin içerikler.",
    defaultVisible: true,
    defaultOrder: 1,
    allowedSurfaces: ["dashboard"],
    desktopSpan: "wide",
    mobileOrder: 1,
    dataRequirement: "Medya ve ilerleme kayıtları",
  },
  {
    id: "recent-activity",
    label: "Son aktiviteler",
    description: "En yeni ilerleme hareketlerinin kısa özeti.",
    defaultVisible: true,
    defaultOrder: 2,
    allowedSurfaces: ["dashboard"],
    desktopSpan: "narrow",
    mobileOrder: 2,
    dataRequirement: "İlerleme kayıtları",
  },
  {
    id: "near-completion",
    label: "Bitirmeye yakın",
    description: "İlerlemesi yüzde 75 ve üzerindeki açık içerikler.",
    defaultVisible: true,
    defaultOrder: 3,
    allowedSurfaces: ["dashboard"],
    desktopSpan: "wide",
    mobileOrder: 3,
    dataRequirement: "Medya ilerlemesi",
  },
  {
    id: "world-distribution",
    label: "Dünya dağılımı",
    description: "Doğu, Kadraj ve Arşiv içeriklerinin dağılımı.",
    defaultVisible: true,
    defaultOrder: 4,
    allowedSurfaces: ["dashboard"],
    desktopSpan: "narrow",
    mobileOrder: 4,
    dataRequirement: "Medya sınıflandırması",
  },
  {
    id: "high-rated",
    label: "Puanı yüksekler",
    description: "En yüksek kullanıcı puanına sahip içerikler.",
    defaultVisible: true,
    defaultOrder: 5,
    allowedSurfaces: ["dashboard"],
    desktopSpan: "wide",
    mobileOrder: 5,
    dataRequirement: "Kullanıcı puanları",
  },
  {
    id: "status-distribution",
    label: "Durum dağılımı",
    description: "Kütüphane durumlarının sayısal dağılımı.",
    defaultVisible: true,
    defaultOrder: 6,
    allowedSurfaces: ["dashboard"],
    desktopSpan: "narrow",
    mobileOrder: 6,
    dataRequirement: "Medya durumları",
  },
  {
    id: "favorite-showcase",
    label: "Favorilerden seçki",
    description: "Yakın zamanda etkin olduğun favori içeriklerden vitrin.",
    defaultVisible: true,
    defaultOrder: 7,
    allowedSurfaces: ["dashboard"],
    desktopSpan: "narrow",
    mobileOrder: 7,
    dataRequirement: "Favori içerikler",
  },
] as const;

export const RIGHT_RAIL_WIDGET_REGISTRY: readonly WidgetDefinition<RightRailWidgetId>[] = [
  ["overallProgress", "Genel ilerleme", "Aktif dünyadaki durum dağılımını ve tamamlanma oranını gösterir.", true, "Medya listesi"],
  ["dailyGoal", "Günlük hedef", "Son 7 gündeki aktivite ritmini özetler.", true, "İlerleme kayıtları"],
  ["suggestedContinue", "Önerilen devam", "Aktif dünyada devam edilebilecek içerikleri önerir.", true, "Medya listesi ve ilerleme kayıtları"],
  ["recentActivities", "Son aktiviteler", "Aktif dünyadaki en yeni ilerleme kayıtlarını listeler.", true, "İlerleme kayıtları"],
  ["upcomingEpisodes", "Yaklaşan bölümler", "Yayın takvimi alanı için ayrılmış sakin bilgi kutusu.", true, "Takvim entegrasyonu bağlanınca dolacak"],
  ["nearCompletion", "Bitişe yakın", "%75 ve üzeri ilerlemiş, tamamlanmamış içerikleri gösterir.", false, "Toplam ve mevcut ilerleme"],
  ["favoriteShowcase", "Favori vitrini", "Favori işaretlenmiş içeriklerden küçük bir vitrin oluşturur.", false, "Favori alanı ve kapak görseli"],
  ["ratingSummary", "Puan özeti", "Ortalama puanı, puanlanan içerik sayısını ve en yüksek puanı gösterir.", false, "Kullanıcı puanları"],
  ["worldDistribution", "Dünya dağılımı", "Doğu, Kadraj ve Arşiv sayılarını küçük barlarla özetler.", false, "Medya sınıflandırması"],
  ["statusDistribution", "Durum dağılımı", "Tamamlanan, devam eden, planlanan, duraklatılan ve bırakılan dağılımını gösterir.", false, "Medya durumları"],
  ["journeyMini", "Yolculuk mini", "Level, ünvan ve XP ilerlemesini kompakt şekilde gösterir.", false, "Kullanıcı ilerleme özeti"],
  ["plannedItems", "Planlananlar", "Planlama durumundaki içeriklerden kısa bir liste verir.", false, "Medya durumları"],
  ["pausedItems", "Duraklatılanlar", "Ara verilmiş içerikleri hızlıca görünür kılar.", false, "Medya durumları"],
  ["notedItems", "Notlular", "Kişisel notu olan içeriklerden kısa bir liste gösterir.", false, "Kişisel not alanı"],
].map(([id, label, description, defaultVisible, dataRequirement], defaultOrder) => ({
  id: id as RightRailWidgetId,
  label: label as string,
  description: description as string,
  defaultVisible: defaultVisible as boolean,
  defaultOrder,
  allowedSurfaces: ["rightRail"] as const,
  desktopSpan: "full" as const,
  mobileOrder: defaultOrder,
  dataRequirement: dataRequirement as string,
}));

export function getWidgetDefinition<TId extends string>(
  registry: readonly WidgetDefinition<TId>[],
  id: TId,
): WidgetDefinition<TId> | undefined {
  return registry.find((widget) => widget.id === id);
}

export function isDashboardWidgetId(value: unknown): value is DashboardWidgetId {
  return typeof value === "string" && DASHBOARD_WIDGET_IDS.includes(value as DashboardWidgetId);
}

export function isRightRailWidgetId(value: unknown): value is RightRailWidgetId {
  return typeof value === "string" && RIGHT_RAIL_WIDGET_IDS.includes(value as RightRailWidgetId);
}
