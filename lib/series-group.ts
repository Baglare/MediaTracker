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
  const externalId = readNonEmptyString(item.externalId);
  const title = readNonEmptyString(item.title);
  if (!externalId || !title) return {};

  const externalMatch = externalId.match(/^(.*)-season-(\d+)$/i);
  const titleMatch = title.match(/^(.*)\s+-\s+Sezon\s+(\d+)$/i);
  if (!externalMatch || !titleMatch) return {};

  const seasonNumber = Number.parseInt(externalMatch[2], 10);
  const baseTitle = titleMatch[1]?.trim();
  if (!Number.isFinite(seasonNumber) || seasonNumber <= 0 || !baseTitle) {
    return {};
  }

  return {
    seriesGroupId: `tvmaze:${externalMatch[1]}`,
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
