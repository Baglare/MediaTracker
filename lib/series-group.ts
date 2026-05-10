import { MediaItem, SeriesRelationType } from "./types";

export interface MediaItemGroup {
  key: string;
  seriesGroupId?: string;
  seriesGroupTitle?: string;
  items: MediaItem[];
  isGroup: boolean;
}

type SeriesGroupFields = Pick<
  MediaItem,
  "seriesGroupId" | "seriesGroupTitle" | "seriesRelationType" | "seasonNumber" | "orderIndex"
>;

const TVMAZE_GROUP_PREFIX = "tvmaze:";

const ANILIST_FORMAT_RELATION_MAP: Record<string, SeriesRelationType> = {
  TV: "main",
  MOVIE: "movie",
  OVA: "ova",
  ONA: "ona",
  SPECIAL: "special",
  MUSIC: "special",
};

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function parseTvSeason(item: MediaItem): Partial<SeriesGroupFields> {
  const externalId = getTvmazeShowExternalId(item);
  const title = readNonEmptyString(item.title);
  if (!externalId || !title) return {};

  const titleMatch = title.match(/^(.*)\s+-\s+Sezon\s+(\d+)$/i);
  if (!titleMatch) return {};

  const seasonNumber = getTvmazeSeasonNumber(item);
  const baseTitle = titleMatch[1]?.trim();
  if (seasonNumber === undefined || !baseTitle) {
    return {};
  }

  return {
    seriesGroupId: `${TVMAZE_GROUP_PREFIX}${externalId}`,
    seriesGroupTitle: baseTitle,
    seriesRelationType: "season",
    seasonNumber,
    orderIndex: seasonNumber,
  };
}

function inferAniListRelationType(item: MediaItem): SeriesRelationType | undefined {
  const format = readNonEmptyString(item.format)?.toUpperCase();
  if (!format) return undefined;
  return ANILIST_FORMAT_RELATION_MAP[format];
}

export function inferSeriesGroup(item: Partial<MediaItem>): Partial<SeriesGroupFields> {
  const explicit: Partial<SeriesGroupFields> = {
    seriesGroupId: readNonEmptyString(item.seriesGroupId),
    seriesGroupTitle: readNonEmptyString(item.seriesGroupTitle),
    seriesRelationType: item.seriesRelationType,
    seasonNumber: readPositiveNumber(item.seasonNumber),
    orderIndex: readPositiveNumber(item.orderIndex),
  };

  const inferred: Partial<SeriesGroupFields> = {};

  if (item.externalSource === "tvmaze") {
    Object.assign(inferred, parseTvSeason(item as MediaItem));
  }

  if (!explicit.seriesRelationType && item.externalSource === "anilist") {
    const relationType = inferAniListRelationType(item as MediaItem);
    if (relationType) {
      inferred.seriesRelationType = relationType;
    }
  }

  return {
    seriesGroupId: explicit.seriesGroupId ?? inferred.seriesGroupId,
    seriesGroupTitle: explicit.seriesGroupTitle ?? inferred.seriesGroupTitle,
    seriesRelationType: explicit.seriesRelationType ?? inferred.seriesRelationType,
    seasonNumber: explicit.seasonNumber ?? inferred.seasonNumber,
    orderIndex: explicit.orderIndex ?? inferred.orderIndex,
  };
}

export function withInferredSeriesGroup<T extends MediaItem>(item: T): T {
  const inferred = inferSeriesGroup(item);
  return {
    ...item,
    seriesGroupId: item.seriesGroupId ?? inferred.seriesGroupId,
    seriesGroupTitle: item.seriesGroupTitle ?? inferred.seriesGroupTitle,
    seriesRelationType: item.seriesRelationType ?? inferred.seriesRelationType,
    seasonNumber: item.seasonNumber ?? inferred.seasonNumber,
    orderIndex: item.orderIndex ?? inferred.orderIndex,
  };
}

export function getTvmazeSeasonExternalId(showExternalId: string, seasonNumber: number): string {
  return `${showExternalId}-season-${seasonNumber}`;
}

export function getTvmazeShowExternalId(item: Pick<MediaItem, "externalSource" | "externalId" | "seriesGroupId">): string | undefined {
  if (item.externalSource !== "tvmaze") return undefined;

  const seriesGroupId = readNonEmptyString(item.seriesGroupId);
  if (seriesGroupId?.startsWith(TVMAZE_GROUP_PREFIX)) {
    return seriesGroupId.slice(TVMAZE_GROUP_PREFIX.length);
  }

  const externalId = readNonEmptyString(item.externalId);
  if (!externalId) return undefined;

  const externalMatch = externalId.match(/^(.*)-season-(\d+)$/i);
  return externalMatch ? externalMatch[1] : externalId;
}

export function getTvmazeSeasonNumber(item: Pick<MediaItem, "externalSource" | "externalId" | "seasonNumber">): number | undefined {
  if (item.externalSource !== "tvmaze") return undefined;
  if (typeof item.seasonNumber === "number" && Number.isFinite(item.seasonNumber) && item.seasonNumber > 0) {
    return item.seasonNumber;
  }

  const externalId = readNonEmptyString(item.externalId);
  if (!externalId) return undefined;

  const externalMatch = externalId.match(/-season-(\d+)$/i);
  if (!externalMatch) return undefined;

  const seasonNumber = Number.parseInt(externalMatch[1], 10);
  return Number.isFinite(seasonNumber) && seasonNumber > 0 ? seasonNumber : undefined;
}

export function getTvmazeExistingSeasonNumbers(items: MediaItem[], showExternalId: string): number[] {
  const existing = new Set<number>();

  for (const item of items) {
    const currentShowId = getTvmazeShowExternalId(item);
    if (currentShowId !== showExternalId) continue;

    const seasonNumber = getTvmazeSeasonNumber(item);
    if (seasonNumber !== undefined) {
      existing.add(seasonNumber);
    }
  }

  return Array.from(existing).sort((a, b) => a - b);
}

export function groupMediaItems(items: MediaItem[]): MediaItemGroup[] {
  const groups = new Map<string, MediaItemGroup>();
  const ordered: MediaItemGroup[] = [];

  for (const rawItem of items) {
    const item = withInferredSeriesGroup(rawItem);
    if (!item.seriesGroupId) {
      ordered.push({
        key: item.id,
        items: [item],
        isGroup: false,
      });
      continue;
    }

    let group = groups.get(item.seriesGroupId);
    if (!group) {
      group = {
        key: item.seriesGroupId,
        seriesGroupId: item.seriesGroupId,
        seriesGroupTitle: item.seriesGroupTitle,
        items: [],
        isGroup: true,
      };
      groups.set(item.seriesGroupId, group);
      ordered.push(group);
    }

    group.items.push(item);
    if (!group.seriesGroupTitle && item.seriesGroupTitle) {
      group.seriesGroupTitle = item.seriesGroupTitle;
    }
  }

  for (const group of ordered) {
    if (group.items.length <= 1) continue;
    group.items.sort((a, b) => {
      const aOrder = a.orderIndex ?? a.seasonNumber ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.orderIndex ?? b.seasonNumber ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.title.localeCompare(b.title, "tr");
    });
  }

  return ordered;
}
